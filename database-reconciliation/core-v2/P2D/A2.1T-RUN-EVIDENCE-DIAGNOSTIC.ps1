[CmdletBinding()]
param(
    [ValidateRange(30, 3600)]
    [int]$TimeoutSeconds = 600
)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

$ExpectedSqlHash = 'f2404445401b865f2db344a933119878b269fc14b55e85311a6b7afd57ca946a'
$ExpectedMarker = 'A21T_900_RUNTIME_PRIVILEGE_CLOSURE_EVIDENCE_COMPLETE'
$PsqlPath = 'C:\Program Files\PostgreSQL\18\bin\psql.exe'
$SqlPath = Join-Path $PSScriptRoot 'A2.1T-RUNTIME-PRIVILEGE-CLOSURE-EVIDENCE.sql'
$EvidenceRoot = Join-Path $PSScriptRoot 'evidence'
$RunId = 'A2.1T-{0}' -f ([DateTime]::UtcNow.ToString('yyyyMMddTHHmmssfffZ'))
$EvidenceDirectory = Join-Path $EvidenceRoot $RunId
$StdoutPath = Join-Path $EvidenceDirectory '010-a21t-evidence.stdout.txt'
$StderrPath = Join-Path $EvidenceDirectory '010-a21t-evidence.stderr.txt'
$SummaryPath = Join-Path $EvidenceDirectory 'step-results.txt'
$PgpassPath = $null
$PreviousPgpass = [Environment]::GetEnvironmentVariable('PGPASSFILE', 'Process')
$PreviousPassword = [Environment]::GetEnvironmentVariable('PGPASSWORD', 'Process')
$PreviousSslMode = [Environment]::GetEnvironmentVariable('PGSSLMODE', 'Process')
$PreviousDatabaseUrl = [Environment]::GetEnvironmentVariable('SUPABASE_DB_URL', 'Process')
$Process = $null
$ExitCode = -1
$TimedOut = $false

function Add-SummaryLine {
    param([string]$Value)
    Add-Content -LiteralPath $SummaryPath -Value $Value -Encoding utf8
}

