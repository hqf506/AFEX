[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$Base = Split-Path -Parent $MyInvocation.MyCommand.Path
$ManifestPath = Join-Path $Base 'P2D.21B-ISOLATED-TEST-RUNBOOK.md'
$EvidenceRoot = Join-Path $Base 'evidence'
$RunId = (Get-Date).ToUniversalTime().ToString('yyyyMMddTHHmmssZ')
$EvidenceDir = Join-Path $EvidenceRoot "P2D21B-$RunId"

function Stop-FailClosed([string]$Message) {
    throw "P2D.21B stopped fail-closed: $Message"
}

if ([string]::IsNullOrWhiteSpace($env:AFEX_PG17_TEST_URL)) {
    Stop-FailClosed 'AFEX_PG17_TEST_URL is required.'
}
if ($env:SUPABASE_DB_URL) {
    Stop-FailClosed 'SUPABASE_DB_URL must be unset for this isolated run.'
}

try {
    $DatabaseUri = [System.Uri]$env:AFEX_PG17_TEST_URL
} catch {
    Stop-FailClosed 'AFEX_PG17_TEST_URL is not a valid URI.'
}
if ($DatabaseUri.Scheme -notin @('postgres', 'postgresql')) {
    Stop-FailClosed 'AFEX_PG17_TEST_URL must use postgres or postgresql.'
}
if ($DatabaseUri.Host -notin @('localhost', '127.0.0.1')) {
    Stop-FailClosed 'AFEX_PG17_TEST_URL must target localhost or 127.0.0.1.'
}
if ([string]::IsNullOrWhiteSpace($DatabaseUri.AbsolutePath) -or
    $DatabaseUri.AbsolutePath -eq '/') {
    Stop-FailClosed 'AFEX_PG17_TEST_URL must name a disposable database.'
}

$Psql = (Get-Command psql -ErrorAction Stop).Source
$PsqlVersion = (& $Psql --version 2>&1 | Out-String).Trim()
if ($LASTEXITCODE -ne 0 -or $PsqlVersion -notmatch 'psql \(PostgreSQL\) (17|18)\.') {
    Stop-FailClosed 'PostgreSQL 17 or compatible PostgreSQL 18 psql is required.'
}

New-Item -ItemType Directory -Path $EvidenceDir -Force | Out-Null

$Manifest = @{}
Get-Content -LiteralPath $ManifestPath | ForEach-Object {
    if ($_ -match '^\|\s*([^|]+?)\s*\|\s*`([0-9a-f]{64})`\s*\|') {
        $Manifest[$Matches[1].Trim()] = $Matches[2]
    }
}

$Artifacts = @(
    'P2D.21B-POSTGRESQL-17.6-CLONE-SETUP.sql',
    'P2D.21B-CANONICALIZATION-TEST-VECTORS.sql',
    'P2D.21B-SECURITY-CONCURRENCY-TESTS.sql',
    'P2D.21B-RUN-ISOLATED-17.6-TESTS.ps1',
    'P2D.15-FRESH.sql',
    'P2D.19-DURABLE-IMMUTABLE-PAYLOAD-STORAGE.sql',
    'P2D.19-POST-INSTALL-ATTESTATION.sql',
    'P2D.20-TRUSTED-ATOMIC-ACQUISITION.sql',
    'P2D.20-POST-INSTALL-ATTESTATION.sql'
)
foreach ($Name in $Artifacts) {
    $Path = Join-Path $Base $Name
    if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
        Stop-FailClosed "artifact missing: $Name"
    }
    if (-not $Manifest.ContainsKey($Name)) {
        Stop-FailClosed "manifest hash missing: $Name"
    }
    $Actual = (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToLowerInvariant()
    if ($Actual -ne $Manifest[$Name]) {
        Stop-FailClosed "artifact hash mismatch: $Name"
    }
}
$RunbookHash = (Get-FileHash -LiteralPath $ManifestPath -Algorithm SHA256).Hash.ToLowerInvariant()
Set-Content -LiteralPath (Join-Path $EvidenceDir 'runbook-sha256.txt') `
    -Value $RunbookHash -Encoding ascii

function New-CompatibilityCopy([string]$Name) {
    $Source = Join-Path $Base $Name
    $Target = Join-Path $EvidenceDir ("TEST-ONLY-" + $Name)
    $Text = [System.IO.File]::ReadAllText($Source)
    $Count = ([regex]::Matches(
        $Text,
        "current_setting\('server_version_num'\)::integer < 180000"
    )).Count
    if ($Count -ne 1) {
        Stop-FailClosed "unexpected version-gate count in $Name"
    }
    $Text = $Text.Replace(
        "current_setting('server_version_num')::integer < 180000",
        "current_setting('server_version_num')::integer < 170006"
    )
    [System.IO.File]::WriteAllText(
        $Target,
        $Text,
        [System.Text.UTF8Encoding]::new($false)
    )
    return $Target
}

$Compat15 = Join-Path $Base 'P2D.15-FRESH.sql'
$Compat19 = New-CompatibilityCopy 'P2D.19-DURABLE-IMMUTABLE-PAYLOAD-STORAGE.sql'
$Compat19A = New-CompatibilityCopy 'P2D.19-POST-INSTALL-ATTESTATION.sql'
$Compat20 = New-CompatibilityCopy 'P2D.20-TRUSTED-ATOMIC-ACQUISITION.sql'
$Compat20A = New-CompatibilityCopy 'P2D.20-POST-INSTALL-ATTESTATION.sql'

function Invoke-PsqlFile(
    [string]$Label,
    [string]$Path,
    [string[]]$Variables = @()
) {
    $Out = Join-Path $EvidenceDir "$Label.stdout.txt"
    $Err = Join-Path $EvidenceDir "$Label.stderr.txt"
    $Args = @(
        "--dbname=$($env:AFEX_PG17_TEST_URL)",
        '--set=ON_ERROR_STOP=1',
        '--no-psqlrc',
        "--file=$Path"
    )
    foreach ($Variable in $Variables) {
        $Args += "--set=$Variable"
    }
    & $Psql @Args 1> $Out 2> $Err
    $Code = $LASTEXITCODE
    Add-Content -LiteralPath (Join-Path $EvidenceDir 'exit-codes.txt') `
        -Value "$Label=$Code"
    if ($Code -ne 0) {
        Stop-FailClosed "$Label failed; inspect redacted evidence files."
    }
}

