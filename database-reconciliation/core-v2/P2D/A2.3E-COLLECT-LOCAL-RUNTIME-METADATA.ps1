[CmdletBinding()]
param()

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

$ExpectedRepositoryName = 'leather-fix-erp-clean'
$ExpectedRelativeScriptPath = 'database-reconciliation\core-v2\P2D\A2.3E-COLLECT-LOCAL-RUNTIME-METADATA.ps1'
$ApprovedEnvironmentNames = @(
    'NEXT_PUBLIC_SUPABASE_URL',
    'NEXT_PUBLIC_SUPABASE_ANON_KEY',
    'SUPABASE_URL',
    'SUPABASE_SERVICE_ROLE_KEY',
    'SUPABASE_DB_URL',
    'VERCEL',
    'VERCEL_ENV',
    'VERCEL_REGION',
    'NODE_ENV'
)
$NetworkCommands = @(
    'Invoke-WebRequest', 'Invoke-RestMethod', 'curl', 'curl.exe', 'wget',
    'wget.exe', 'ssh', 'ssh.exe', 'scp', 'scp.exe', 'vercel', 'vercel.exe',
    'supabase', 'supabase.exe', 'psql', 'psql.exe', 'sqlcmd', 'sqlcmd.exe'
)
$GitWriteSubcommands = @(
    'add', 'am', 'apply', 'bisect', 'checkout', 'cherry-pick',
    'clean', 'clone', 'commit', 'fetch', 'gc', 'init', 'merge', 'mv', 'pull',
    'push', 'rebase', 'reset', 'restore', 'revert', 'rm', 'stash', 'switch',
    'tag', 'worktree'
)

$RepositoryRoot = $null
$EvidenceDirectory = $null
$StdoutPath = $null
$StderrPath = $null
$SummaryPath = $null
$RunId = [DateTime]::UtcNow.ToString('yyyyMMddTHHmmssfffZ')
$Result = 'FAIL'
$Failure = $null
$FailureStage = 'evidence_initialization'

function Write-EvidenceLine {
    param([Parameter(Mandatory = $true)][string]$Value)
    $IsApprovedPresence = $false
    foreach ($EnvironmentName in $ApprovedEnvironmentNames) {
        if ($Value -ceq "$EnvironmentName=SET" -or $Value -ceq "$EnvironmentName=MISSING") {
            $IsApprovedPresence = $true
            break
        }
    }
    if (-not $IsApprovedPresence -and
        ($Value -match '://|-----BEGIN [A-Z ]+PRIVATE KEY-----|(?i)(password|token|secret|api[_-]?key|service[_-]?role[_-]?key)=')) {
        throw 'Collector refused a secret-like or complete-URL evidence value.'
    }
    Add-Content -LiteralPath $script:StdoutPath -Value $Value -Encoding utf8
}

function Get-SafeCommandText {
    param([Parameter(Mandatory = $true)][scriptblock]$Command)
    $PreviousPreference = $ErrorActionPreference
    try {
        $ErrorActionPreference = 'Continue'
        $Output = & $Command 2>&1 | Out-String
        $Code = $LASTEXITCODE
    } finally {
        $ErrorActionPreference = $PreviousPreference
    }
    if ($Code -ne 0) {
        throw "Local metadata command failed with exit code $Code."
    }
    return $Output.Trim()
}

function Get-NormalizedLocalPath {
    param([Parameter(Mandatory = $true)][string]$Path)
    $FullPath = [IO.Path]::GetFullPath($Path)
    $PathRoot = [IO.Path]::GetPathRoot($FullPath)
    if ($FullPath.Length -gt $PathRoot.Length) {
        $FullPath = $FullPath.TrimEnd([char[]]@(
            [IO.Path]::DirectorySeparatorChar,
            [IO.Path]::AltDirectorySeparatorChar
        ))
    }
    return $FullPath
}

function Get-SafeDiagnosticMessage {
    param([Parameter(Mandatory = $true)][string]$Message)
    $SingleLine = ($Message -replace '[\r\n]+', ' ').Trim()
    if ($SingleLine -match '://|-----BEGIN [A-Z ]+PRIVATE KEY-----|(?i)(password|token|secret|api[_-]?key|service[_-]?role[_-]?key)=') {
        return 'Diagnostic message suppressed because it contained secret-like or complete-URL text.'
    }
    if ($SingleLine.Length -gt 500) {
        return $SingleLine.Substring(0, 500)
    }
    return $SingleLine
}

