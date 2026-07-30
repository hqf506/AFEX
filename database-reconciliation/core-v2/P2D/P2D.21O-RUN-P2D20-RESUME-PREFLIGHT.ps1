[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

$PsqlPath = 'C:\Program Files\PostgreSQL\18\bin\psql.exe'
$PackageDirectory = $PSScriptRoot
$EvidenceDirectory = Join-Path $PackageDirectory 'evidence'
$PreflightFile = 'P2D.21O-P2D20-RESUME-PREFLIGHT.sql'
$FinalMarker = 'P2D21O_900_P2D20_RESUME_PREFLIGHT_OK'
$PgpassPath = $null
$DatabasePassword = $null
$PreviousPgpassFile = $env:PGPASSFILE
$PreviousPgsslMode = $env:PGSSLMODE
$PreviousPgpassword = $env:PGPASSWORD

$ExpectedHashes = [ordered]@{
    'P2D.21O-P2D20-RESUME-PREFLIGHT.sql' = '23fb25db84bc5db0135750bb1bb3a297d185e6cbb79a5a6f13f75d4c40edf473'
    'P2D.19-POST-INSTALL-ATTESTATION.sql' = '08d0d160ddd3c7f43889a88124b7d10e04ac05aad3e628350bcd4a3e0b728273'
}

function Stop-FailClosed([string]$Message) {
    throw "P2D.21O preflight stopped fail-closed: $Message"
}

function Initialize-PostgresCredentialContext {
    try {
        $Uri = [System.Uri]::new(
            $env:SUPABASE_DB_URL,
            [System.UriKind]::Absolute
        )
    } catch {
        Stop-FailClosed 'SUPABASE_DB_URL is not a valid absolute PostgreSQL URL'
    }
    if ($Uri.Scheme -notin @('postgres', 'postgresql') -or
        [string]::IsNullOrWhiteSpace($Uri.Host) -or
        $Uri.Port -le 0 -or
        [string]::IsNullOrWhiteSpace($Uri.UserInfo) -or
        -not [string]::IsNullOrWhiteSpace($Uri.Fragment)) {
        Stop-FailClosed 'SUPABASE_DB_URL is incomplete or ambiguous'
    }
    $Separator = $Uri.UserInfo.IndexOf(':')
    if ($Separator -le 0 -or $Separator -eq ($Uri.UserInfo.Length - 1)) {
        Stop-FailClosed 'SUPABASE_DB_URL credentials are incomplete'
    }
    $Database = [System.Uri]::UnescapeDataString(
        $Uri.AbsolutePath.TrimStart('/')
    )
    $Username = [System.Uri]::UnescapeDataString(
        $Uri.UserInfo.Substring(0, $Separator)
    )
    $script:DatabasePassword = [System.Uri]::UnescapeDataString(
        $Uri.UserInfo.Substring($Separator + 1)
    )
    $SslMode = $null
    foreach ($Pair in $Uri.Query.TrimStart('?').Split('&')) {
        if ([string]::IsNullOrWhiteSpace($Pair)) {
            continue
        }
        $Parts = $Pair.Split('=', 2)
        $Name = [System.Uri]::UnescapeDataString($Parts[0])
        $Value = if ($Parts.Count -eq 2) {
            [System.Uri]::UnescapeDataString($Parts[1])
        } else {
            ''
        }
        if ($Name -cne 'sslmode' -or $null -ne $SslMode) {
            Stop-FailClosed 'unsupported or ambiguous connection options'
        }
        $SslMode = $Value
    }
    if ($SslMode -notin @('require', 'verify-ca', 'verify-full')) {
        Stop-FailClosed 'an approved SSL mode is required'
    }

    $script:PgpassPath = Join-Path (
        [System.IO.Path]::GetTempPath()
    ) ("afex-pgpass-{0}.conf" -f [System.Guid]::NewGuid().ToString('N'))
    $Identity = [System.Security.Principal.WindowsIdentity]::GetCurrent()
    $Security = [System.Security.AccessControl.FileSecurity]::new()
    $Security.SetOwner($Identity.User)
    $Security.SetAccessRuleProtection($true, $false)
    $Security.AddAccessRule(
        [System.Security.AccessControl.FileSystemAccessRule]::new(
            $Identity.User,
            [System.Security.AccessControl.FileSystemRights]::FullControl,
            [System.Security.AccessControl.AccessControlType]::Allow
        )
    )
    $Stream = [System.IO.File]::Open(
        $script:PgpassPath,
        [System.IO.FileMode]::CreateNew,
        [System.IO.FileAccess]::ReadWrite,
        [System.IO.FileShare]::None
    )
    try {
        [System.IO.File]::SetAccessControl($script:PgpassPath, $Security)
        $Escape = {
            param([string]$Value)
            $Value.Replace('\', '\\').Replace(':', '\:')
        }
        $Line = @(
            & $Escape $Uri.Host
            $Uri.Port
            & $Escape $Database
            & $Escape $Username
            & $Escape $script:DatabasePassword
        ) -join ':'
        $Writer = [System.IO.StreamWriter]::new(
            $Stream,
            [System.Text.UTF8Encoding]::new($false)
        )
        try {
            $Writer.WriteLine($Line)
            $Writer.Flush()
        } finally {
            $Writer.Dispose()
        }
    } finally {
        if ($Stream) {
            $Stream.Dispose()
        }
    }
    $env:PGPASSFILE = $script:PgpassPath
    $env:PGSSLMODE = $SslMode
    $env:PGPASSWORD = $null
    @{
        Host = $Uri.Host
        Port = $Uri.Port
        Database = $Database
        Username = $Username
    }
}

function Clear-PostgresCredentialContext {
    $script:DatabasePassword = $null
    try {
        if ($script:PgpassPath) {
            Remove-Item -LiteralPath $script:PgpassPath -Force
        }
    } finally {
        $script:PgpassPath = $null
        $env:PGPASSFILE = $PreviousPgpassFile
        $env:PGSSLMODE = $PreviousPgsslMode
        $env:PGPASSWORD = $PreviousPgpassword
    }
}

if ([string]::IsNullOrWhiteSpace($env:SUPABASE_DB_URL)) {
    Stop-FailClosed 'SUPABASE_DB_URL is required'
}
if ([string]::IsNullOrWhiteSpace(
        $env:AFEX_EXPECTED_PRODUCTION_DATABASE
    ) -or [string]::IsNullOrWhiteSpace(
        $env:AFEX_EXPECTED_PRODUCTION_USER
    )) {
    Stop-FailClosed 'approved Production identities are required'
}
if (-not (Test-Path -LiteralPath $PsqlPath -PathType Leaf)) {
    Stop-FailClosed 'reviewed psql client is missing'
}
$PsqlVersion = (& $PsqlPath --version 2>&1 | Out-String).Trim()
if ($LASTEXITCODE -ne 0 -or
    $PsqlVersion -cne 'psql (PostgreSQL) 18.4') {
    Stop-FailClosed 'exact PostgreSQL 18.4 psql client is required'
}

$PreflightPath = Join-Path $PackageDirectory $PreflightFile
foreach ($Artifact in $ExpectedHashes.GetEnumerator()) {
    $ArtifactPath = Join-Path $PackageDirectory $Artifact.Key
    $ActualHash = (
        Get-FileHash -LiteralPath $ArtifactPath -Algorithm SHA256
    ).Hash.ToLowerInvariant()
    if ($ActualHash -cne $Artifact.Value) {
        Stop-FailClosed "SHA-256 mismatch: $($Artifact.Key)"
    }
    Write-Host "HASH PASS: $($Artifact.Key)"
}

New-Item -ItemType Directory -Force -Path $EvidenceDirectory | Out-Null
$Timestamp = [DateTimeOffset]::Now.ToString('yyyyMMdd-HHmmss-fff')
$StdoutPath = Join-Path $EvidenceDirectory (
    "P2D.21O-resume-preflight-$Timestamp.stdout.txt"
)
$StderrPath = Join-Path $EvidenceDirectory (
    "P2D.21O-resume-preflight-$Timestamp.stderr.txt"
)
$SummaryPath = Join-Path $EvidenceDirectory (
    "P2D.21O-resume-preflight-$Timestamp.summary.txt"
)
$ConnectionUrlForParent = $env:SUPABASE_DB_URL
$Connection = $null
try {
    $Connection = Initialize-PostgresCredentialContext
    $Arguments = @(
        '--no-psqlrc'
        "--host=$($Connection.Host)"
        "--port=$($Connection.Port)"
        "--dbname=$($Connection.Database)"
        "--username=$($Connection.Username)"
        '--set=ON_ERROR_STOP=1'
        "--set=AFEX_EXPECTED_DATABASE=$($env:AFEX_EXPECTED_PRODUCTION_DATABASE)"
        "--set=AFEX_EXPECTED_USER=$($env:AFEX_EXPECTED_PRODUCTION_USER)"
        "--file=$PreflightPath"
    )
    $env:SUPABASE_DB_URL = $null
    $SavedPreference = $ErrorActionPreference
    try {
        $ErrorActionPreference = 'Continue'
        & $PsqlPath @Arguments 1> $StdoutPath 2> $StderrPath
        $ExitCode = $LASTEXITCODE
    } finally {
        $ErrorActionPreference = $SavedPreference
        $env:SUPABASE_DB_URL = $ConnectionUrlForParent
    }
    $MarkerFound = Select-String -LiteralPath (
        $StdoutPath, $StderrPath
    ) -SimpleMatch $FinalMarker -Quiet
    @(
        "psql_exit_code=$ExitCode"
        "final_marker=$FinalMarker"
        "final_marker_found=$MarkerFound"
        "stdout_file=$([System.IO.Path]::GetFileName($StdoutPath))"
        "stderr_file=$([System.IO.Path]::GetFileName($StderrPath))"
    ) | Set-Content -LiteralPath $SummaryPath -Encoding utf8
    if ($ExitCode -ne 0) {
        Stop-FailClosed "psql returned exit code $ExitCode"
    }
    if (-not $MarkerFound) {
        Stop-FailClosed 'required PASS marker is absent'
    }
    Write-Host $FinalMarker
} finally {
    Clear-PostgresCredentialContext
}
