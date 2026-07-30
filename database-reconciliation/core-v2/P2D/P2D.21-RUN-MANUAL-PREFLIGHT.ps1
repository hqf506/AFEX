[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

$PsqlPath = 'C:\Program Files\PostgreSQL\18\bin\psql.exe'
$PackageDirectory = $PSScriptRoot
$EvidenceDirectory = Join-Path $PackageDirectory 'evidence'
$PreflightPath = Join-Path $PackageDirectory 'P2D.21-MANUAL-PRODUCTION-PREFLIGHT.sql'
$FinalMarker = 'P2D21_900_MANUAL_PRODUCTION_PREFLIGHT_OK'
$PgpassPath = $null
$DatabasePassword = $null
$PreviousPgpassFile = $env:PGPASSFILE
$PreviousPgsslMode = $env:PGSSLMODE
$PreviousPgpassword = $env:PGPASSWORD

$ExpectedHashes = [ordered]@{
    'P2D.21-MANUAL-PRODUCTION-PREFLIGHT.sql' = '9a548f6759b82eb20852c031f355617e48a05f569d97467be0b3566c095a8589'
    'P2D.19-DURABLE-IMMUTABLE-PAYLOAD-STORAGE.sql' = '5d5f6cc0555f43a7f54fcf6fc2ef085250599b8a72ce78e9f0d2b4a922511805'
    'P2D.19-POST-INSTALL-ATTESTATION.sql' = '08d0d160ddd3c7f43889a88124b7d10e04ac05aad3e628350bcd4a3e0b728273'
    'P2D.20-TRUSTED-ATOMIC-ACQUISITION.sql' = 'd9b4f1a9caffe5644de721e6622be545056873ba5c1bfedd83f481b6bcee0192'
    'P2D.20-POST-INSTALL-ATTESTATION.sql' = 'fbfa71081487f55f09e73292d9ed9e7f4a743ca7383fe50940eca031f09a33a7'
}

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
                Remove-Item -LiteralPath $script:PgpassPath -Force -ErrorAction Stop
            } catch {
                try {
                    [System.IO.File]::WriteAllBytes(
                        $script:PgpassPath,
                        [byte[]]::new(0)
                    )
                    Remove-Item -LiteralPath $script:PgpassPath -Force -ErrorAction Stop
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
if ([string]::IsNullOrWhiteSpace($env:AFEX_EXPECTED_PRODUCTION_DATABASE) -or
    [string]::IsNullOrWhiteSpace($env:AFEX_EXPECTED_PRODUCTION_USER)) {
    throw 'Expected Production database and installer identity are required.'
}
if (-not [string]::IsNullOrWhiteSpace($env:AFEX_PG17_TEST_URL)) {
    throw 'AFEX_PG17_TEST_URL must be unset for Production preflight.'
}

foreach ($Artifact in $ExpectedHashes.GetEnumerator()) {
    $ArtifactPath = Join-Path $PackageDirectory $Artifact.Key
    if (-not (Test-Path -LiteralPath $ArtifactPath -PathType Leaf)) {
        throw "Required artifact is missing: $($Artifact.Key)"
    }

    $ActualHash = (
        Get-FileHash -LiteralPath $ArtifactPath -Algorithm SHA256
    ).Hash.ToLowerInvariant()

    if ($ActualHash -cne $Artifact.Value) {
        throw "SHA-256 mismatch: $($Artifact.Key)"
    }

    Write-Host "HASH PASS: $($Artifact.Key)"
}

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
    "P2D.21-production-preflight-$Timestamp.stdout.txt"
)
$StderrPath = Join-Path $EvidenceDirectory (
    "P2D.21-production-preflight-$Timestamp.stderr.txt"
)
$SummaryPath = Join-Path $EvidenceDirectory (
    "P2D.21-production-preflight-$Timestamp.summary.txt"
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
        "--file=$PreflightPath"
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
        throw 'P2D.21 preflight failed. Review the captured evidence.'
    }

    if (-not $MarkerFound) {
        throw 'P2D.21 preflight did not emit the required PASS marker.'
    }

    Write-Host 'P2D.21 read-only manual Production preflight passed.'
    Write-Host 'This result authorizes external review only.'
} finally {
    $Connection = $null
    Clear-PostgresCredentialContext
    $ConnectionUrlForParent = $null
}
