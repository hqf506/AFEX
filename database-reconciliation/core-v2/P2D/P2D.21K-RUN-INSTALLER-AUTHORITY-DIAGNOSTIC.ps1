[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

$PsqlPath = 'C:\Program Files\PostgreSQL\18\bin\psql.exe'
$PackageDirectory = $PSScriptRoot
$EvidenceDirectory = Join-Path $PackageDirectory 'evidence'
$DiagnosticPath = Join-Path $PackageDirectory `
    'P2D.21K-INSTALLER-AUTHORITY-DIAGNOSTIC.sql'
$FinalMarker = 'P2D21K_900_INSTALLER_AUTHORITY_DIAGNOSTIC_COMPLETE'
$ExpectedDiagnosticHash = `
    '3efdfb6cbfb9e9f0fc9150885fe196f5b842e65f67b6851194b55fb0a2a0f1e9'
$PgpassPath = $null
$DatabasePassword = $null
$PreviousPgpassFile = $env:PGPASSFILE
$PreviousPgsslMode = $env:PGSSLMODE
$PreviousPgpassword = $env:PGPASSWORD

function Initialize-PostgresCredentialContext {
    try {
        $ConnectionUri = [System.Uri]::new(
            $env:SUPABASE_DB_URL,
            [System.UriKind]::Absolute
        )
    } catch {
        throw 'SUPABASE_DB_URL is not a valid absolute PostgreSQL URL.'
    }

    if ($ConnectionUri.Scheme -notin @('postgres', 'postgresql') -or
        [string]::IsNullOrWhiteSpace($ConnectionUri.Host) -or
        $ConnectionUri.Port -le 0 -or
        [string]::IsNullOrWhiteSpace($ConnectionUri.UserInfo) -or
        -not [string]::IsNullOrWhiteSpace($ConnectionUri.Fragment)) {
        throw 'SUPABASE_DB_URL is incomplete or ambiguous.'
    }

    $UserInfoSeparator = $ConnectionUri.UserInfo.IndexOf(':')
    if ($UserInfoSeparator -le 0 -or
        $UserInfoSeparator -eq ($ConnectionUri.UserInfo.Length - 1)) {
        throw 'SUPABASE_DB_URL credentials are incomplete.'
    }

    $DatabaseName = [System.Uri]::UnescapeDataString(
        $ConnectionUri.AbsolutePath.TrimStart('/')
    )
    $DatabaseUser = [System.Uri]::UnescapeDataString(
        $ConnectionUri.UserInfo.Substring(0, $UserInfoSeparator)
    )
    $script:DatabasePassword = [System.Uri]::UnescapeDataString(
        $ConnectionUri.UserInfo.Substring($UserInfoSeparator + 1)
    )

    if ([string]::IsNullOrWhiteSpace($DatabaseName) -or
        $DatabaseName.Contains('/') -or
        [string]::IsNullOrWhiteSpace($DatabaseUser) -or
        [string]::IsNullOrWhiteSpace($script:DatabasePassword)) {
        throw 'SUPABASE_DB_URL database or credentials are incomplete.'
    }

    $SslMode = $null
    if (-not [string]::IsNullOrWhiteSpace($ConnectionUri.Query)) {
        foreach ($Pair in $ConnectionUri.Query.TrimStart('?').Split('&')) {
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
                throw 'SUPABASE_DB_URL contains unsupported or ambiguous connection options.'
            }
            $SslMode = $Value
        }
    }
    if ($SslMode -notin @('require', 'verify-ca', 'verify-full')) {
        throw 'SUPABASE_DB_URL must require an approved SSL mode.'
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
        $EscapePgpass = {
            param([string]$Value)
            return $Value.Replace('\', '\\').Replace(':', '\:')
        }
        $PgpassLine = @(
            & $EscapePgpass $ConnectionUri.Host
            $ConnectionUri.Port
            & $EscapePgpass $DatabaseName
            & $EscapePgpass $DatabaseUser
            & $EscapePgpass $script:DatabasePassword
        ) -join ':'
        $Writer = [System.IO.StreamWriter]::new(
            $Stream,
            [System.Text.UTF8Encoding]::new($false)
        )
        try {
            $Writer.WriteLine($PgpassLine)
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

    return @{
        Host = $ConnectionUri.Host
        Port = $ConnectionUri.Port
        Database = $DatabaseName
        Username = $DatabaseUser
    }
}

function Clear-PostgresCredentialContext {
    $script:DatabasePassword = $null
    $CredentialCleanupFailed = $false
    try {
        if (-not [string]::IsNullOrWhiteSpace($script:PgpassPath)) {
            try {
                Remove-Item -LiteralPath $script:PgpassPath `
                    -Force -ErrorAction Stop
            } catch {
                try {
                    [System.IO.File]::WriteAllBytes(
                        $script:PgpassPath,
                        [byte[]]::new(0)
                    )
                    Remove-Item -LiteralPath $script:PgpassPath `
                        -Force -ErrorAction Stop
                } catch {
                    $CredentialCleanupFailed = $true
                }
            }
        }
    } finally {
        $script:PgpassPath = $null
        $env:PGPASSFILE = $PreviousPgpassFile
        $env:PGSSLMODE = $PreviousPgsslMode
        $env:PGPASSWORD = $PreviousPgpassword
    }
    if ($CredentialCleanupFailed) {
        throw 'Temporary PostgreSQL credential cleanup failed.'
    }
}

if ([string]::IsNullOrWhiteSpace($env:SUPABASE_DB_URL)) {
    throw 'SUPABASE_DB_URL is not set. No connection was attempted.'
}
if ([string]::IsNullOrWhiteSpace(
        $env:AFEX_EXPECTED_PRODUCTION_DATABASE
    ) -or [string]::IsNullOrWhiteSpace(
        $env:AFEX_EXPECTED_PRODUCTION_USER
    )) {
    throw 'Expected Production database and installer identity are required.'
}
if (-not [string]::IsNullOrWhiteSpace($env:AFEX_PG17_TEST_URL)) {
    throw 'AFEX_PG17_TEST_URL must be unset for Production diagnostics.'
}

if (-not (Test-Path -LiteralPath $DiagnosticPath -PathType Leaf)) {
    throw 'Required P2D.21K SQL diagnostic is missing.'
}
$ActualDiagnosticHash = (
    Get-FileHash -LiteralPath $DiagnosticPath -Algorithm SHA256
).Hash.ToLowerInvariant()
if ($ActualDiagnosticHash -cne $ExpectedDiagnosticHash) {
    throw 'SHA-256 mismatch: P2D.21K installer authority diagnostic.'
}
Write-Host 'HASH PASS: P2D.21K installer authority diagnostic.'

if (-not (Test-Path -LiteralPath $PsqlPath -PathType Leaf)) {
    throw 'Required PostgreSQL 18.4 psql executable is missing.'
}

$ConnectionUrlForParent = $env:SUPABASE_DB_URL
try {
    $env:SUPABASE_DB_URL = $null
    $env:PGPASSFILE = $null
    $env:PGPASSWORD = $null
    $NativeErrorActionPreference = $ErrorActionPreference
    try {
        $ErrorActionPreference = 'Continue'
        $PsqlVersion = (& $PsqlPath --version 2>&1 | Out-String).Trim()
        $PsqlVersionExitCode = $LASTEXITCODE
    } finally {
        $ErrorActionPreference = $NativeErrorActionPreference
    }
} finally {
    $env:SUPABASE_DB_URL = $ConnectionUrlForParent
    $env:PGPASSFILE = $PreviousPgpassFile
    $env:PGPASSWORD = $PreviousPgpassword
}
if ($PsqlVersionExitCode -ne 0 -or $PsqlVersion -notmatch '\b18\.4\b') {
    throw 'The required PostgreSQL 18.4 psql executable was not verified.'
}
Write-Host 'PSQL PASS: PostgreSQL 18.4 client verified.'

if (-not (Test-Path -LiteralPath $EvidenceDirectory -PathType Container)) {
    New-Item -ItemType Directory -Path $EvidenceDirectory | Out-Null
}

$Timestamp = [DateTimeOffset]::Now.ToString('yyyyMMdd-HHmmss-fff')
$StdoutPath = Join-Path $EvidenceDirectory (
    "P2D.21K-installer-authority-$Timestamp.stdout.txt"
)
$StderrPath = Join-Path $EvidenceDirectory (
    "P2D.21K-installer-authority-$Timestamp.stderr.txt"
)
$SummaryPath = Join-Path $EvidenceDirectory (
    "P2D.21K-installer-authority-$Timestamp.summary.txt"
)

try {
    $ConnectionUrlForParent = $env:SUPABASE_DB_URL
    $Connection = Initialize-PostgresCredentialContext
    $PsqlArguments = @(
        '--no-psqlrc'
        "--host=$($Connection.Host)"
        "--port=$($Connection.Port)"
        "--dbname=$($Connection.Database)"
        "--username=$($Connection.Username)"
        '--set=ON_ERROR_STOP=1'
        "--set=AFEX_EXPECTED_DATABASE=$($env:AFEX_EXPECTED_PRODUCTION_DATABASE)"
        "--set=AFEX_EXPECTED_USER=$($env:AFEX_EXPECTED_PRODUCTION_USER)"
        "--file=$DiagnosticPath"
    )

    try {
        $env:SUPABASE_DB_URL = $null
        $NativeErrorActionPreference = $ErrorActionPreference
        try {
            $ErrorActionPreference = 'Continue'
            & $PsqlPath @PsqlArguments `
                1> $StdoutPath `
                2> $StderrPath
            $PsqlExitCode = $LASTEXITCODE
        } finally {
            $ErrorActionPreference = $NativeErrorActionPreference
        }
    } finally {
        $env:SUPABASE_DB_URL = $ConnectionUrlForParent
    }

    $MarkerFound = (
        Select-String -LiteralPath $StdoutPath, $StderrPath `
            -SimpleMatch $FinalMarker `
            -Quiet
    )
    $Summary = @(
        "timestamp=$Timestamp"
        "psql_exit_code=$PsqlExitCode"
        "final_marker=$FinalMarker"
        "final_marker_found=$MarkerFound"
        "stdout_file=$([IO.Path]::GetFileName($StdoutPath))"
        "stderr_file=$([IO.Path]::GetFileName($StderrPath))"
    )
    [IO.File]::WriteAllLines(
        $SummaryPath,
        $Summary,
        [Text.UTF8Encoding]::new($false)
    )

    Write-Host "psql exit code: $PsqlExitCode"
    Write-Host "Final marker found: $MarkerFound"
    Write-Host "Evidence: $([IO.Path]::GetFileName($StdoutPath))"
    Write-Host "Evidence: $([IO.Path]::GetFileName($StderrPath))"
    Write-Host "Evidence: $([IO.Path]::GetFileName($SummaryPath))"

    if ($PsqlExitCode -ne 0) {
        throw 'P2D.21K diagnostic failed. Review captured evidence.'
    }
    if (-not $MarkerFound) {
        throw 'P2D.21K diagnostic did not emit its completion marker.'
    }

    Write-Host 'P2D.21K read-only installer authority diagnostic completed.'
} finally {
    $Connection = $null
    Clear-PostgresCredentialContext
    $ConnectionUrlForParent = $null
}
