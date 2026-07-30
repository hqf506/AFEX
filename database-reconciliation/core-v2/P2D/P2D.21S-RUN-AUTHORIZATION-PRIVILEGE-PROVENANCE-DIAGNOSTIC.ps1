[CmdletBinding()]
param()

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$PsqlPath = 'C:\Program Files\PostgreSQL\18\bin\psql.exe'
$ExpectedPsqlVersion = 'psql (PostgreSQL) 18.4'
$ExpectedMarker = 'P2D21S_900_AUTHORIZATION_PRIVILEGE_PROVENANCE_DIAGNOSTIC_COMPLETE'
$Base = Split-Path -Parent $MyInvocation.MyCommand.Path
$SqlPath = Join-Path $Base 'P2D.21S-AUTHORIZATION-PRIVILEGE-PROVENANCE-DIAGNOSTIC.sql'
$EvidenceRoot = Join-Path $Base 'evidence'
$RunId = [DateTime]::UtcNow.ToString('yyyyMMddTHHmmssfffZ')
$EvidenceDirectory = Join-Path $EvidenceRoot "P2D.21S-$RunId"
$StdoutPath = Join-Path $EvidenceDirectory 'P2D.21S.stdout.txt'
$StderrPath = Join-Path $EvidenceDirectory 'P2D.21S.stderr.txt'
$SummaryPath = Join-Path $EvidenceDirectory 'P2D.21S-summary.txt'
$PreviousPgpass = $env:PGPASSFILE
$PgpassPath = $null
[int]$ExitCode = -1
[int]$CapturedExitCode = -1
$MarkerFound = $false
$DiagnosticFailure = $null
$FailureKind = 'NONE'
$RunnerExitCode = 0
$CleanupFailure = $false
$Process = $null

function Stop-Safely([string]$Message) {
    throw "P2D.21S stopped fail-closed: $Message"
}

if (-not (Test-Path -LiteralPath $PsqlPath -PathType Leaf)) {
    Stop-Safely 'PostgreSQL 18.4 psql is missing.'
}
if ((& $PsqlPath --version).Trim() -ne $ExpectedPsqlVersion) {
    Stop-Safely "Expected $ExpectedPsqlVersion."
}
if (-not (Test-Path -LiteralPath $SqlPath -PathType Leaf)) {
    Stop-Safely 'Diagnostic SQL is missing.'
}
if ([string]::IsNullOrWhiteSpace($env:SUPABASE_DB_URL)) {
    Stop-Safely 'SUPABASE_DB_URL is required.'
}

try {
    $Uri = [Uri]$env:SUPABASE_DB_URL
} catch {
    Stop-Safely 'SUPABASE_DB_URL is not a valid URI.'
}
if ($Uri.Scheme -notin @('postgres', 'postgresql')) {
    Stop-Safely 'Connection scheme is invalid.'
}

$HostName = $Uri.DnsSafeHost
$Port = if ($Uri.IsDefaultPort) { '5432' } else { $Uri.Port.ToString() }
$DatabaseName = [Uri]::UnescapeDataString($Uri.AbsolutePath.TrimStart('/'))
$UserInfo = $Uri.UserInfo.Split(':', 2)
if ($UserInfo.Count -ne 2) {
    Stop-Safely 'Connection identity is incomplete.'
}
$DatabaseUser = [Uri]::UnescapeDataString($UserInfo[0])
$DatabasePassword = [Uri]::UnescapeDataString($UserInfo[1])
if ($DatabaseUser -ne 'postgres' -or $DatabaseName -ne 'postgres') {
    Stop-Safely 'Expected database and user are postgres.'
}

New-Item -ItemType Directory -Path $EvidenceDirectory -Force | Out-Null
$PgpassPath = Join-Path $env:TEMP "afex-p2d21s-$([Guid]::NewGuid().ToString('N')).pgpass"

