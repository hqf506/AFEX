[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$EvidenceRoot,

    [ValidateRange(1, 3600)]
    [int]$TimeoutSeconds = 300
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$ScriptName = 'A2.4B.3-RUN-ISOLATED-DIRECT-EXECUTE-TESTS.ps1'
$HarnessName = 'A2.4B.3-ISOLATED-DIRECT-EXECUTE-HARNESS.ts'
$AttestationName = 'A2.4B.3-DIRECT-EXECUTE-TEST-ATTESTATION.sql'
$ManifestName = 'A2.4B.3-HASH-MANIFEST.md'
$CompletionMarker = 'A24B3_800_ISOLATED_HARNESS_COMPLETE'
$AuthorizationLiteral = 'A24B3_ISOLATED_EXECUTION_APPROVED'
$Process = $null
$ProcessExitCode = -1
$ProcessLaunched = $false
$TimedOut = $false
$MarkerPresent = $false
$Result = 'FAIL'
$FailureStage = 'bootstrap'
$FailureMessage = ''
$ExpectedResultsDigest = ''
$ActualResultsDigest = ''
$TerminationAttempted = $false
$TerminationExitCode = -1
$TerminationConfirmed = $false
$RunDirectory = $null
$StdoutPath = $null
$StderrPath = $null
$SummaryPath = $null
$PriorEvidenceRunDirectory = $env:A24B3_EVIDENCE_RUN_DIR
$PriorHarnessHash = $env:A24B3_HARNESS_SHA256
$PriorRunnerHash = $env:A24B3_RUNNER_SHA256
$PriorAttestationHash = $env:A24B3_ATTESTATION_SHA256
$PriorRunId = $env:A24B3_RUN_ID
$PriorProcessTimeout = $env:A24B3_PROCESS_TIMEOUT_MS

function Get-NormalizedPath {
    param([Parameter(Mandatory = $true)][string]$Path)
    return [System.IO.Path]::GetFullPath($Path).TrimEnd([System.IO.Path]::DirectorySeparatorChar, [System.IO.Path]::AltDirectorySeparatorChar)
}

function Test-PathContainedBy {
    param([string]$Candidate, [string]$Parent)
    $candidatePath = Get-NormalizedPath $Candidate
    $parentPath = Get-NormalizedPath $Parent
    return $candidatePath.Equals($parentPath, [System.StringComparison]::OrdinalIgnoreCase) -or
        $candidatePath.StartsWith($parentPath + [System.IO.Path]::DirectorySeparatorChar, [System.StringComparison]::OrdinalIgnoreCase)
}

function Find-RepositoryRoot {
    param([string]$StartPath)
    $cursor = [System.IO.DirectoryInfo](Get-NormalizedPath $StartPath)
    while ($null -ne $cursor) {
        if ((Test-Path -LiteralPath (Join-Path $cursor.FullName '.git')) -and
            (Test-Path -LiteralPath (Join-Path $cursor.FullName 'package.json'))) {
            return Get-NormalizedPath $cursor.FullName
        }
        $cursor = $cursor.Parent
    }
    throw 'Repository root could not be proven.'
}

function Get-PinnedHash {
    param([string]$ManifestPath, [string]$RelativePath)
    $escapedPath = [regex]::Escape($RelativePath.Replace('\', '/'))
    $pattern = '^\| `' + $escapedPath + '` \| [^|]+\| [^|]+\| `([0-9a-f]{64})` \|'
    $matches = @(Select-String -LiteralPath $ManifestPath -Pattern $pattern)
    if ($matches.Count -ne 1) { throw "Manifest entry is missing or ambiguous for $RelativePath." }
    return $matches[0].Matches[0].Groups[1].Value
}

function Get-TextSha256 {
    param([Parameter(Mandatory = $true)][string]$Text)
    $bytes = [System.Text.UTF8Encoding]::new($false).GetBytes($Text)
    $sha256 = [System.Security.Cryptography.SHA256]::Create()
    try { return ([System.BitConverter]::ToString($sha256.ComputeHash($bytes))).Replace('-', '').ToLowerInvariant() }
    finally { $sha256.Dispose() }
}

function Get-TopLevelJsonPropertyNames {
    param([Parameter(Mandatory = $true)][string]$Json)
    $names = [System.Collections.Generic.List[string]]::new()
    $depth = 0
    $expectKey = $false
    $tokens = [regex]::Matches($Json, '"(?:\\.|[^"\\])*"|[{}\[\],:]')
    foreach ($match in $tokens) {
        $token = $match.Value
        if ($token -eq '{') {
            $depth++
            if ($depth -eq 1) { $expectKey = $true }
        } elseif ($token -eq '[') {
            $depth++
        } elseif ($token -eq '}' -or $token -eq ']') {
            $depth--
        } elseif ($token -eq ',' -and $depth -eq 1) {
            $expectKey = $true
        } elseif ($expectKey -and $depth -eq 1 -and $token.StartsWith('"')) {
            try { $name = $token | ConvertFrom-Json -ErrorAction Stop }
            catch { throw 'results.json contains an invalid top-level property name.' }
            if ($name -isnot [string]) { throw 'results.json top-level property name is invalid.' }
            $names.Add($name)
            $expectKey = $false
        }
    }
    return $names.ToArray()
}

function Test-RetainedResultsContract {
    param(
        [Parameter(Mandatory = $true)][string]$ResultsRaw,
        [Parameter(Mandatory = $true)][AllowEmptyString()][string]$DigestText,
        [Parameter(Mandatory = $true)][string]$ActualDigest,
        [Parameter(Mandatory = $true)][string]$ExpectedRunId
    )
    if ($DigestText.Trim() -notmatch '^([0-9a-fA-F]{64})  results\.json$') { throw 'results.sha256 format is invalid.' }
    $expectedDigest = $Matches[1].ToLowerInvariant()
    if ($expectedDigest -ne $ActualDigest.ToLowerInvariant()) { throw 'results.json SHA-256 mismatch.' }
    $mandatoryFields = @('schemaVersion','runId','authorizationMarker','completionMarker','topology','runtime','artifactHashes','process','semanticAssertions','identityAndPidEvidence','denialMatrix','contaminationMatrix','lockEvidence','cancellationTimeoutDisconnectEvidence','quarantineLog','cleanupStatus','absenceAttestationStatus','independentReviewVerdict','results','finalStatus')
    $topLevelNames = @(Get-TopLevelJsonPropertyNames $ResultsRaw)
    $duplicateNames = @($topLevelNames | Group-Object | Where-Object Count -gt 1 | ForEach-Object Name)
    if ($duplicateNames.Count -ne 0) { throw 'results.json contains a duplicate top-level property.' }
    try { $resultsObject = $ResultsRaw | ConvertFrom-Json -ErrorAction Stop }
    catch { throw 'results.json is malformed.' }
    if ($resultsObject -isnot [pscustomobject]) { throw 'results.json top level must be an object.' }
    foreach ($field in $mandatoryFields) {
        if ($resultsObject.PSObject.Properties.Name -notcontains $field) { throw "Mandatory results.json field $field is absent." }
    }
    foreach ($objectField in @('topology','runtime','artifactHashes','process')) {
        if ($resultsObject.$objectField -isnot [pscustomobject]) { throw "results.json field $objectField must be an object." }
    }
    foreach ($arrayField in @('semanticAssertions','identityAndPidEvidence','denialMatrix','contaminationMatrix','lockEvidence','cancellationTimeoutDisconnectEvidence','quarantineLog','results')) {
        if ($resultsObject.$arrayField -isnot [System.Array]) { throw "results.json field $arrayField must be an array." }
    }
    foreach ($stringField in @('runId','authorizationMarker','completionMarker','cleanupStatus','absenceAttestationStatus','independentReviewVerdict','finalStatus')) {
        if ($resultsObject.$stringField -isnot [string]) { throw "results.json field $stringField must be a string." }
    }
    if ($resultsObject.schemaVersion -isnot [int] -or $resultsObject.schemaVersion -ne 1) { throw 'results.json schemaVersion is not exactly integer 1.' }
    if ($resultsObject.runId -ne $ExpectedRunId) { throw 'results.json run ID does not match the runner run ID.' }
    if ($resultsObject.authorizationMarker -ne $AuthorizationLiteral) { throw 'results.json authorization marker mismatch.' }
    if ($resultsObject.completionMarker -ne $CompletionMarker) { throw 'results.json completion marker binding mismatch.' }
    if (@('PASS','FAIL','INCOMPLETE') -notcontains $resultsObject.finalStatus) { throw 'results.json final status is invalid.' }
    return [pscustomobject]@{ ExpectedDigest = $expectedDigest; ResultsObject = $resultsObject }
}

function Resolve-RunnerClassification {
    param(
        [Parameter(Mandatory = $true)][int]$NativeExitCode,
        [Parameter(Mandatory = $true)][bool]$DidTimeOut,
        [Parameter(Mandatory = $true)][bool]$HasCompletionMarker,
        [Parameter(Mandatory = $true)][bool]$StderrHasError,
        [Parameter(Mandatory = $true)][ValidateSet('PASS','FAIL','INCOMPLETE')][string]$FinalStatus
    )
    if ($DidTimeOut) { throw 'Harness exceeded the approved bounded timeout; retained evidence was integrity-validated.' }
    if ($NativeExitCode -ne 0) { throw "Harness returned exit code $NativeExitCode after retained evidence validation." }
    if ($StderrHasError) { throw 'Harness stderr contains ERROR or FATAL.' }
    if (-not $HasCompletionMarker) { throw 'Required harness completion marker is absent.' }
    if ($FinalStatus -ne 'PASS') { throw "Harness final status is $FinalStatus." }
    return 'PASS'
}

function Assert-SourceFixtureThrows {
    param([Parameter(Mandatory = $true)][scriptblock]$Operation, [Parameter(Mandatory = $true)][string]$ExpectedMessage)
    $observed = ''
    try { & $Operation | Out-Null }
    catch { $observed = $_.Exception.Message }
    if ($observed -ne $ExpectedMessage) { throw "SOURCE_FIXTURE_EXPECTED_FAILURE_MISMATCH:$ExpectedMessage" }
}

function Assert-SourceFixturePasses {
    param([Parameter(Mandatory = $true)][scriptblock]$Operation, [Parameter(Mandatory = $true)][string]$FixtureId)
    try { & $Operation | Out-Null }
    catch { throw "SOURCE_FIXTURE_EXPECTED_PASS_FAILED:${FixtureId}:$($_.Exception.Message)" }
}

function Invoke-RunnerOutcomeFixture {
    param(
        [Parameter(Mandatory = $true)][string]$ResultsRaw,
        [Parameter(Mandatory = $true)][AllowEmptyString()][string]$DigestText,
        [Parameter(Mandatory = $true)][string]$ActualDigest,
        [Parameter(Mandatory = $true)][string]$ExpectedRunId,
        [Parameter(Mandatory = $true)][int]$NativeExitCode,
        [Parameter(Mandatory = $true)][bool]$DidTimeOut,
        [bool]$HasCompletionMarker = $false
    )
    $validated = Test-RetainedResultsContract $ResultsRaw $DigestText $ActualDigest $ExpectedRunId
    return Resolve-RunnerClassification $NativeExitCode $DidTimeOut $HasCompletionMarker $false $validated.ResultsObject.finalStatus
}

function Test-RunnerOutcomeSourceFixtures {
    $fixtureRunId = 'A2.4B.3-20000101T000000000Z'
    $fixture = [ordered]@{
        schemaVersion = 1; runId = $fixtureRunId; authorizationMarker = $AuthorizationLiteral; completionMarker = $CompletionMarker
        topology = @{}; runtime = @{}; artifactHashes = @{}; process = @{}; semanticAssertions = @(); identityAndPidEvidence = @()
        denialMatrix = @(); contaminationMatrix = @(); lockEvidence = @(); cancellationTimeoutDisconnectEvidence = @(); quarantineLog = @()
        cleanupStatus = 'NOT_RUN_EXTERNAL_GATE'; absenceAttestationStatus = 'NOT_RUN_EXTERNAL_GATE'; independentReviewVerdict = 'PENDING'
        results = @(); finalStatus = 'INCOMPLETE'
    }
    $validRaw = ($fixture | ConvertTo-Json -Depth 8) + "`n"
    $validDigest = Get-TextSha256 $validRaw
    $validDigestText = "$validDigest  results.json"

    $compactRaw = ($fixture | ConvertTo-Json -Depth 8 -Compress) + "`n"
    $twoSpaceRaw = '{' + "`n  " + (($compactRaw.TrimEnd()).Substring(1).Replace(',', ",`n  ")) + "`n"
    $fourSpaceRaw = '{' + "`n    " + (($compactRaw.TrimEnd()).Substring(1).Replace(',', ",`n    ")) + "`n"
    $crlfRaw = $twoSpaceRaw.Replace("`n", "`r`n")
    $reorderedFixture = [ordered]@{}
    $fixtureKeys = @($fixture.Keys)
    for ($index = $fixtureKeys.Count - 1; $index -ge 0; $index--) { $reorderedFixture[$fixtureKeys[$index]] = $fixture[$fixtureKeys[$index]] }
    $reorderedRaw = ($reorderedFixture | ConvertTo-Json -Depth 8 -Compress) + "`n"
    foreach ($formatFixture in @(
        @{ Id = 'powershell-four-space'; Raw = $validRaw },
        @{ Id = 'two-space'; Raw = $twoSpaceRaw },
        @{ Id = 'four-space'; Raw = $fourSpaceRaw },
        @{ Id = 'compact'; Raw = $compactRaw },
        @{ Id = 'reordered'; Raw = $reorderedRaw },
        @{ Id = 'crlf'; Raw = $crlfRaw },
        @{ Id = 'lf'; Raw = $twoSpaceRaw }
    )) {
        $formatDigest = Get-TextSha256 $formatFixture.Raw
        Assert-SourceFixturePasses { Test-RetainedResultsContract $formatFixture.Raw "$formatDigest  results.json" $formatDigest $fixtureRunId } $formatFixture.Id
    }

    $passRaw = $compactRaw.Replace('"finalStatus":"INCOMPLETE"', '"finalStatus":"PASS"')
    $passDigest = Get-TextSha256 $passRaw
    Assert-SourceFixturePasses { Invoke-RunnerOutcomeFixture $passRaw "$passDigest  results.json" $passDigest $fixtureRunId 0 $false $true } 'zero-exit-valid-pass'

    Assert-SourceFixtureThrows { Invoke-RunnerOutcomeFixture $validRaw $validDigestText $validDigest $fixtureRunId 3 $false } 'Harness returned exit code 3 after retained evidence validation.'
    Assert-SourceFixtureThrows { Invoke-RunnerOutcomeFixture $validRaw $validDigestText ('0' * 64) $fixtureRunId 3 $false } 'results.json SHA-256 mismatch.'
    $malformed = $validRaw.Substring(0, $validRaw.Length - 2)
    $malformedDigest = Get-TextSha256 $malformed
    Assert-SourceFixtureThrows { Invoke-RunnerOutcomeFixture $malformed "$malformedDigest  results.json" $malformedDigest $fixtureRunId 0 $false } 'results.json is malformed.'
    Assert-SourceFixtureThrows { Invoke-RunnerOutcomeFixture $validRaw $validDigestText $validDigest 'A2.4B.3-20000101T000000001Z' 0 $false } 'results.json run ID does not match the runner run ID.'

    $fixture.schemaVersion = 2
    $wrongSchemaRaw = ($fixture | ConvertTo-Json -Depth 8) + "`n"
    $wrongSchemaDigest = Get-TextSha256 $wrongSchemaRaw
    Assert-SourceFixtureThrows { Invoke-RunnerOutcomeFixture $wrongSchemaRaw "$wrongSchemaDigest  results.json" $wrongSchemaDigest $fixtureRunId 0 $false } 'results.json schemaVersion is not exactly integer 1.'
    $fixture.schemaVersion = 1
    $fixture.Remove('runtime')
    $missingFieldRaw = ($fixture | ConvertTo-Json -Depth 8) + "`n"
    $missingFieldDigest = Get-TextSha256 $missingFieldRaw
    Assert-SourceFixtureThrows { Invoke-RunnerOutcomeFixture $missingFieldRaw "$missingFieldDigest  results.json" $missingFieldDigest $fixtureRunId 0 $false } 'Mandatory results.json field runtime is absent.'

    $duplicateRaw = $compactRaw.TrimStart().Insert(1, '"schemaVersion":1,')
    $duplicateDigest = Get-TextSha256 $duplicateRaw
    Assert-SourceFixtureThrows { Invoke-RunnerOutcomeFixture $duplicateRaw "$duplicateDigest  results.json" $duplicateDigest $fixtureRunId 0 $false } 'results.json contains a duplicate top-level property.'
    $wrongAuthorizationRaw = $compactRaw.Replace($AuthorizationLiteral, 'A24B3_SYNTHETIC_WRONG_AUTHORIZATION')
    $wrongAuthorizationDigest = Get-TextSha256 $wrongAuthorizationRaw
    Assert-SourceFixtureThrows { Invoke-RunnerOutcomeFixture $wrongAuthorizationRaw "$wrongAuthorizationDigest  results.json" $wrongAuthorizationDigest $fixtureRunId 0 $false } 'results.json authorization marker mismatch.'
    $wrongCompletionRaw = $compactRaw.Replace($CompletionMarker, 'A24B3_SYNTHETIC_WRONG_COMPLETION')
    $wrongCompletionDigest = Get-TextSha256 $wrongCompletionRaw
    Assert-SourceFixtureThrows { Invoke-RunnerOutcomeFixture $wrongCompletionRaw "$wrongCompletionDigest  results.json" $wrongCompletionDigest $fixtureRunId 0 $false } 'results.json completion marker binding mismatch.'
    $wrongStatusRaw = $compactRaw.Replace('"finalStatus":"INCOMPLETE"', '"finalStatus":"SYNTHETIC_UNKNOWN"')
    $wrongStatusDigest = Get-TextSha256 $wrongStatusRaw
    Assert-SourceFixtureThrows { Invoke-RunnerOutcomeFixture $wrongStatusRaw "$wrongStatusDigest  results.json" $wrongStatusDigest $fixtureRunId 0 $false } 'results.json final status is invalid.'
    $wrongTypeRaw = $compactRaw.Replace('"runtime":{}', '"runtime":[]')
    $wrongTypeDigest = Get-TextSha256 $wrongTypeRaw
    Assert-SourceFixtureThrows { Invoke-RunnerOutcomeFixture $wrongTypeRaw "$wrongTypeDigest  results.json" $wrongTypeDigest $fixtureRunId 0 $false } 'results.json field runtime must be an object.'

    Assert-SourceFixtureThrows { Invoke-RunnerOutcomeFixture $validRaw $validDigestText $validDigest $fixtureRunId 3 $true } 'Harness exceeded the approved bounded timeout; retained evidence was integrity-validated.'
    Assert-SourceFixtureThrows { Invoke-RunnerOutcomeFixture $validRaw '' $validDigest $fixtureRunId 3 $true } 'results.sha256 format is invalid.'
}

function Write-SafeSummary {
    if ($null -eq $SummaryPath) {
        [System.Console]::Error.WriteLine('A24B3_TERMINAL_NO_SAFE_EVIDENCE_PATH')
        return
    }
    @(
        'run_id=' + $RunId
        'captured_at_utc=' + [DateTime]::UtcNow.ToString('o')
        'result=' + $Result
        'failure_stage=' + $FailureStage
        'failure_message=' + $FailureMessage
        'process_launched=' + $ProcessLaunched.ToString().ToLowerInvariant()
        'process_exit_code=' + $ProcessExitCode
        'timed_out=' + $TimedOut.ToString().ToLowerInvariant()
        'completion_marker_present=' + $MarkerPresent.ToString().ToLowerInvariant()
        'expected_results_sha256=' + $ExpectedResultsDigest
        'actual_results_sha256=' + $ActualResultsDigest
        'termination_attempted=' + $TerminationAttempted.ToString().ToLowerInvariant()
        'termination_exit_code=' + $TerminationExitCode
        'termination_confirmed=' + $TerminationConfirmed.ToString().ToLowerInvariant()
        'sql_executed_by_runner=false'
        'package_installation_performed=false'
    ) | Set-Content -LiteralPath $SummaryPath -Encoding UTF8
}

try {
    $FailureStage = 'repository_proof'
    $ScriptRoot = Get-NormalizedPath $PSScriptRoot
    $RepositoryRoot = Find-RepositoryRoot $ScriptRoot
    $GitRoot = (& git -C $RepositoryRoot rev-parse --show-toplevel 2>$null)
    if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($GitRoot)) { throw 'Git repository proof failed.' }
    if (-not (Get-NormalizedPath $GitRoot).Equals($RepositoryRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
        throw 'Filesystem and Git repository roots differ.'
    }

    $ExpectedScriptRoot = Get-NormalizedPath (Join-Path $RepositoryRoot 'database-reconciliation/core-v2/P2D')
    if (-not $ScriptRoot.Equals($ExpectedScriptRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
        throw 'Runner is not located at the approved repository path.'
    }

    $ExpectedRunnerPath = Get-NormalizedPath (Join-Path $ExpectedScriptRoot $ScriptName)
    $ActualRunnerPath = Get-NormalizedPath $PSCommandPath
    if (-not $ActualRunnerPath.Equals($ExpectedRunnerPath, [System.StringComparison]::OrdinalIgnoreCase)) {
        throw 'Runner path proof failed.'
    }

    $ApprovedEvidenceRoot = Get-NormalizedPath (Join-Path $ExpectedScriptRoot 'evidence')
    $ResolvedEvidenceRoot = Get-NormalizedPath $EvidenceRoot
    if (-not (Test-PathContainedBy $ResolvedEvidenceRoot $ApprovedEvidenceRoot)) {
        throw 'Evidence root is outside the approved ignored directory.'
    }

    $IgnoreOutput = & git -C $RepositoryRoot check-ignore --no-index --quiet -- $ResolvedEvidenceRoot
    if ($LASTEXITCODE -ne 0) { throw 'Evidence root is not proven Git-ignored.' }

    $RunId = 'A2.4B.3-' + [DateTime]::UtcNow.ToString('yyyyMMddTHHmmssfffZ')
    $RunDirectory = Get-NormalizedPath (Join-Path $ResolvedEvidenceRoot $RunId)
    if (-not (Test-PathContainedBy $RunDirectory $ApprovedEvidenceRoot)) { throw 'Run directory containment failed.' }
    [System.IO.Directory]::CreateDirectory($RunDirectory) | Out-Null
    $StdoutPath = Join-Path $RunDirectory 'stdout.txt'
    $StderrPath = Join-Path $RunDirectory 'stderr.txt'
    $SummaryPath = Join-Path $RunDirectory 'step-results.txt'
    [System.IO.File]::WriteAllText($StdoutPath, '', [System.Text.UTF8Encoding]::new($false))
    [System.IO.File]::WriteAllText($StderrPath, '', [System.Text.UTF8Encoding]::new($false))

    $FailureStage = 'authorization_gate'
    if ($env:A24B3_EXECUTION_AUTHORIZED -ne $AuthorizationLiteral) {
        throw 'Runner remains disabled without the exact isolated-execution authorization.'
    }
    if ([string]::IsNullOrWhiteSpace($env:A24B3_TEST_DATABASE_URL)) {
        throw 'Dedicated test configuration is absent.'
    }

    $FailureStage = 'manifest_verification'
    $HarnessPath = Get-NormalizedPath (Join-Path $ExpectedScriptRoot $HarnessName)
    $AttestationPath = Get-NormalizedPath (Join-Path $ExpectedScriptRoot $AttestationName)
    $ManifestPath = Get-NormalizedPath (Join-Path $RepositoryRoot "runtime-integration/$ManifestName")
    foreach ($requiredPath in @($HarnessPath, $AttestationPath, $ActualRunnerPath, $ManifestPath)) {
        if (-not (Test-Path -LiteralPath $requiredPath -PathType Leaf)) { throw 'A required pinned artifact is missing.' }
    }
    $Artifacts = @(
        @{ Absolute = $HarnessPath; Relative = 'database-reconciliation/core-v2/P2D/' + $HarnessName },
        @{ Absolute = $AttestationPath; Relative = 'database-reconciliation/core-v2/P2D/' + $AttestationName },
        @{ Absolute = $ActualRunnerPath; Relative = 'database-reconciliation/core-v2/P2D/' + $ScriptName }
    )
    foreach ($artifact in $Artifacts) {
        $actualHash = (Get-FileHash -LiteralPath $artifact.Absolute -Algorithm SHA256).Hash.ToLowerInvariant()
        $expectedHash = Get-PinnedHash $ManifestPath $artifact.Relative
        if ($actualHash -ne $expectedHash) { throw "Pinned hash mismatch for $($artifact.Relative)." }
    }

    $FailureStage = 'source_contract_fixtures'
    Test-RunnerOutcomeSourceFixtures

    $FailureStage = 'process_launch'
    $env:A24B3_EVIDENCE_RUN_DIR = $RunDirectory
    $env:A24B3_HARNESS_SHA256 = (Get-FileHash -LiteralPath $HarnessPath -Algorithm SHA256).Hash.ToLowerInvariant()
    $env:A24B3_RUNNER_SHA256 = (Get-FileHash -LiteralPath $ActualRunnerPath -Algorithm SHA256).Hash.ToLowerInvariant()
    $env:A24B3_ATTESTATION_SHA256 = (Get-FileHash -LiteralPath $AttestationPath -Algorithm SHA256).Hash.ToLowerInvariant()
    $env:A24B3_RUN_ID = $RunId
    $env:A24B3_PROCESS_TIMEOUT_MS = [string]($TimeoutSeconds * 1000)
    $Process = Start-Process -FilePath 'node' -ArgumentList @('--experimental-strip-types', $HarnessPath) `
        -NoNewWindow -PassThru -RedirectStandardOutput $StdoutPath -RedirectStandardError $StderrPath
    $ProcessLaunched = $true

    $FailureStage = 'process_wait'
    if (-not $Process.WaitForExit($TimeoutSeconds * 1000)) {
        $TimedOut = $true
        $FailureStage = 'process_timeout'
        $TerminationAttempted = $true
        & taskkill.exe /PID $Process.Id /T /F *> $null
        $TerminationExitCode = [int]$LASTEXITCODE
        if ($TerminationExitCode -ne 0) { throw "Harness process-tree termination failed with exit code $TerminationExitCode." }
        $TerminationConfirmed = $Process.WaitForExit(10000)
        if (-not $TerminationConfirmed) { throw 'Harness termination could not be confirmed within the bounded wait.' }
    }
    $ProcessExitCode = [int]$Process.ExitCode

    $FailureStage = 'evidence_validation'
    $stdout = Get-Content -LiteralPath $StdoutPath -Raw
    $stderr = Get-Content -LiteralPath $StderrPath -Raw
    $MarkerPresent = $stdout -match ('(?m)^' + [regex]::Escape($CompletionMarker) + '$')
    foreach ($requiredEvidence in @('results.json', 'results.sha256')) {
        if (-not (Test-Path -LiteralPath (Join-Path $RunDirectory $requiredEvidence) -PathType Leaf)) {
            throw "Required evidence artifact $requiredEvidence is absent."
        }
    }
    $ResultsPath = Join-Path $RunDirectory 'results.json'
    $DigestPath = Join-Path $RunDirectory 'results.sha256'
    $DigestText = Get-Content -LiteralPath $DigestPath -Raw
    $ActualResultsDigest = (Get-FileHash -LiteralPath $ResultsPath -Algorithm SHA256).Hash.ToLowerInvariant()
    $ResultsRaw = Get-Content -LiteralPath $ResultsPath -Raw
    $ValidatedResults = Test-RetainedResultsContract $ResultsRaw $DigestText $ActualResultsDigest $RunId
    $ExpectedResultsDigest = $ValidatedResults.ExpectedDigest
    $ResultsObject = $ValidatedResults.ResultsObject

    $FailureStage = 'process_classification'
    Resolve-RunnerClassification $ProcessExitCode $TimedOut $MarkerPresent ($stderr -match '(?im)^.*(?:ERROR|FATAL).*') $ResultsObject.finalStatus | Out-Null

    $Result = 'PASS'
    $FailureStage = 'complete'
    $FailureMessage = ''
}
catch {
    $Result = 'FAIL'
    $FailureMessage = $_.Exception.Message -replace '[\r\n]+', ' '
    if ($null -ne $StderrPath -and (Test-Path -LiteralPath $StderrPath)) {
        Add-Content -LiteralPath $StderrPath -Value ("runner_failure_stage={0}`nrunner_error_type={1}`nrunner_error={2}" -f $FailureStage, $_.Exception.GetType().FullName, $FailureMessage) -Encoding UTF8
    }
}
finally {
    $env:A24B3_EVIDENCE_RUN_DIR = $PriorEvidenceRunDirectory
    $env:A24B3_HARNESS_SHA256 = $PriorHarnessHash
    $env:A24B3_RUNNER_SHA256 = $PriorRunnerHash
    $env:A24B3_ATTESTATION_SHA256 = $PriorAttestationHash
    $env:A24B3_RUN_ID = $PriorRunId
    $env:A24B3_PROCESS_TIMEOUT_MS = $PriorProcessTimeout
    Write-SafeSummary
}

if ($Result -ne 'PASS') { throw "A2.4B.3 runner failed closed at stage $FailureStage. Review retained evidence." }
Write-Output 'A24B3_900_ISOLATED_RUNNER_COMPLETE'
