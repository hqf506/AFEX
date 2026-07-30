[CmdletBinding()]
param()

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$PsqlPath = 'C:\Program Files\PostgreSQL\18\bin\psql.exe'
$ExpectedPsqlVersion = 'psql (PostgreSQL) 18.4'
$ExpectedMarker = 'P2D21Q_900_AUTHORIZATION_COLUMN_ACL_DIAGNOSTIC_COMPLETE'
$ScriptDirectory = Split-Path -Parent $MyInvocation.MyCommand.Path
$SqlPath = Join-Path $ScriptDirectory 'P2D.21Q-AUTHORIZATION-COLUMN-ACL-DIAGNOSTIC.sql'
$EvidenceRoot = Join-Path $ScriptDirectory 'evidence'
$Timestamp = [DateTime]::UtcNow.ToString('yyyyMMddTHHmmssfffZ')
$EvidenceDirectory = Join-Path $EvidenceRoot "P2D.21Q-$Timestamp"
$StdoutPath = Join-Path $EvidenceDirectory 'P2D.21Q.stdout.txt'
$StderrPath = Join-Path $EvidenceDirectory 'P2D.21Q.stderr.txt'
$SummaryPath = Join-Path $EvidenceDirectory 'P2D.21Q-summary.txt'
$PgpassPath = $null
$PreviousPgpass = $env:PGPASSFILE

function Stop-Safely {
    param([string]$Message)
    throw "P2D.21Q stopped fail-closed: $Message"
}

if (-not (Test-Path -LiteralPath $PsqlPath -PathType Leaf)) {
    Stop-Safely 'PostgreSQL 18.4 psql was not found.'
}

$ActualPsqlVersion = (& $PsqlPath --version).Trim()
if ($LASTEXITCODE -ne 0 -or $ActualPsqlVersion -ne $ExpectedPsqlVersion) {
    Stop-Safely "Expected $ExpectedPsqlVersion."
}

if (-not (Test-Path -LiteralPath $SqlPath -PathType Leaf)) {
    Stop-Safely 'Diagnostic SQL artifact is missing.'
}

if ([string]::IsNullOrWhiteSpace($env:SUPABASE_DB_URL)) {
    Stop-Safely 'SUPABASE_DB_URL is required.'
}

$ConnectionUri = $null
try {
    $ConnectionUri = [Uri]$env:SUPABASE_DB_URL
} catch {
    Stop-Safely 'SUPABASE_DB_URL is not a valid URI.'
}

if ($ConnectionUri.Scheme -notin @('postgres', 'postgresql')) {
    Stop-Safely 'SUPABASE_DB_URL must use postgres or postgresql.'
}

$HostName = $ConnectionUri.DnsSafeHost
$Port = if ($ConnectionUri.IsDefaultPort) { '5432' } else {
    $ConnectionUri.Port.ToString()
}
$DatabaseName = $ConnectionUri.AbsolutePath.TrimStart('/')
$UserInfo = $ConnectionUri.UserInfo.Split(':', 2)

if ($UserInfo.Count -ne 2 -or
    [string]::IsNullOrWhiteSpace($UserInfo[0]) -or
    [string]::IsNullOrWhiteSpace($UserInfo[1]) -or
    [string]::IsNullOrWhiteSpace($HostName) -or
    [string]::IsNullOrWhiteSpace($DatabaseName)) {
    Stop-Safely 'Connection URI components are incomplete.'
}

$DatabaseUser = [Uri]::UnescapeDataString($UserInfo[0])
$DatabasePassword = [Uri]::UnescapeDataString($UserInfo[1])
$DatabaseName = [Uri]::UnescapeDataString($DatabaseName)

if ($DatabaseUser -ne 'postgres' -or $DatabaseName -ne 'postgres') {
    Stop-Safely 'Expected Production database and installer identity are postgres.'
}

New-Item -ItemType Directory -Path $EvidenceDirectory -Force | Out-Null
$PgpassPath = Join-Path $env:TEMP "afex-p2d21q-$([Guid]::NewGuid().ToString('N')).pgpass"

try {
    $EscapedPassword = $DatabasePassword.Replace('\', '\\').
        Replace(':', '\:')
    $PgpassLine = '{0}:{1}:{2}:{3}:{4}' -f
        $HostName,
        $Port,
        $DatabaseName,
        $DatabaseUser,
        $EscapedPassword
    [IO.File]::WriteAllText(
        $PgpassPath,
        $PgpassLine + [Environment]::NewLine,
        [Text.UTF8Encoding]::new($false)
    )

    $Acl = Get-Acl -LiteralPath $PgpassPath
    $Acl.SetAccessRuleProtection($true, $false)
    foreach ($Rule in @($Acl.Access)) {
        [void]$Acl.RemoveAccessRuleAll($Rule)
    }
    $CurrentIdentity = [Security.Principal.WindowsIdentity]::GetCurrent().Name
    $AccessRule = [Security.AccessControl.FileSystemAccessRule]::new(
        $CurrentIdentity,
        [Security.AccessControl.FileSystemRights]::Read,
        [Security.AccessControl.AccessControlType]::Allow
    )
    $Acl.AddAccessRule($AccessRule)
    Set-Acl -LiteralPath $PgpassPath -AclObject $Acl
    $env:PGPASSFILE = $PgpassPath

    $Arguments = @(
        "--host=$HostName"
        "--port=$Port"
        "--username=$DatabaseUser"
        "--dbname=$DatabaseName"
        '--no-password'
        '--set=ON_ERROR_STOP=1'
        "--set=AFEX_EXPECTED_DATABASE=$DatabaseName"
        "--set=AFEX_EXPECTED_USER=$DatabaseUser"
        "--file=$SqlPath"
    )

    $PreviousPreference = $ErrorActionPreference
    try {
        $ErrorActionPreference = 'Continue'
        & $PsqlPath @Arguments 1> $StdoutPath 2> $StderrPath
        $ExitCode = $LASTEXITCODE
    } finally {
        $ErrorActionPreference = $PreviousPreference
    }

    $Stdout = [IO.File]::ReadAllText($StdoutPath)
    $Stderr = [IO.File]::ReadAllText($StderrPath)
    $MarkerFound = $Stdout.Contains($ExpectedMarker) -or
        $Stderr.Contains($ExpectedMarker)

    @(
        "exit_code=$ExitCode"
        "marker_found=$MarkerFound"
        "stdout=$StdoutPath"
        "stderr=$StderrPath"
    ) | Set-Content -LiteralPath $SummaryPath -Encoding utf8

    if ($ExitCode -ne 0) {
        Stop-Safely "psql returned exit code $ExitCode. See retained evidence."
    }
    if (-not $MarkerFound) {
        Stop-Safely 'Required diagnostic marker was absent.'
    }

    Write-Output $ExpectedMarker
    Write-Output "Evidence: $EvidenceDirectory"
} finally {
    if ($null -ne $PgpassPath -and
        (Test-Path -LiteralPath $PgpassPath -PathType Leaf)) {
        Remove-Item -LiteralPath $PgpassPath -Force
    }
    if ($null -eq $PreviousPgpass) {
        Remove-Item Env:PGPASSFILE -ErrorAction SilentlyContinue
    } else {
        $env:PGPASSFILE = $PreviousPgpass
    }
    $DatabasePassword = $null
    $ConnectionUri = $null
}