try {
    $EscapedPassword = $DatabasePassword.Replace('\', '\\').Replace(':', '\:')
    $PgpassLine = '{0}:{1}:{2}:{3}:{4}' -f
        $HostName, $Port, $DatabaseName, $DatabaseUser, $EscapedPassword
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
    $Identity = [Security.Principal.WindowsIdentity]::GetCurrent().Name
    $Rule = [Security.AccessControl.FileSystemAccessRule]::new(
        $Identity,
        [Security.AccessControl.FileSystemRights]::Read,
        [Security.AccessControl.AccessControlType]::Allow
    )
    $Acl.AddAccessRule($Rule)
    Set-Acl -LiteralPath $PgpassPath -AclObject $Acl
    $env:PGPASSFILE = $PgpassPath

    $Arguments = @(
        "--host=$HostName", "--port=$Port", "--username=$DatabaseUser",
        "--dbname=$DatabaseName", '--no-password', '--set=ON_ERROR_STOP=1',
        "--set=AFEX_EXPECTED_DATABASE=$DatabaseName",
        "--set=AFEX_EXPECTED_USER=$DatabaseUser", "--file=$SqlPath"
    )
    $Process = Start-Process -FilePath $PsqlPath -ArgumentList $Arguments `
        -NoNewWindow -PassThru `
        -RedirectStandardOutput $StdoutPath `
        -RedirectStandardError $StderrPath
    $Process.WaitForExit()
    $Process.Refresh()
    if (-not $Process.HasExited) {
        Stop-Safely 'Diagnostic psql process did not exit.'
    }
    [int]$CapturedExitCode = $Process.ExitCode
    [int]$ExitCode = $CapturedExitCode
    $Process.Close()
    $Process.Dispose()
    $Process = $null

    $Stdout = [IO.File]::ReadAllText($StdoutPath)
    $Stderr = [IO.File]::ReadAllText($StderrPath)
    $MarkerFound = $Stdout.Contains($ExpectedMarker) -or
        $Stderr.Contains($ExpectedMarker)
    if ($ExitCode -ne 0) {
        $DiagnosticFailure = "psql exit code $ExitCode"
        $FailureKind = 'SQL_FAILURE'
        $RunnerExitCode = 3
    } elseif (-not $MarkerFound) {
        $DiagnosticFailure = 'required marker absent'
        $FailureKind = 'MARKER_FAILURE'
        $RunnerExitCode = 5
    }
} catch {
    $DiagnosticFailure = $_.Exception.Message
    $FailureKind = 'RUNNER_FAILURE'
    $RunnerExitCode = 6
} finally {
    if ($null -ne $Process) {
        try {
            if (-not $Process.HasExited) {
                if (-not $Process.WaitForExit(5000)) {
                    Stop-Process -Id $Process.Id -Force -ErrorAction SilentlyContinue
                    [void]$Process.WaitForExit(5000)
                }
            }
        } catch {
            if ($null -eq $DiagnosticFailure) {
                $DiagnosticFailure = $_.Exception.Message
                $FailureKind = 'RUNNER_FAILURE'
                $RunnerExitCode = 6
            }
        } finally {
            $Process.Close()
            $Process.Dispose()
            $Process = $null
        }
    }

    if ($null -eq $PreviousPgpass) {
        Remove-Item Env:PGPASSFILE -ErrorAction SilentlyContinue
    } else {
        $env:PGPASSFILE = $PreviousPgpass
    }
    $DatabasePassword = $null
    $Uri = $null
    [GC]::Collect()
    [GC]::WaitForPendingFinalizers()
    [GC]::Collect()

    if ($null -ne $PgpassPath) {
        for ($Attempt = 1; $Attempt -le 5; $Attempt++) {
            if (-not (Test-Path -LiteralPath $PgpassPath -PathType Leaf)) {
                break
            }
            try {
                & attrib.exe -R -S -H $PgpassPath 2>$null
                Set-ItemProperty -LiteralPath $PgpassPath -Name IsReadOnly `
                    -Value $false -ErrorAction SilentlyContinue
                [IO.File]::SetAttributes($PgpassPath, [IO.FileAttributes]::Normal)
                & icacls.exe $PgpassPath /reset /C /Q 2>$null | Out-Null
                $CleanupIdentity =
                    [Security.Principal.WindowsIdentity]::GetCurrent().Name
                & icacls.exe $PgpassPath /grant:r `
                    "${CleanupIdentity}:(F)" /C /Q 2>$null | Out-Null
                $CleanupAcl = Get-Acl -LiteralPath $PgpassPath
                $CleanupAcl.SetAccessRuleProtection($true, $false)
                foreach ($CleanupRule in @($CleanupAcl.Access)) {
                    [void]$CleanupAcl.RemoveAccessRuleAll($CleanupRule)
                }
                $CleanupRule =
                    [Security.AccessControl.FileSystemAccessRule]::new(
                        $CleanupIdentity,
                        [Security.AccessControl.FileSystemRights]::FullControl,
                        [Security.AccessControl.AccessControlType]::Allow
                    )
                $CleanupAcl.AddAccessRule($CleanupRule)
                Set-Acl -LiteralPath $PgpassPath -AclObject $CleanupAcl
                Remove-Item -LiteralPath $PgpassPath -Force -ErrorAction Stop
            } catch {
                if ($Attempt -lt 5) {
                    Start-Sleep -Milliseconds 200
                }
            }
        }
        $CleanupFailure = Test-Path -LiteralPath $PgpassPath -PathType Leaf
    }

    @(
        "exit_code=$ExitCode"
        "captured_psql_exit_code=$CapturedExitCode"
        "failure_kind=$FailureKind"
        "runner_exit_code=$RunnerExitCode"
        "marker_found=$MarkerFound"
        "credential_cleanup_succeeded=$(-not $CleanupFailure)"
        "stdout=$StdoutPath"
        "stderr=$StderrPath"
    ) | Set-Content -LiteralPath $SummaryPath -Encoding utf8
}

if ($CleanupFailure) {
    [Console]::Error.WriteLine(
        "SECURITY FAILURE: temporary pgpass remains at: $PgpassPath"
    )
    [Console]::Error.WriteLine(
        "Safe remediation: Remove-Item -LiteralPath '$PgpassPath' -Force"
    )
    [Console]::Error.WriteLine(
        "Diagnostic result: kind=$FailureKind psql_exit_code=$ExitCode"
    )
    exit 4
}
if ($null -ne $DiagnosticFailure) {
    [Console]::Error.WriteLine(
        "P2D.21S stopped fail-closed: $DiagnosticFailure. Evidence: $EvidenceDirectory"
    )
    exit $RunnerExitCode
}

Write-Output $ExpectedMarker
Write-Output "Evidence: $EvidenceDirectory"