function ConvertTo-PgpassField {
    param([AllowEmptyString()][string]$Value)
    return $Value.Replace('\', '\\').Replace(':', '\:')
}

try {
    New-Item -ItemType Directory -Path $EvidenceDirectory -Force | Out-Null
    Set-Content -LiteralPath $SummaryPath -Value @(
        "run_id=$RunId"
        'mode=discovery-only'
        "sql_file=$([System.IO.Path]::GetFileName($SqlPath))"
        "expected_sql_sha256=$ExpectedSqlHash"
        "expected_marker=$ExpectedMarker"
        "timeout_seconds=$TimeoutSeconds"
    ) -Encoding utf8

    if (-not (Test-Path -LiteralPath $PsqlPath -PathType Leaf)) {
        throw 'Required PostgreSQL psql 18 client was not found.'
    }
    if (-not (Test-Path -LiteralPath $SqlPath -PathType Leaf)) {
        throw 'Pinned A2.1T SQL artifact was not found.'
    }
    $ActualSqlHash = (Get-FileHash -LiteralPath $SqlPath -Algorithm SHA256).Hash.ToLowerInvariant()
    Add-SummaryLine "actual_sql_sha256=$ActualSqlHash"
    if ($ActualSqlHash -cne $ExpectedSqlHash) {
        throw 'A2.1T SQL hash verification failed.'
    }

    $DatabaseUrl = $PreviousDatabaseUrl
    if ([string]::IsNullOrWhiteSpace($DatabaseUrl)) {
        throw 'SUPABASE_DB_URL is not defined in the current process environment.'
    }
    try {
        $Uri = [System.Uri]$DatabaseUrl
    } catch {
        throw 'SUPABASE_DB_URL is not a valid PostgreSQL URL.'
    }
    if ($Uri.Scheme -notin @('postgres', 'postgresql')) {
        throw 'SUPABASE_DB_URL must use the postgres or postgresql scheme.'
    }
    if ([string]::IsNullOrWhiteSpace($Uri.Host) -or $Uri.Port -le 0) {
        throw 'SUPABASE_DB_URL must contain an explicit host and port.'
    }
    $DatabaseName = [System.Uri]::UnescapeDataString($Uri.AbsolutePath.TrimStart('/'))
    $CredentialSeparator = $Uri.UserInfo.IndexOf(':')
    if ($CredentialSeparator -le 0 -or $CredentialSeparator -eq ($Uri.UserInfo.Length - 1) -or
        [string]::IsNullOrWhiteSpace($DatabaseName)) {
        throw 'SUPABASE_DB_URL must contain user, password, and database components.'
    }
    $DatabaseUser = [System.Uri]::UnescapeDataString($Uri.UserInfo.Substring(0, $CredentialSeparator))
    $DatabasePassword = [System.Uri]::UnescapeDataString($Uri.UserInfo.Substring($CredentialSeparator + 1))

    $SslMode = $null
    $SslModeSeen = $false
    if (-not [string]::IsNullOrEmpty($Uri.Query)) {
        $RawQuery = $Uri.Query.Substring(1)
        foreach ($RawParameter in $RawQuery.Split('&')) {
            $Separator = $RawParameter.IndexOf('=')
            if ($Separator -ge 0) {
                $RawName = $RawParameter.Substring(0, $Separator)
                $RawValue = $RawParameter.Substring($Separator + 1)
            } else {
                $RawName = $RawParameter
                $RawValue = ''
            }
            if ([string]::IsNullOrEmpty($RawName)) {
                throw 'SUPABASE_DB_URL contains an empty query parameter name.'
            }
            if ($RawName -match '%(?![0-9A-Fa-f]{2})' -or
                $RawValue -match '%(?![0-9A-Fa-f]{2})') {
                throw 'SUPABASE_DB_URL contains malformed percent encoding.'
            }
            try {
                $Name = [System.Uri]::UnescapeDataString($RawName)
                $Value = [System.Uri]::UnescapeDataString($RawValue)
            } catch {
                throw 'SUPABASE_DB_URL contains malformed percent encoding.'
            }
            if ([string]::IsNullOrEmpty($Name)) {
                throw 'SUPABASE_DB_URL contains an empty query parameter name.'
            }
            if ($Name -cne 'sslmode') {
                throw 'SUPABASE_DB_URL contains an unsupported query parameter.'
            }
            if ($SslModeSeen) {
                throw 'SUPABASE_DB_URL contains duplicate sslmode parameters.'
            }
            $SslModeSeen = $true
            $SslMode = $Value
        }
    }
    if (-not $SslModeSeen) { $SslMode = 'require' }
    if ($SslMode -notin @('require', 'verify-ca', 'verify-full')) {
        throw 'SUPABASE_DB_URL must require TLS.'
    }

    $PgpassPath = Join-Path ([System.IO.Path]::GetTempPath()) ('.pgpass-a21t-{0}' -f [Guid]::NewGuid().ToString('N'))
    $PgpassLine = @(
        (ConvertTo-PgpassField $Uri.Host),
        (ConvertTo-PgpassField ([string]$Uri.Port)),
        (ConvertTo-PgpassField $DatabaseName),
        (ConvertTo-PgpassField $DatabaseUser),
        (ConvertTo-PgpassField $DatabasePassword)
    ) -join ':'
    [System.IO.File]::WriteAllText($PgpassPath, $PgpassLine + [Environment]::NewLine, [System.Text.UTF8Encoding]::new($false))
    $Acl = Get-Acl -LiteralPath $PgpassPath
    $Acl.SetAccessRuleProtection($true, $false)
    foreach ($Rule in @($Acl.Access)) { [void]$Acl.RemoveAccessRuleAll($Rule) }
    $Identity = [System.Security.Principal.WindowsIdentity]::GetCurrent().User
    $Rule = [System.Security.AccessControl.FileSystemAccessRule]::new(
        $Identity, [System.Security.AccessControl.FileSystemRights]::FullControl,
        [System.Security.AccessControl.AccessControlType]::Allow
    )
    $Acl.AddAccessRule($Rule)
    Set-Acl -LiteralPath $PgpassPath -AclObject $Acl

    [Environment]::SetEnvironmentVariable('PGPASSFILE', $PgpassPath, 'Process')
    [Environment]::SetEnvironmentVariable('PGPASSWORD', $null, 'Process')
    [Environment]::SetEnvironmentVariable('PGSSLMODE', $SslMode, 'Process')
    [Environment]::SetEnvironmentVariable('SUPABASE_DB_URL', $null, 'Process')
    $Arguments = @(
        '--host', $Uri.Host,
        '--port', [string]$Uri.Port,
        '--dbname', $DatabaseName,
        '--username', $DatabaseUser,
        '--set', 'ON_ERROR_STOP=1',
        '--set', 'VERBOSITY=verbose',
        '--no-password',
        '--file', ('"{0}"' -f $SqlPath)
    )
    try {
        $Process = Start-Process -FilePath $PsqlPath -ArgumentList $Arguments -NoNewWindow -PassThru `
            -RedirectStandardOutput $StdoutPath -RedirectStandardError $StderrPath
    } catch {
        $ExitCode = -1
        Add-SummaryLine "psql_exit_code=$ExitCode"
        Add-SummaryLine 'timed_out=false'
        throw "A2.1T psql process launch failed: $($_.Exception.Message)"
    }
    $CompletedInTime = $Process.WaitForExit($TimeoutSeconds * 1000)
    if (-not $CompletedInTime) {
        $TimedOut = $true
        $ExitCode = 124
        $Process.Kill()
        $Process.WaitForExit()
    }
    if (-not $TimedOut) {
        $Process.WaitForExit()
        $Process.Refresh()
        if (-not $Process.HasExited -or $null -eq $Process.ExitCode) {
            $ExitCode = -1
            Add-SummaryLine "psql_exit_code=$ExitCode"
            Add-SummaryLine 'timed_out=false'
            throw 'A2.1T psql process exited without a readable numeric exit code.'
        }
        $ExitCode = [int]$Process.ExitCode
    }
    Add-SummaryLine "psql_exit_code=$ExitCode"
    Add-SummaryLine "timed_out=$($TimedOut.ToString().ToLowerInvariant())"

    $Stdout = if (Test-Path -LiteralPath $StdoutPath) { Get-Content -Raw -LiteralPath $StdoutPath } else { '' }
    $Stderr = if (Test-Path -LiteralPath $StderrPath) { Get-Content -Raw -LiteralPath $StderrPath } else { '' }
    $MarkerPresent = $Stdout.Contains($ExpectedMarker)
    $PostgresErrorPresent = $Stderr -match '(?im)^(?:psql:.*)?(?:ERROR|FATAL):'
    Add-SummaryLine "completion_marker_present=$($MarkerPresent.ToString().ToLowerInvariant())"
    Add-SummaryLine "postgres_error_present=$($PostgresErrorPresent.ToString().ToLowerInvariant())"

    if ($TimedOut) { throw 'A2.1T diagnostic timed out.' }
    if ($ExitCode -ne 0) { throw "A2.1T psql returned exit code $ExitCode." }
    if ($PostgresErrorPresent) { throw 'A2.1T stderr contains a PostgreSQL ERROR or FATAL diagnostic.' }
    if (-not $MarkerPresent) { throw 'A2.1T completion marker is missing.' }
    Add-SummaryLine 'result=PASS'
    Write-Output "A2.1T evidence captured at: $EvidenceDirectory"
    exit 0
} catch {
    if (Test-Path -LiteralPath $SummaryPath) {
        if (-not (Select-String -LiteralPath $SummaryPath -Pattern '^psql_exit_code=-?\d+$' -Quiet)) {
            Add-SummaryLine "psql_exit_code=$ExitCode"
        }
        if (-not (Select-String -LiteralPath $SummaryPath -Pattern '^timed_out=(true|false)$' -Quiet)) {
            Add-SummaryLine "timed_out=$($TimedOut.ToString().ToLowerInvariant())"
        }
        Add-SummaryLine 'result=FAIL'
        Add-SummaryLine ("failure={0}" -f $_.Exception.Message)
    }
    Write-Error $_.Exception.Message
    exit 1
} finally {
    if ($null -ne $PgpassPath -and (Test-Path -LiteralPath $PgpassPath)) {
        Remove-Item -LiteralPath $PgpassPath -Force
    }
    [Environment]::SetEnvironmentVariable('PGPASSFILE', $PreviousPgpass, 'Process')
    [Environment]::SetEnvironmentVariable('PGPASSWORD', $PreviousPassword, 'Process')
    [Environment]::SetEnvironmentVariable('PGSSLMODE', $PreviousSslMode, 'Process')
    [Environment]::SetEnvironmentVariable('SUPABASE_DB_URL', $PreviousDatabaseUrl, 'Process')
    $DatabasePassword = $null
}
