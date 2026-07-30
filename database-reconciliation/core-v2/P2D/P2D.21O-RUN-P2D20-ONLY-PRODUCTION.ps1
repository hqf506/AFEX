[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

$PsqlPath = 'C:\Program Files\PostgreSQL\18\bin\psql.exe'
$PackageDirectory = $PSScriptRoot
$EvidenceDirectory = Join-Path $PackageDirectory 'evidence'
$LockPath = Join-Path $EvidenceDirectory 'P2D.21O-p2d20-only.lock'
$Timestamp = [DateTimeOffset]::Now.ToString('yyyyMMdd-HHmmss-fff')
$RunDirectory = Join-Path $EvidenceDirectory "P2D.21O-$Timestamp"
$PgpassPath = $null
$DatabasePassword = $null
$PreviousPgpassFile = $env:PGPASSFILE
$PreviousPgsslMode = $env:PGSSLMODE
$PreviousPgpassword = $env:PGPASSWORD

$ExpectedHashes = [ordered]@{
    'P2D.21O-P2D20-RESUME-PREFLIGHT.sql' = '23fb25db84bc5db0135750bb1bb3a297d185e6cbb79a5a6f13f75d4c40edf473'
    'P2D.19-POST-INSTALL-ATTESTATION.sql' = '08d0d160ddd3c7f43889a88124b7d10e04ac05aad3e628350bcd4a3e0b728273'
    'P2D.20-TRUSTED-ATOMIC-ACQUISITION.sql' = 'd9b4f1a9caffe5644de721e6622be545056873ba5c1bfedd83f481b6bcee0192'
    'P2D.20-POST-INSTALL-ATTESTATION.sql' = 'fbfa71081487f55f09e73292d9ed9e7f4a743ca7383fe50940eca031f09a33a7'
    'P2D.21D-POST-INSTALL-READ-ONLY-VERIFICATION.sql' = '6f92d01e098dee2ff46048fac9eb56e327dc4f23bbbce56b9c20087088cac640'
}

$Steps = [ordered]@{
    resume_preflight = @{
        File = 'P2D.21O-P2D20-RESUME-PREFLIGHT.sql'
        Marker = 'P2D21O_900_P2D20_RESUME_PREFLIGHT_OK'
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
    throw "P2D.21O stopped fail-closed: $Message"
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

function Invoke-ProductionSql(
    [string]$StepName,
    [string]$FileName,
    [AllowNull()][string]$RequiredMarker,
    [hashtable]$Connection,
    [string]$ConnectionUrlForParent
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
    if ($StepName -eq '010-resume-preflight') {
        $Arguments += "--set=AFEX_EXPECTED_DATABASE=$($env:AFEX_EXPECTED_PRODUCTION_DATABASE)"
        $Arguments += "--set=AFEX_EXPECTED_USER=$($env:AFEX_EXPECTED_PRODUCTION_USER)"
    }
    $Arguments += "--file=$SqlPath"
    try {
        $env:SUPABASE_DB_URL = $null
        $SavedPreference = $ErrorActionPreference
        try {
            $ErrorActionPreference = 'Continue'
            & $PsqlPath @Arguments 1> $StdoutPath 2> $StderrPath
            $ExitCode = $LASTEXITCODE
        } finally {
            $ErrorActionPreference = $SavedPreference
        }
    } finally {
        $env:SUPABASE_DB_URL = $ConnectionUrlForParent
    }
    $MarkerFound = $true
    if ($RequiredMarker) {
        $MarkerFound = Select-String -LiteralPath (
            $StdoutPath, $StderrPath
        ) -SimpleMatch $RequiredMarker -Quiet
    }
    Add-Content -LiteralPath (
        Join-Path $RunDirectory 'step-results.txt'
    ) -Value "$StepName exit_code=$ExitCode marker_found=$MarkerFound"
    if ($ExitCode -ne 0) {
        Stop-FailClosed "$StepName returned exit code $ExitCode"
    }
    if (-not $MarkerFound) {
        Stop-FailClosed "$StepName required marker is absent"
    }
}

if ([string]::IsNullOrWhiteSpace($env:SUPABASE_DB_URL) -or
    [string]::IsNullOrWhiteSpace(
        $env:AFEX_EXPECTED_PRODUCTION_DATABASE
    ) -or [string]::IsNullOrWhiteSpace(
        $env:AFEX_EXPECTED_PRODUCTION_USER
    )) {
    Stop-FailClosed 'connection and approved identities are required'
}
if (-not (Test-Path -LiteralPath $PsqlPath -PathType Leaf)) {
    Stop-FailClosed 'reviewed psql client is missing'
}
$PsqlVersion = (& $PsqlPath --version 2>&1 | Out-String).Trim()
if ($LASTEXITCODE -ne 0 -or
    $PsqlVersion -cne 'psql (PostgreSQL) 18.4') {
    Stop-FailClosed 'exact PostgreSQL 18.4 psql client is required'
}

New-Item -ItemType Directory -Force -Path $EvidenceDirectory | Out-Null
$LockStream = $null
$ConnectionUrlForParent = $env:SUPABASE_DB_URL
try {
    $LockStream = [System.IO.File]::Open(
        $LockPath,
        [System.IO.FileMode]::CreateNew,
        [System.IO.FileAccess]::Write,
        [System.IO.FileShare]::None
    )
    New-Item -ItemType Directory -Force -Path $RunDirectory | Out-Null
    foreach ($Artifact in $ExpectedHashes.GetEnumerator()) {
        $Path = Join-Path $PackageDirectory $Artifact.Key
        $Actual = (
            Get-FileHash -LiteralPath $Path -Algorithm SHA256
        ).Hash.ToLowerInvariant()
        if ($Actual -cne $Artifact.Value) {
            Stop-FailClosed "SHA-256 mismatch: $($Artifact.Key)"
        }
        Add-Content -LiteralPath (
            Join-Path $RunDirectory 'verified-hashes.txt'
        ) -Value "$($Artifact.Key)=$Actual"
    }
    $Connection = Initialize-PostgresCredentialContext
    Invoke-ProductionSql '010-resume-preflight' `
        $Steps.resume_preflight.File `
        $Steps.resume_preflight.Marker `
        $Connection `
        $ConnectionUrlForParent

    $Confirmation = Read-Host (
        'Type exactly INSTALL-P2D20-ONLY-ON-PRODUCTION'
    )
    if ($Confirmation -cne 'INSTALL-P2D20-ONLY-ON-PRODUCTION') {
        Stop-FailClosed 'operator confirmation did not match'
    }

    Invoke-ProductionSql '020-p2d20' `
        $Steps.p2d20.File $null $Connection $ConnectionUrlForParent
    Invoke-ProductionSql '030-p2d20-attestation' `
        $Steps.p2d20_attestation.File `
        $Steps.p2d20_attestation.Marker `
        $Connection `
        $ConnectionUrlForParent
    Invoke-ProductionSql '040-final-verification' `
        $Steps.final_verification.File `
        $Steps.final_verification.Marker `
        $Connection `
        $ConnectionUrlForParent

    'P2D21O_950_P2D20_RESUME_COMPLETE' | Set-Content -LiteralPath (
        Join-Path $RunDirectory 'final-summary.txt'
    ) -Encoding utf8
    Write-Host 'P2D21O_950_P2D20_RESUME_COMPLETE'
} finally {
    Clear-PostgresCredentialContext
    if ($LockStream) {
        $LockStream.Dispose()
    }
    if (Test-Path -LiteralPath $LockPath) {
        Remove-Item -LiteralPath $LockPath -Force
    }
}
