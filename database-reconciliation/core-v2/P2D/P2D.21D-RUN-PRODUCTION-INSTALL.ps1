[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

$PsqlPath = 'C:\Program Files\PostgreSQL\18\bin\psql.exe'
$PackageDirectory = $PSScriptRoot
$EvidenceDirectory = Join-Path $PackageDirectory 'evidence'
$LockPath = Join-Path $EvidenceDirectory 'P2D.21D-production-install.lock'
$Timestamp = [DateTimeOffset]::Now.ToString('yyyyMMdd-HHmmss-fff')
$RunDirectory = Join-Path $EvidenceDirectory "P2D.21D-$Timestamp"
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
    'P2D.21D-POST-INSTALL-READ-ONLY-VERIFICATION.sql' = '6f92d01e098dee2ff46048fac9eb56e327dc4f23bbbce56b9c20087088cac640'
}

$Steps = [ordered]@{
    preflight = @{
        File = 'P2D.21-MANUAL-PRODUCTION-PREFLIGHT.sql'
        Marker = 'P2D21_900_MANUAL_PRODUCTION_PREFLIGHT_OK'
    }
    p2d19 = @{
        File = 'P2D.19-DURABLE-IMMUTABLE-PAYLOAD-STORAGE.sql'
        Marker = $null
    }
    p2d19_attestation = @{
        File = 'P2D.19-POST-INSTALL-ATTESTATION.sql'
        Marker = 'P2D19A_900_POST_INSTALL_ATTESTATION_OK'
    }
    p2d20 = @{
        File = 'P2D.20-TRUSTED-ATOMIC-ACQUISITION.sql'
        Marker = $null
    }
    p2d20_attestation = @{
        File = 'P2D.20-POST-INSTALL-ATTESTATION.sql'
        Marker = 'P2D20A_900_POST_INSTALL_ATTESTATION_OK'
    }
    final_verification = @{
        File = 'P2D.21D-POST-INSTALL-READ-ONLY-VERIFICATION.sql'
        Marker = 'P2D21D_900_POST_INSTALL_VERIFICATION_OK'
    }
}

function Stop-FailClosed([string]$Message) {
    throw "P2D.21D stopped fail-closed: $Message"
}

function Initialize-PostgresCredentialContext {
    try {
        $ConnectionUri = [System.Uri]::new(
            $env:SUPABASE_DB_URL,
            [System.UriKind]::Absolute
        )
    } catch {
        Stop-FailClosed 'SUPABASE_DB_URL is not a valid absolute PostgreSQL URL'
    }

    if ($ConnectionUri.Scheme -notin @('postgres', 'postgresql') -or
        [string]::IsNullOrWhiteSpace($ConnectionUri.Host) -or
        $ConnectionUri.Port -le 0 -or
        [string]::IsNullOrWhiteSpace($ConnectionUri.UserInfo) -or
        -not [string]::IsNullOrWhiteSpace($ConnectionUri.Fragment)) {
        Stop-FailClosed 'SUPABASE_DB_URL is incomplete or ambiguous'
    }

    $UserInfoSeparator = $ConnectionUri.UserInfo.IndexOf(':')
    if ($UserInfoSeparator -le 0 -or
        $UserInfoSeparator -eq ($ConnectionUri.UserInfo.Length - 1)) {
        Stop-FailClosed 'SUPABASE_DB_URL credentials are incomplete'
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
        Stop-FailClosed 'SUPABASE_DB_URL database or credentials are incomplete'
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
                Stop-FailClosed 'SUPABASE_DB_URL contains unsupported or ambiguous connection options'
            }
            $SslMode = $Value
        }
    }
    if ($SslMode -notin @('require', 'verify-ca', 'verify-full')) {
        Stop-FailClosed 'SUPABASE_DB_URL must require an approved SSL mode'
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
        Stop-FailClosed 'temporary PostgreSQL credential cleanup failed'
    }
}

function Require-Confirmation(
    [string]$Expected,
    [string]$Description
) {
    Write-Host $Description
    $Actual = Read-Host "Type exactly $Expected"
    if ($Actual -cne $Expected) {
        Stop-FailClosed 'operator confirmation did not match'
    }
}

