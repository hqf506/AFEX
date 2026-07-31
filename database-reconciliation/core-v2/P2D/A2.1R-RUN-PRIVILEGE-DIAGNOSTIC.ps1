[CmdletBinding()]
param(
    [ValidatePattern('^$|^[A-Za-z_][A-Za-z0-9_$]{0,62}$')]
    [string]$TargetRole = $env:AFEX_CORE_V2_RUNTIME_LOGIN,

    [ValidateRange(30, 3600)]
    [int]$TimeoutSeconds = 300
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$PsqlPath = 'C:\Program Files\PostgreSQL\18\bin\psql.exe'
$ExpectedPsqlVersionPattern = '\b18\.4\b'
$ExpectedSqlHash =
    '1ad54a54843c052302e0e42949975a38e6c3d7509e10b960484b22aa48f1267e'
$ExpectedMarker = 'A21R_900_RUNTIME_PRIVILEGE_DIAGNOSTIC_COMPLETE'
$Base = $PSScriptRoot
$SqlPath = Join-Path $Base 'A2.1R-RUNTIME-PRIVILEGE-DIAGNOSTIC.sql'
$EvidenceRoot = Join-Path $Base 'evidence'
$RunId = [DateTime]::UtcNow.ToString('yyyyMMddTHHmmssfffZ')
$EvidenceDirectory = Join-Path $EvidenceRoot "A2.1R-$RunId"
$StdoutPath = Join-Path $EvidenceDirectory 'A2.1R.stdout.txt'
$StderrPath = Join-Path $EvidenceDirectory 'A2.1R.stderr.txt'
$SummaryPath = Join-Path $EvidenceDirectory 'A2.1R-summary.txt'
$PreviousPgpass = $env:PGPASSFILE
$PreviousPgpassword = $env:PGPASSWORD
$PreviousPgsslmode = $env:PGSSLMODE
$OriginalConnectionUrl = $env:SUPABASE_DB_URL
$PgpassPath = $null
$DatabasePassword = $null
$Connection = $null
$Process = $null
[int]$PsqlExitCode = -1
[int]$RunnerExitCode = 0
$FailureKind = 'NONE'
$FailureMessage = $null
$MarkerFound = $false
$TimedOut = $false
$CleanupSucceeded = $true
$SqlHash = $null
$RunnerHash = $null

function Stop-A2R([string]$Message) {
    throw "A2.1R stopped fail-closed: $Message"
}

function Escape-PgpassValue([string]$Value) {
    return $Value.Replace('\', '\\').Replace(':', '\:')
}

function Initialize-CredentialContext {
    try {
        $Uri = [Uri]::new(
            $script:OriginalConnectionUrl,
            [UriKind]::Absolute
        )
    } catch {
        Stop-A2R 'SUPABASE_DB_URL is not a valid absolute PostgreSQL URL.'
    }

    if ($Uri.Scheme -notin @('postgres', 'postgresql') -or
        [string]::IsNullOrWhiteSpace($Uri.Host) -or
        [string]::IsNullOrWhiteSpace($Uri.UserInfo) -or
        -not [string]::IsNullOrWhiteSpace($Uri.Fragment)) {
        Stop-A2R 'SUPABASE_DB_URL is incomplete or ambiguous.'
    }

    $Separator = $Uri.UserInfo.IndexOf(':')
    if ($Separator -le 0 -or $Separator -eq ($Uri.UserInfo.Length - 1)) {
        Stop-A2R 'SUPABASE_DB_URL credentials are incomplete.'
    }

    $DatabaseName = [Uri]::UnescapeDataString(
        $Uri.AbsolutePath.TrimStart('/')
    )
    $DatabaseUser = [Uri]::UnescapeDataString(
        $Uri.UserInfo.Substring(0, $Separator)
    )
    $script:DatabasePassword = [Uri]::UnescapeDataString(
        $Uri.UserInfo.Substring($Separator + 1)
    )
    $Port = if ($Uri.IsDefaultPort) { 5432 } else { $Uri.Port }

    if ([string]::IsNullOrWhiteSpace($DatabaseName) -or
        $DatabaseName.Contains('/') -or
        [string]::IsNullOrWhiteSpace($DatabaseUser) -or
        [string]::IsNullOrWhiteSpace($script:DatabasePassword)) {
        Stop-A2R 'Database identity is incomplete.'
    }

    $SslMode = $null
    if (-not [string]::IsNullOrWhiteSpace($Uri.Query)) {
        foreach ($Pair in $Uri.Query.TrimStart('?').Split('&')) {
            if ([string]::IsNullOrWhiteSpace($Pair)) {
                continue
            }
            $Parts = $Pair.Split('=', 2)
            $Name = [Uri]::UnescapeDataString($Parts[0])
            $Value = if ($Parts.Count -eq 2) {
                [Uri]::UnescapeDataString($Parts[1])
            } else {
                ''
            }
            if ($Name -cne 'sslmode' -or $null -ne $SslMode) {
                Stop-A2R 'Connection URL has unsupported or ambiguous options.'
            }
            $SslMode = $Value
        }
    }
    if ($SslMode -notin @('require', 'verify-ca', 'verify-full')) {
        Stop-A2R 'Connection URL must specify an approved SSL mode.'
    }

    $script:PgpassPath = Join-Path (
        [IO.Path]::GetTempPath()
    ) ("afex-a21r-{0}.pgpass" -f [Guid]::NewGuid().ToString('N'))

    $Identity = [Security.Principal.WindowsIdentity]::GetCurrent()
    $Security = [Security.AccessControl.FileSecurity]::new()
    $Security.SetOwner($Identity.User)
    $Security.SetAccessRuleProtection($true, $false)
    $Security.AddAccessRule(
        [Security.AccessControl.FileSystemAccessRule]::new(
            $Identity.User,
            [Security.AccessControl.FileSystemRights]::FullControl,
            [Security.AccessControl.AccessControlType]::Allow
        )
    )

    $Stream = [IO.File]::Open(
        $script:PgpassPath,
        [IO.FileMode]::CreateNew,
        [IO.FileAccess]::ReadWrite,
        [IO.FileShare]::None
    )
    try {
        [IO.File]::SetAccessControl($script:PgpassPath, $Security)
        $Line = @(
            Escape-PgpassValue $Uri.Host
            $Port
            Escape-PgpassValue $DatabaseName
            Escape-PgpassValue $DatabaseUser
            Escape-PgpassValue $script:DatabasePassword
        ) -join ':'
        $Writer = [IO.StreamWriter]::new(
            $Stream,
            [Text.UTF8Encoding]::new($false)
        )
        try {
            $Writer.WriteLine($Line)
            $Writer.Flush()
        } finally {
            $Writer.Dispose()
        }
    } finally {
        if ($null -ne $Stream) {
            $Stream.Dispose()
        }
    }

    $env:PGPASSFILE = $script:PgpassPath
    $env:PGPASSWORD = $null
    $env:PGSSLMODE = $SslMode

    return @{
        Host = $Uri.Host
        Port = $Port
        Database = $DatabaseName
        Username = $DatabaseUser
    }
}

function Clear-CredentialContext {
    $script:DatabasePassword = $null
    $CleanupFailed = $false
    try {
        if (-not [string]::IsNullOrWhiteSpace($script:PgpassPath) -and
            (Test-Path -LiteralPath $script:PgpassPath -PathType Leaf)) {
            try {
                Remove-Item -LiteralPath $script:PgpassPath `
                    -Force -ErrorAction Stop
            } catch {
                try {
                    [IO.File]::WriteAllBytes(
                        $script:PgpassPath,
                        [byte[]]::new(0)
                    )
                    Remove-Item -LiteralPath $script:PgpassPath `
                        -Force -ErrorAction Stop
                } catch {
                    $CleanupFailed = $true
                }
            }
        }
    } finally {
        $script:PgpassPath = $null
        $env:PGPASSFILE = $script:PreviousPgpass
        $env:PGPASSWORD = $script:PreviousPgpassword
        $env:PGSSLMODE = $script:PreviousPgsslmode
        $env:SUPABASE_DB_URL = $script:OriginalConnectionUrl
    }
    return -not $CleanupFailed
}

if ([string]::IsNullOrWhiteSpace($OriginalConnectionUrl)) {
    Stop-A2R 'SUPABASE_DB_URL is required; no connection was attempted.'
}
if (-not (Test-Path -LiteralPath $SqlPath -PathType Leaf)) {
    Stop-A2R 'Diagnostic SQL is missing.'
}
if (-not (Test-Path -LiteralPath $PsqlPath -PathType Leaf)) {
    Stop-A2R 'PostgreSQL 18.4 psql is missing.'
}

$SqlHash = (
    Get-FileHash -LiteralPath $SqlPath -Algorithm SHA256
).Hash.ToLowerInvariant()
if ($SqlHash -cne $ExpectedSqlHash) {
    Stop-A2R 'Diagnostic SQL SHA-256 does not match the reviewed artifact.'
}
$RunnerHash = (
    Get-FileHash -LiteralPath $PSCommandPath -Algorithm SHA256
).Hash.ToLowerInvariant()

$ConnectionUrlForParent = $env:SUPABASE_DB_URL
try {
    $env:SUPABASE_DB_URL = $null
    $env:PGPASSFILE = $null
    $env:PGPASSWORD = $null
    $PreviousPreference = $ErrorActionPreference
    try {
        $ErrorActionPreference = 'Continue'
        $PsqlVersion = (& $PsqlPath --version 2>&1 | Out-String).Trim()
        $PsqlVersionExitCode = $LASTEXITCODE
    } finally {
        $ErrorActionPreference = $PreviousPreference
    }
} finally {
    $env:SUPABASE_DB_URL = $ConnectionUrlForParent
    $env:PGPASSFILE = $PreviousPgpass
    $env:PGPASSWORD = $PreviousPgpassword
}
if ($PsqlVersionExitCode -ne 0 -or
    $PsqlVersion -notmatch $ExpectedPsqlVersionPattern) {
    Stop-A2R 'Required PostgreSQL 18.4 psql was not verified.'
}

New-Item -ItemType Directory -Path $EvidenceDirectory -Force | Out-Null

try {
    $Connection = Initialize-CredentialContext
    $Arguments = @(
        '--no-psqlrc'
        "--host=$($Connection.Host)"
        "--port=$($Connection.Port)"
        "--dbname=$($Connection.Database)"
        "--username=$($Connection.Username)"
        '--no-password'
        '--set=ON_ERROR_STOP=1'
        "--set=AFEX_TARGET_LOGIN=$TargetRole"
        "--file=`"$SqlPath`""
    )

    try {
        $env:SUPABASE_DB_URL = $null
        $Process = Start-Process -FilePath $PsqlPath `
            -ArgumentList $Arguments `
            -NoNewWindow -PassThru `
            -RedirectStandardOutput $StdoutPath `
            -RedirectStandardError $StderrPath
        $CompletedInTime = $Process.WaitForExit($TimeoutSeconds * 1000)
        if (-not $CompletedInTime) {
            $TimedOut = $true
            Stop-Process -Id $Process.Id -Force -ErrorAction SilentlyContinue
            [void]$Process.WaitForExit(10000)
        }
        $Process.Refresh()
        if (-not $Process.HasExited) {
            Stop-A2R 'psql did not terminate after timeout handling.'
        }
        $PsqlExitCode = $Process.ExitCode
        $Process.Close()
        $Process.Dispose()
        $Process = $null
    } finally {
        $env:SUPABASE_DB_URL = $OriginalConnectionUrl
    }

    $MarkerFound = Select-String `
        -LiteralPath $StdoutPath, $StderrPath `
        -SimpleMatch $ExpectedMarker -Quiet
    if ($TimedOut) {
        $FailureKind = 'RUNNER_TIMEOUT'
        $FailureMessage = "psql exceeded timeout of $TimeoutSeconds seconds"
        $RunnerExitCode = 7
    } elseif ($PsqlExitCode -ne 0) {
        $FailureKind = 'SQL_FAILURE'
        $FailureMessage = "psql exit code $PsqlExitCode"
        $RunnerExitCode = 3
    } elseif (-not $MarkerFound) {
        $FailureKind = 'MARKER_FAILURE'
        $FailureMessage = 'completion marker was not found'
        $RunnerExitCode = 5
    }
} catch {
    if ($FailureKind -eq 'NONE') {
        if ($TimedOut) {
            $FailureKind = 'RUNNER_TIMEOUT'
            $FailureMessage =
                "psql exceeded timeout of $TimeoutSeconds seconds; " +
                $_.Exception.Message
            $RunnerExitCode = 7
        } else {
            $FailureKind = 'RUNNER_FAILURE'
            $FailureMessage = $_.Exception.Message
            $RunnerExitCode = 6
        }
    }
} finally {
    if ($null -ne $Process) {
        try {
            if (-not $Process.HasExited) {
                Stop-Process -Id $Process.Id -Force -ErrorAction SilentlyContinue
                [void]$Process.WaitForExit(5000)
            }
        } finally {
            $Process.Close()
            $Process.Dispose()
            $Process = $null
        }
    }
    $CleanupSucceeded = Clear-CredentialContext
}

$TargetMode = if ([string]::IsNullOrWhiteSpace($TargetRole)) {
    'DISCOVERY'
} else {
    'EXPLICIT'
}
$TargetSummary = if ($TargetMode -eq 'DISCOVERY') {
    '<DISCOVERY>'
} else {
    $TargetRole
}

@(
    "timestamp_utc=$RunId"
    "target_mode=$TargetMode"
    "target_role=$TargetSummary"
    "timeout_seconds=$TimeoutSeconds"
    "timed_out=$TimedOut"
    "sql_sha256=$SqlHash"
    "runner_sha256=$RunnerHash"
    "psql_exit_code=$PsqlExitCode"
    "failure_kind=$FailureKind"
    "runner_exit_code=$RunnerExitCode"
    "marker_found=$MarkerFound"
    "credential_cleanup_succeeded=$CleanupSucceeded"
    "stdout_file=$([IO.Path]::GetFileName($StdoutPath))"
    "stderr_file=$([IO.Path]::GetFileName($StderrPath))"
) | Set-Content -LiteralPath $SummaryPath -Encoding utf8

if (-not $CleanupSucceeded) {
    [Console]::Error.WriteLine(
        'SECURITY FAILURE: temporary pgpass cleanup failed.'
    )
    [Console]::Error.WriteLine(
        "Diagnostic result remains: kind=$FailureKind psql_exit_code=$PsqlExitCode"
    )
    exit 4
}
if ($FailureKind -ne 'NONE') {
    [Console]::Error.WriteLine(
        "A2.1R stopped fail-closed: $FailureMessage. Evidence: $EvidenceDirectory"
    )
    exit $RunnerExitCode
}

Write-Output $ExpectedMarker
Write-Output "Evidence: $EvidenceDirectory"