# Exact isolated order. Production source files are never edited.
Invoke-PsqlFile '010-clone-setup' (Join-Path $Base 'P2D.21B-POSTGRESQL-17.6-CLONE-SETUP.sql')
Invoke-PsqlFile '020-foundation' $Compat15
Invoke-PsqlFile '030-p2d19' $Compat19
Invoke-PsqlFile '040-p2d19-attestation' $Compat19A
Invoke-PsqlFile '050-p2d20' $Compat20
Invoke-PsqlFile '060-p2d20-attestation' $Compat20A
Invoke-PsqlFile '070-canonical-vectors' (Join-Path $Base 'P2D.21B-CANONICALIZATION-TEST-VECTORS.sql')
Invoke-PsqlFile '080-security-catalog' `
    (Join-Path $Base 'P2D.21B-SECURITY-CONCURRENCY-TESTS.sql') `
    @('TEST_PHASE=security')
Invoke-PsqlFile '081-concurrency-fixture' `
    (Join-Path $Base 'P2D.21B-SECURITY-CONCURRENCY-TESTS.sql') `
    @('TEST_PHASE=fixture')

$CallTemplate = @'
\set ON_ERROR_STOP on
BEGIN;
SET SESSION AUTHORIZATION {0};
SET ROLE afex_core_runtime;
WITH payload AS (
    SELECT p2d21b.valid_payload('{1}') AS value
),
projection AS (
    SELECT
        value,
        p2d21b.fingerprint_projection(value) AS fingerprint_value
    FROM payload
)
SELECT result.acquisition_result
FROM projection
CROSS JOIN LATERAL public.acquire_atomic_order_command_v1(
    '30000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000001',
    '20000000-0000-4000-8000-000000000001',
    '{2}',
    '{3}',
    public.canonicalize_atomic_order_json_v1(projection.value),
    public.canonicalize_atomic_order_json_v1(
        projection.fingerprint_value
    ),
    transaction_timestamp() + interval '7 days'
) AS result;
COMMIT;
'@

function Write-CallFile(
    [string]$Name,
    [string]$Identity,
    [string]$Channel,
    [string]$Key,
    [string]$Reference
) {
    $Path = Join-Path $EvidenceDir "$Name.sql"
    $Body = $CallTemplate -f $Identity, $Channel, $Key, $Reference
    [System.IO.File]::WriteAllText(
        $Path,
        $Body,
        [System.Text.UTF8Encoding]::new($false)
    )
    return $Path
}

$CallA = Write-CallFile 'concurrent-a' 'p2d21b_runtime_a' 'pos' `
    'p2d21b-concurrent-same-key' 'p2d21b-concurrent-a'
$CallB = Write-CallFile 'concurrent-b' 'p2d21b_runtime_b' 'pos' `
    'p2d21b-concurrent-same-key' 'p2d21b-concurrent-b'