function Assert-CollectorSourceSafe {
    $Tokens = $null
    $Errors = $null
    $Ast = [System.Management.Automation.Language.Parser]::ParseFile(
        $PSCommandPath,
        [ref]$Tokens,
        [ref]$Errors
    )
    if ($Errors.Count -ne 0) {
        throw 'Collector source has PowerShell parser errors.'
    }

    $Commands = $Ast.FindAll({
        param($Node)
        $Node -is [System.Management.Automation.Language.CommandAst]
    }, $true)
    foreach ($Command in $Commands) {
        $Name = $Command.GetCommandName()
        if ($Name -and $NetworkCommands -contains $Name) {
            throw "Collector source contains prohibited network/provider/database command: $Name"
        }
        if ($Name -ceq 'git') {
            foreach ($Element in $Command.CommandElements) {
                $Literal = $Element.Extent.Text.Trim([char[]]@(39, 34))
                if ($GitWriteSubcommands -contains $Literal) {
                    throw "Collector source contains prohibited Git write/network command: git $Literal"
                }
            }
        }
    }
}

try {
    $ScriptFile = Get-Item -LiteralPath $PSCommandPath
    $EvidenceRoot = Join-Path $ScriptFile.Directory.FullName 'evidence'
    $EvidenceDirectory = Join-Path $EvidenceRoot "A2.3E-local-$RunId"
    New-Item -ItemType Directory -Path $EvidenceDirectory -Force | Out-Null
    $StdoutPath = Join-Path $EvidenceDirectory 'A2.3E-local-runtime-metadata.txt'
    $StderrPath = Join-Path $EvidenceDirectory 'A2.3E-local-runtime-metadata.stderr.txt'
    $SummaryPath = Join-Path $EvidenceDirectory 'A2.3E-local-runtime-metadata-summary.txt'
    Set-Content -LiteralPath $StdoutPath -Value '' -Encoding utf8
    Set-Content -LiteralPath $StderrPath -Value '' -Encoding utf8

    $FailureStage = 'source_safety_validation'
    Assert-CollectorSourceSafe

    $FailureStage = 'repository_root_discovery'
    $SearchDirectory = Get-Item -LiteralPath $PSScriptRoot
    $CandidateRoot = $null
    while ($null -ne $SearchDirectory) {
        if ((Test-Path -LiteralPath (Join-Path $SearchDirectory.FullName '.git')) -and
            (Test-Path -LiteralPath (Join-Path $SearchDirectory.FullName 'package.json'))) {
            $CandidateRoot = Get-NormalizedLocalPath -Path $SearchDirectory.FullName
            break
        }
        $SearchDirectory = $SearchDirectory.Parent
    }
    if ($null -eq $CandidateRoot -or
        (Split-Path -Leaf $CandidateRoot) -cne $ExpectedRepositoryName) {
        throw 'Repository root could not be proven from the collector location.'
    }
    $FailureStage = 'repository_path_verification'
    $ExpectedScript = Join-Path $CandidateRoot $ExpectedRelativeScriptPath
    if ((Get-NormalizedLocalPath -Path $ExpectedScript) -cne
        (Get-NormalizedLocalPath -Path $PSCommandPath)) {
        throw 'Collector path does not match the approved repository location.'
    }
    $FailureStage = 'git_root_verification'
    $GitRoot = Get-SafeCommandText { git -C $CandidateRoot rev-parse --show-toplevel }
    if ((Get-NormalizedLocalPath -Path $GitRoot) -cne
        (Get-NormalizedLocalPath -Path $CandidateRoot)) {
        throw 'Git repository root does not match the approved repository root.'
    }
    $RepositoryRoot = $CandidateRoot

    $PackagePath = Join-Path $RepositoryRoot 'package.json'
    $LockPath = Join-Path $RepositoryRoot 'package-lock.json'
    $FailureStage = 'package_metadata_read'
    $Package = Get-Content -Raw -LiteralPath $PackagePath | ConvertFrom-Json
    $FailureStage = 'package_lock_metadata_read'
    $LockText = Get-Content -Raw -LiteralPath $LockPath
    $LockVersionMatches = [regex]::Matches($LockText, '"lockfileVersion"\s*:\s*(\d+)')
    if ($LockVersionMatches.Count -ne 1) {
        throw 'package-lock.json must contain exactly one numeric lockfileVersion field.'
    }
    $LockfileVersion = $LockVersionMatches[0].Groups[1].Value
    $FailureStage = 'git_metadata_read'
    $Branch = Get-SafeCommandText { git -C $RepositoryRoot rev-parse --abbrev-ref HEAD }
    $StatusLines = @(git -C $RepositoryRoot status --short)
    if ($LASTEXITCODE -ne 0) { throw 'Local git status failed.' }

    $FailureStage = 'metadata_output'
    Write-EvidenceLine "captured_at_utc=$RunId"
    Write-EvidenceLine "repository_path=$RepositoryRoot"
    Write-EvidenceLine "branch=$Branch"
    Write-EvidenceLine "git_status_entry_count=$($StatusLines.Count)"
    $PackageName = if ($Package.PSObject.Properties['name']) { [string]$Package.name } else { 'NOT_DECLARED' }
    $PackageVersion = if ($Package.PSObject.Properties['version']) { [string]$Package.version } else { 'NOT_DECLARED' }
    Write-EvidenceLine "package_name=$PackageName"
    Write-EvidenceLine "package_version=$PackageVersion"
    Write-EvidenceLine "package_manager=npm"
    Write-EvidenceLine "package_lock_version=$LockfileVersion"
    $NextVersion = if ($Package.PSObject.Properties['dependencies'] -and
        $Package.dependencies.PSObject.Properties['next']) { [string]$Package.dependencies.next } else { 'NOT_DECLARED' }
    Write-EvidenceLine "next_version=$NextVersion"
    $NodeEngine = if ($Package.PSObject.Properties['engines'] -and
        $Package.engines.PSObject.Properties['node']) {
        [string]$Package.engines.node
    } else { 'NOT_DECLARED' }
    Write-EvidenceLine "node_engine=$NodeEngine"
    Write-EvidenceLine "local_node_version=$(Get-SafeCommandText { node --version })"
    Write-EvidenceLine "local_npm_version=$(Get-SafeCommandText { npm --version })"

    $FailureStage = 'environment_presence_collection'
    foreach ($Name in $ApprovedEnvironmentNames) {
        $Presence = if (Test-Path -LiteralPath "Env:$Name") { 'SET' } else { 'MISSING' }
        Write-EvidenceLine "$Name=$Presence"
    }

    $FailureStage = 'configuration_hash_collection'
    foreach ($RelativePath in @('package.json', 'package-lock.json', 'next.config.ts', 'vercel.json', 'capacitor.config.ts')) {
        $Path = Join-Path $RepositoryRoot $RelativePath
        if (Test-Path -LiteralPath $Path -PathType Leaf) {
            $Hash = (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToLowerInvariant()
            Write-EvidenceLine "config=$RelativePath|present=yes|sha256=$Hash"
        } else {
            Write-EvidenceLine "config=$RelativePath|present=no|sha256=NOT_AVAILABLE"
        }
    }

    $FailureStage = 'postgresql_client_inventory'
    $ClientPackages = @()
    foreach ($DependencyGroup in @('dependencies', 'devDependencies')) {
        if ($Package.PSObject.Properties[$DependencyGroup]) {
            $ClientPackages += @($Package.$DependencyGroup.PSObject.Properties.Name | Where-Object {
                $_ -match '^(pg|postgres|@prisma/client|drizzle-orm)$'
            })
        }
    }
    $ClientPackages = @($ClientPackages | Sort-Object -Unique)
    Write-EvidenceLine "installed_postgresql_client_packages=$(
        if ($ClientPackages.Count) { $ClientPackages -join ',' } else { 'NONE' }
    )"

    $FailureStage = 'runtime_declaration_scan'
    $SourceFiles = Get-ChildItem -LiteralPath (Join-Path $RepositoryRoot 'app') -Recurse -File -Include '*.ts','*.tsx'
    foreach ($Pattern in @('export const runtime', 'export const preferredRegion', 'export const maxDuration')) {
        $Matches = @($SourceFiles | Select-String -SimpleMatch -Pattern $Pattern)
        Write-EvidenceLine "declaration=$Pattern|count=$($Matches.Count)"
        foreach ($Match in $Matches) {
            $Relative = $Match.Path.Substring($RepositoryRoot.Length + 1)
            Write-EvidenceLine "declaration_location=$Relative`:$($Match.LineNumber)"
        }
    }

    $FailureStage = 'complete'
    $Result = 'PASS'
} catch {
    $Failure = $_.Exception.Message
    if ($StderrPath) {
        $SafeMessage = Get-SafeDiagnosticMessage -Message $Failure
        @(
            "exception_type=$($_.Exception.GetType().FullName)"
            "message=$SafeMessage"
            "script_line=$($_.InvocationInfo.ScriptLineNumber)"
            "invocation_offset=$($_.InvocationInfo.OffsetInLine)"
            "failure_stage=$FailureStage"
        ) | Set-Content -LiteralPath $StderrPath -Encoding utf8
    }
} finally {
    if ($SummaryPath) {
        $CollectorHash = (Get-FileHash -LiteralPath $PSCommandPath -Algorithm SHA256).Hash.ToLowerInvariant()
        @(
            "captured_at_utc=$RunId"
            "result=$Result"
            "collector_sha256=$CollectorHash"
            "stdout_file=A2.3E-local-runtime-metadata.txt"
            "stderr_file=A2.3E-local-runtime-metadata.stderr.txt"
            "failure_present=$([bool]$Failure)"
            "failure_stage=$FailureStage"
        ) | Set-Content -LiteralPath $SummaryPath -Encoding utf8
    }
}

if ($Result -ne 'PASS') {
    [Console]::Error.WriteLine('A2.3E local metadata collection failed. Review retained local evidence.')
    exit 1
}

Write-Output "A2.3E local metadata evidence: $EvidenceDirectory"
exit 0