function Invoke-ProductionSql(
    [string]$StepName,
    [string]$FileName,
    [AllowNull()][string]$RequiredMarker
) {
    $SqlPath = Join-Path $PackageDirectory $FileName
    $StdoutPath = Join-Path $RunDirectory "$StepName.stdout.txt"
    $StderrPath = Join-Path $RunDirectory "$StepName.stderr.txt"
    $Arguments = @(
        '--no-psqlrc'
        "--host=$($Connection.Host)"
        "--port=$($Connection.Port)"
        "--dbname=$($Connection.Database)"
        "--username=$($Connection.Username)"
        '--set=ON_ERROR_STOP=1'
    )
    if ($StepName -eq '010-preflight') {
        $Arguments += "--set=AFEX_EXPECTED_DATABASE=$($env:AFEX_EXPECTED_PRODUCTION_DATABASE)"
        $Arguments += "--set=AFEX_EXPECTED_USER=$($env:AFEX_EXPECTED_PRODUCTION_USER)"
    }
    $Arguments += "--file=$SqlPath"

    try {
        $env:SUPABASE_DB_URL = $null
        $NativeErrorActionPreference = $ErrorActionPreference
        try {
            $ErrorActionPreference = 'Continue'
            & $PsqlPath @Arguments 1> $StdoutPath 2> $StderrPath
            $ExitCode = $LASTEXITCODE
        } finally {
            $ErrorActionPreference = $NativeErrorActionPreference
        }
    } finally {
        $env:SUPABASE_DB_URL = $ConnectionUrlForParent
    }
    $MarkerFound = $true
    if (-not [string]::IsNullOrWhiteSpace($RequiredMarker)) {
        $MarkerFound = Select-String `
            -LiteralPath $StdoutPath, $StderrPath `
            -SimpleMatch $RequiredMarker `
            -Quiet
    }

    Add-Content -LiteralPath (
        Join-Path $RunDirectory 'step-results.txt'
    ) -Value (
        "$StepName exit_code=$ExitCode marker_found=$MarkerFound"
    )

    Write-Host "$StepName exit code: $ExitCode"
    if (-not [string]::IsNullOrWhiteSpace($RequiredMarker)) {
        Write-Host "$StepName PASS marker found: $MarkerFound"
    }

    if ($ExitCode -ne 0) {
        Stop-FailClosed "$StepName returned a non-zero exit code"
    }
    if (-not $MarkerFound) {
        Stop-FailClosed "$StepName did not emit its required PASS marker"
    }
}

if ([string]::IsNullOrWhiteSpace($env:SUPABASE_DB_URL)) {
    Stop-FailClosed 'SUPABASE_DB_URL is required; no connection attempted'
}
if ([string]::IsNullOrWhiteSpace($env:AFEX_EXPECTED_PRODUCTION_DATABASE) -or
    [string]::IsNullOrWhiteSpace($env:AFEX_EXPECTED_PRODUCTION_USER)) {
    Stop-FailClosed 'expected Production database and installer identity are required'
}
if (-not [string]::IsNullOrWhiteSpace($env:AFEX_PG17_TEST_URL)) {
    Stop-FailClosed 'AFEX_PG17_TEST_URL must be unset'
}
if (-not (Test-Path -LiteralPath $PsqlPath -PathType Leaf)) {
    Stop-FailClosed 'approved psql executable is missing'
}

try {
    $ConnectionUrlForParent = $env:SUPABASE_DB_URL
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
    Stop-FailClosed 'PostgreSQL 18.4 psql client was not verified'
}

New-Item -ItemType Directory -Path $EvidenceDirectory -Force | Out-Null

$LockStream = $null
try {
    $Connection = Initialize-PostgresCredentialContext
    try {
        $LockStream = [System.IO.File]::Open(
            $LockPath,
            [System.IO.FileMode]::CreateNew,
            [System.IO.FileAccess]::Write,
            [System.IO.FileShare]::None
        )
        $LockBytes = [System.Text.Encoding]::UTF8.GetBytes(
            "started_utc=$([DateTimeOffset]::UtcNow.ToString('O'))"
        )
        $LockStream.Write($LockBytes, 0, $LockBytes.Length)
        $LockStream.Flush()
    } catch {
        Stop-FailClosed 'another invocation or stale execution lock exists'
    }

    New-Item -ItemType Directory -Path $RunDirectory | Out-Null

    foreach ($Artifact in $ExpectedHashes.GetEnumerator()) {
        $ArtifactPath = Join-Path $PackageDirectory $Artifact.Key
        if (-not (Test-Path -LiteralPath $ArtifactPath -PathType Leaf)) {
            Stop-FailClosed "required artifact missing: $($Artifact.Key)"
        }
        $ActualHash = (
            Get-FileHash -LiteralPath $ArtifactPath -Algorithm SHA256
        ).Hash.ToLowerInvariant()
        if ($ActualHash -cne $Artifact.Value) {
            Stop-FailClosed "SHA-256 mismatch: $($Artifact.Key)"
        }
        Add-Content -LiteralPath (
            Join-Path $RunDirectory 'verified-hashes.txt'
        ) -Value "$($Artifact.Key)=$ActualHash"
        Write-Host "HASH PASS: $($Artifact.Key)"
    }

    [System.IO.File]::WriteAllLines(
        (Join-Path $RunDirectory 'run-metadata.txt'),
        @(
            "run_timestamp=$Timestamp",
            "psql_version=$PsqlVersion",
            'connection_variable=SUPABASE_DB_URL',
            'connection_value=REDACTED'
        ),
        [System.Text.UTF8Encoding]::new($false)
    )

    Invoke-ProductionSql `
        '010-preflight' `
        $Steps.preflight.File `
        $Steps.preflight.Marker

    Require-Confirmation `
        'INSTALL-P2D19-ON-PRODUCTION' `
        'P2D.21 preflight passed. External preflight approval is required.'

    Invoke-ProductionSql '020-p2d19' $Steps.p2d19.File $null
    Invoke-ProductionSql `
        '030-p2d19-attestation' `
        $Steps.p2d19_attestation.File `
        $Steps.p2d19_attestation.Marker

    Require-Confirmation `
        'INSTALL-P2D20-ON-PRODUCTION' `
        'P2D.19 migration and attestation passed. Review evidence before continuing.'

    Invoke-ProductionSql '040-p2d20' $Steps.p2d20.File $null
    Invoke-ProductionSql `
        '050-p2d20-attestation' `
        $Steps.p2d20_attestation.File `
        $Steps.p2d20_attestation.Marker
    Invoke-ProductionSql `
        '060-final-verification' `
        $Steps.final_verification.File `
        $Steps.final_verification.Marker

    [System.IO.File]::WriteAllLines(
        (Join-Path $RunDirectory 'final-summary.txt'),
        @(
            "run_timestamp=$Timestamp",
            'all_exit_codes_zero=true',
            "preflight_marker=$($Steps.preflight.Marker)",
            "p2d19_attestation_marker=$($Steps.p2d19_attestation.Marker)",
            "p2d20_attestation_marker=$($Steps.p2d20_attestation.Marker)",
            "final_marker=$($Steps.final_verification.Marker)",
            'runtime_integration_executed=false',
            'legacy_order_flow_modified=false',
            'P2D21D_950_PRODUCTION_PACKAGE_COMPLETE'
        ),
        [System.Text.UTF8Encoding]::new($false)
    )

    Write-Host "Evidence directory: $([IO.Path]::GetFileName($RunDirectory))"
    Write-Host 'P2D21D_950_PRODUCTION_PACKAGE_COMPLETE'
} finally {
    $Connection = $null
    Clear-PostgresCredentialContext
    $ConnectionUrlForParent = $null
    if ($null -ne $LockStream) {
        $LockStream.Dispose()
        Remove-Item -LiteralPath $LockPath -Force -ErrorAction SilentlyContinue
    }
}