$OutA = Join-Path $EvidenceDir 'concurrent-a.stdout.csv'
$ErrA = Join-Path $EvidenceDir 'concurrent-a.stderr.txt'
$OutB = Join-Path $EvidenceDir 'concurrent-b.stdout.csv'
$ErrB = Join-Path $EvidenceDir 'concurrent-b.stderr.txt'
$CommonArgs = @(
    "--dbname=$($env:AFEX_PG17_TEST_URL)",
    '--set=ON_ERROR_STOP=1',
    '--no-psqlrc',
    '--quiet',
    '--csv',
    '--tuples-only'
)
$ProcessA = Start-Process -FilePath $Psql -ArgumentList (
    $CommonArgs + "--file=$CallA"
) -RedirectStandardOutput $OutA -RedirectStandardError $ErrA -PassThru
$ProcessB = Start-Process -FilePath $Psql -ArgumentList (
    $CommonArgs + "--file=$CallB"
) -RedirectStandardOutput $OutB -RedirectStandardError $ErrB -PassThru
$ProcessA.WaitForExit()
$ProcessB.WaitForExit()
if ($ProcessA.ExitCode -ne 0 -or $ProcessB.ExitCode -ne 0) {
    Stop-FailClosed 'concurrent acquisition session failed.'
}
$ConcurrentResults = @(
    (Get-Content -LiteralPath $OutA -Raw).Trim(),
    (Get-Content -LiteralPath $OutB -Raw).Trim()
)
if (($ConcurrentResults | Where-Object { $_ -eq 'created' }).Count -ne 1) {
    Stop-FailClosed 'concurrency did not produce exactly one created result.'
}
if (($ConcurrentResults | Where-Object {
    $_ -in @('in_progress', 'replay')
}).Count -ne 1) {
    Stop-FailClosed 'concurrent peer did not produce in_progress/replay.'
}

$ConflictCall = Write-CallFile 'fingerprint-conflict' `
    'p2d21b_runtime_a' 'api' 'p2d21b-concurrent-same-key' `
    'p2d21b-conflict'
$ConflictOut = Join-Path $EvidenceDir 'fingerprint-conflict.stdout.csv'
$ConflictErr = Join-Path $EvidenceDir 'fingerprint-conflict.stderr.txt'
& $Psql @CommonArgs "--file=$ConflictCall" 1> $ConflictOut 2> $ConflictErr
if ($LASTEXITCODE -ne 0 -or
    (Get-Content -LiteralPath $ConflictOut -Raw).Trim() -ne
        'fingerprint_conflict') {
    Stop-FailClosed 'fingerprint-conflict disposition mismatch.'
}

$RollbackCall = Write-CallFile 'rollback-payload' `
    'p2d21b_runtime_a' 'pos' 'p2d21b-rollback-key' 'p2d21b-rollback'
$RollbackBody = [System.IO.File]::ReadAllText($RollbackCall)
$RollbackBody = $RollbackBody.Replace('COMMIT;', 'SELECT 1 / 0;')
[System.IO.File]::WriteAllText(
    $RollbackCall,
    $RollbackBody,
    [System.Text.UTF8Encoding]::new($false)
)
$RollbackOut = Join-Path $EvidenceDir 'rollback-payload.stdout.txt'
$RollbackErr = Join-Path $EvidenceDir 'rollback-payload.stderr.txt'
& $Psql @CommonArgs "--file=$RollbackCall" 1> $RollbackOut 2> $RollbackErr
if ($LASTEXITCODE -eq 0) {
    Stop-FailClosed 'rollback injection unexpectedly succeeded.'
}
@(
    'created',
    'in_progress_or_replay',
    'fingerprint_conflict',
    'rollback_no_orphans'
) | Set-Content -LiteralPath (
    Join-Path $EvidenceDir 'concurrency-results.csv'
) -Encoding utf8NoBOM

Invoke-PsqlFile '090-concurrency-integrity' `
    (Join-Path $Base 'P2D.21B-SECURITY-CONCURRENCY-TESTS.sql') `
    @('TEST_PHASE=integrity')

$RequiredMarkers = @{
    '010-clone-setup.stdout.txt' = 'P2D21B_100_CLONE_SETUP_OK'
    '070-canonical-vectors.stdout.txt' = 'P2D21B_300_CANONICALIZATION_OK'
    '080-security-catalog.stdout.txt' = 'P2D21B_500_SECURITY_CATALOG_OK'
    '090-concurrency-integrity.stdout.txt' = 'P2D21B_800_CONCURRENCY_INTEGRITY_OK'
}
foreach ($Pair in $RequiredMarkers.GetEnumerator()) {
    $Text = Get-Content -LiteralPath (Join-Path $EvidenceDir $Pair.Key) -Raw
    if ($Text -notmatch [regex]::Escape($Pair.Value)) {
        Stop-FailClosed "PASS marker missing: $($Pair.Value)"
    }
}

$Summary = Join-Path $EvidenceDir 'final-summary.txt'
@(
    "run_id=$RunId",
    "psql=$PsqlVersion",
    'database_host=LOCALHOST_REDACTED',
    'P2D21B_900_POSTGRESQL_17_6_COMPATIBILITY_OK'
) | Set-Content -LiteralPath $Summary -Encoding utf8NoBOM

Write-Output "Evidence: $EvidenceDir"
Write-Output 'P2D21B_900_POSTGRESQL_17_6_COMPATIBILITY_OK'
