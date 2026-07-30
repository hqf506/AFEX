[CmdletBinding()]
param()

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$PsqlPath = 'C:\Program Files\PostgreSQL\18\bin\psql.exe'
$ExpectedPsqlVersion = 'psql (PostgreSQL) 18.4'
$Base = Split-Path -Parent $MyInvocation.MyCommand.Path
$EvidenceRoot = Join-Path $Base 'evidence'
$RunId = [DateTime]::UtcNow.ToString('yyyyMMddTHHmmssfffZ')
$EvidenceDirectory = Join-Path $EvidenceRoot "P2D.22-$RunId"
$SummaryPath = Join-Path $EvidenceDirectory 'step-results.txt'
$PreviousPgpass = $env:PGPASSFILE
$PgpassPath = $null
$Process = $null
$DatabasePassword = $null
$Uri = $null
$CleanupFailure = $false
$RunFailure = $null
$RunExitCode = 0
$StepResults = [Collections.Generic.List[string]]::new()

$ReferenceArtifacts = @(
    @{
        File = 'P2D.22-AUTHORIZATION-ACL-CANONICAL-CONTRACT.sql'
        Sha256 = 'b8d62d01adca7caef6ef62e416f2101df810742760303613bb746be3f366da69'
    }
)

$Artifacts = @(
    @{
        Name = '010-contract-verification'
        File = 'P2D.22-FINAL-VERIFICATION-AUTHORIZATION-CONTRACT.sql'
        Marker = 'P2D22_900_AUTHORIZATION_CONTRACT_VERIFICATION_OK'
        Sha256 = '844d95b47a0a5bd0099281084184137add7152888e2b34a77814c34604994bdf'
    },
    @{
        Name = '020-authorization-attestation'
        File = 'P2D.22-POST-INSTALL-AUTHORIZATION-ATTESTATION.sql'
        Marker = 'P2D22A_900_AUTHORIZATION_ATTESTATION_OK'
        Sha256 = '86fdf68da96a4083efa6c911496fc038481b23f59602bfcae7205c44b5d3c5f6'
    },
    @{
        Name = '030-final-verification'
        File = 'P2D.21D-POST-INSTALL-READ-ONLY-VERIFICATION.sql'
        Marker = 'P2D21D_900_POST_INSTALL_VERIFICATION_OK'
        Sha256 = 'cec223f287c7677d23a7e144a5e6fe99893feb3927e897c93c5ddda696db136e'
    }
)

function Stop-Safely([string]$Message) {
    throw "P2D.22 stopped fail-closed: $Message"
}

function Invoke-ReadOnlyStep([hashtable]$Artifact) {
    $SqlPath = Join-Path $Base $Artifact.File
    $StdoutPath = Join-Path $EvidenceDirectory "$($Artifact.Name).stdout.txt"
    $StderrPath = Join-Path $EvidenceDirectory "$($Artifact.Name).stderr.txt"
    [int]$NativeExitCode = -1
    $MarkerFound = $false

    $Arguments = @(
        "--host=$script:HostName",
        "--port=$script:Port",
        "--username=$script:DatabaseUser",
        "--dbname=$script:DatabaseName",
        '--no-password',
        '--set=ON_ERROR_STOP=1',
        "--file=$SqlPath"
    )

    try {
        $script:Process = Start-Process -FilePath $script:PsqlPath `
            -ArgumentList $Arguments -NoNewWindow -PassThru `
            -RedirectStandardOutput $StdoutPath `
            -RedirectStandardError $StderrPath
        $script:Process.WaitForExit()
        $script:Process.Refresh()
        if (-not $script:Process.HasExited) {
            Stop-Safely "$($Artifact.Name) psql process did not exit."
        }
        [int]$NativeExitCode = $script:Process.ExitCode
        $script:Process.Close()
        $script:Process.Dispose()
        $script:Process = $null

        $Stdout = [IO.File]::ReadAllText($StdoutPath)
        $Stderr = [IO.File]::ReadAllText($StderrPath)
        $MarkerFound = $Stdout.Contains($Artifact.Marker) -or
            $Stderr.Contains($Artifact.Marker)
        $script:StepResults.Add(
            "$($Artifact.Name) exit_code=$NativeExitCode marker_found=$MarkerFound"
        )

        if ($NativeExitCode -ne 0) {
            $script:RunExitCode = 3
            Stop-Safely "$($Artifact.Name) returned exit code $NativeExitCode."
        }
        if (-not $MarkerFound) {
            $script:RunExitCode = 5
            Stop-Safely "$($Artifact.Name) required marker is absent."
        }
    } finally {
        if ($null -ne $script:Process) {
            try {
                if (-not $script:Process.HasExited) {
                    if (-not $script:Process.WaitForExit(5000)) {
                        Stop-Process -Id $script:Process.Id -Force `
                            -ErrorAction SilentlyContinue
                        [void]$script:Process.WaitForExit(5000)
                    }
                }
            } finally {
                $script:Process.Close()
                $script:Process.Dispose()
                $script:Process = $null
            }
        }
    }
}

if (-not (Test-Path -LiteralPath $PsqlPath -PathType Leaf)) {
    Stop-Safely 'PostgreSQL 18.4 psql is missing.'
}
if ((& $PsqlPath --version).Trim() -ne $ExpectedPsqlVersion) {
    Stop-Safely "Expected $ExpectedPsqlVersion."
}
if ([string]::IsNullOrWhiteSpace($env:SUPABASE_DB_URL)) {
    Stop-Safely 'SUPABASE_DB_URL is required.'
}

foreach ($Artifact in @($ReferenceArtifacts) + @($Artifacts)) {
    $ArtifactPath = Join-Path $Base $Artifact.File
    if (-not (Test-Path -LiteralPath $ArtifactPath -PathType Leaf)) {
        Stop-Safely "Missing artifact: $($Artifact.File)"
    }
    $ActualHash = (Get-FileHash -LiteralPath $ArtifactPath -Algorithm SHA256).
        Hash.ToLowerInvariant()
    if ($ActualHash -ne $Artifact.Sha256) {
        Stop-Safely "Hash mismatch: $($Artifact.File)"
    }
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
$PgpassPath = Join-Path $env:TEMP `
    "afex-p2d22-$([Guid]::NewGuid().ToString('N')).pgpass"

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
    foreach ($AclRule in @($Acl.Access)) {
        [void]$Acl.RemoveAccessRuleAll($AclRule)
    }
    $Identity = [Security.Principal.WindowsIdentity]::GetCurrent().Name
    $ReadRule = [Security.AccessControl.FileSystemAccessRule]::new(
        $Identity,
        [Security.AccessControl.FileSystemRights]::Read,
        [Security.AccessControl.AccessControlType]::Allow
    )
    $Acl.AddAccessRule($ReadRule)
    Set-Acl -LiteralPath $PgpassPath -AclObject $Acl
    $env:PGPASSFILE = $PgpassPath

    foreach ($Artifact in $Artifacts) {
        Invoke-ReadOnlyStep $Artifact
    }
} catch {
    $RunFailure = $_.Exception.Message
    if ($RunExitCode -eq 0) {
        $RunExitCode = 6
    }
} finally {
    if ($null -ne $Process) {
        try {
            if (-not $Process.HasExited) {
                if (-not $Process.WaitForExit(5000)) {
                    Stop-Process -Id $Process.Id -Force `
                        -ErrorAction SilentlyContinue
                    [void]$Process.WaitForExit(5000)
                }
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
                [IO.File]::SetAttributes(
                    $PgpassPath, [IO.FileAttributes]::Normal
                )
                & icacls.exe $PgpassPath /reset /C /Q 2>$null | Out-Null
                $CleanupIdentity =
                    [Security.Principal.WindowsIdentity]::GetCurrent().Name
                & icacls.exe $PgpassPath /grant:r `
                    "${CleanupIdentity}:(F)" /C /Q 2>$null | Out-Null
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
        $StepResults
        "run_exit_code=$RunExitCode"
        "credential_cleanup_succeeded=$(-not $CleanupFailure)"
        "run_failure=$RunFailure"
        "evidence_directory=$EvidenceDirectory"
    ) | Set-Content -LiteralPath $SummaryPath -Encoding utf8
}

if ($CleanupFailure) {
    [Console]::Error.WriteLine(
        "SECURITY FAILURE: temporary pgpass remains at: $PgpassPath"
    )
    [Console]::Error.WriteLine(
        "Safe remediation: Remove-Item -LiteralPath '$PgpassPath' -Force"
    )
    exit 4
}
if ($null -ne $RunFailure) {
    [Console]::Error.WriteLine($RunFailure)
    exit $RunExitCode
}

Write-Output 'P2D22_900_FINAL_VERIFICATION_CONTRACT_ALIGNMENT_PACKAGE_READY'
Write-Output "Evidence: $EvidenceDirectory"
