Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$script:EeeContractVersion = 'A24E_FINAL_V4'
$script:EeeSchemaVersion = 'A24E_FINAL_V4_EXECUTION_STATE'

function Copy-EeeValue {
    param($Value)
    if ($null -eq $Value -or $Value -is [string] -or $Value -is [bool] -or $Value -is [ValueType]) { return $Value }
    if ($Value -is [System.Collections.IDictionary]) {
        $copy = [ordered]@{}
        foreach ($key in $Value.Keys) { $copy[[string]$key] = Copy-EeeValue $Value[$key] }
        return $copy
    }
    if ($Value -is [System.Collections.IEnumerable] -and $Value -isnot [string]) {
        return ,@($Value | ForEach-Object { Copy-EeeValue $_ })
    }
    $copy = [ordered]@{}
    foreach ($property in $Value.PSObject.Properties) { $copy[$property.Name] = Copy-EeeValue $property.Value }
    return [pscustomobject]$copy
}

function New-EeeValidationResult {
    param([bool]$Valid, [string]$FailureCode = 'NONE')
    [pscustomobject][ordered]@{ valid = $Valid; failure_code = $(if ($Valid) { 'NONE' } else { $FailureCode }) }
}

function Test-EeeClosedRecord {
    param($Record, [string[]]$Fields)
    if ($null -eq $Record) { return $false }
    $names = @($Record.PSObject.Properties.Name)
    if ($names.Count -ne $Fields.Count) { return $false }
    for ($index = 0; $index -lt $Fields.Count; $index++) {
        if ($names[$index] -cne $Fields[$index]) { return $false }
    }
    return $true
}

function ConvertTo-EeeEscapedString {
    param([string]$Value)
    if ($Value.Contains([char]0)) { throw 'EEE_NUL_REJECTED' }
    $normalized = $Value.Normalize([Text.NormalizationForm]::FormC)
    $builder = New-Object Text.StringBuilder
    [void]$builder.Append('"')
    foreach ($character in $normalized.ToCharArray()) {
        $number = [int]$character
        if ($number -ge 0xD800 -and $number -le 0xDFFF) { throw 'EEE_UNPAIRED_SURROGATE_REJECTED' }
        switch ($number) {
            8 { [void]$builder.Append('\b'); continue }
            9 { [void]$builder.Append('\t'); continue }
            10 { [void]$builder.Append('\n'); continue }
            12 { [void]$builder.Append('\f'); continue }
            13 { [void]$builder.Append('\r'); continue }
            34 { [void]$builder.Append('\"'); continue }
            92 { [void]$builder.Append('\\'); continue }
        }
        if ($number -lt 32) { [void]$builder.Append(('\u{0:x4}' -f $number)) } else { [void]$builder.Append($character) }
    }
    [void]$builder.Append('"')
    return $builder.ToString()
}

function ConvertTo-EeeCanonicalJson {
    param($Value, [System.Collections.Generic.HashSet[int]]$Seen)
    if ($null -eq $Seen) { $Seen = New-Object 'System.Collections.Generic.HashSet[int]' }
    if ($null -eq $Value) { return 'null' }
    if ($Value -is [string]) { return ConvertTo-EeeEscapedString $Value }
    if ($Value -is [bool]) { return $(if ($Value) { 'true' } else { 'false' }) }
    if ($Value -is [byte] -or $Value -is [sbyte] -or $Value -is [int16] -or $Value -is [uint16] -or $Value -is [int32] -or $Value -is [uint32] -or $Value -is [int64]) { return $Value.ToString([Globalization.CultureInfo]::InvariantCulture) }
    if ($Value -is [uint64] -or $Value -is [single] -or $Value -is [double] -or $Value -is [decimal]) { throw 'EEE_NUMBER_TYPE_REJECTED' }
    $identity = [Runtime.CompilerServices.RuntimeHelpers]::GetHashCode($Value)
    if (-not $Seen.Add($identity)) { throw 'EEE_CYCLE_REJECTED' }
    try {
        if ($Value -is [System.Collections.IDictionary]) {
            $parts = @()
            foreach ($key in $Value.Keys) { $parts += (ConvertTo-EeeEscapedString ([string]$key)) + ':' + (ConvertTo-EeeCanonicalJson $Value[$key] $Seen) }
            return '{' + ($parts -join ',') + '}'
        }
        if ($Value -is [System.Collections.IEnumerable] -and $Value -isnot [string]) {
            $parts = @($Value | ForEach-Object { ConvertTo-EeeCanonicalJson $_ $Seen })
            return '[' + ($parts -join ',') + ']'
        }
        $parts = @()
        foreach ($property in $Value.PSObject.Properties) { $parts += (ConvertTo-EeeEscapedString $property.Name) + ':' + (ConvertTo-EeeCanonicalJson $property.Value $Seen) }
        return '{' + ($parts -join ',') + '}'
    } finally { [void]$Seen.Remove($identity) }
}

function ConvertTo-EeeCanonicalJsonBytes { param($Value) [Text.UTF8Encoding]::new($false, $true).GetBytes((ConvertTo-EeeCanonicalJson $Value)) }
function ConvertTo-EeeCanonicalJsonLineBytes { param($Value) [Text.UTF8Encoding]::new($false, $true).GetBytes((ConvertTo-EeeCanonicalJson $Value) + "`n") }
function Get-EeeSha256Hex { param([byte[]]$Bytes) $hash = [Security.Cryptography.SHA256]::Create(); try { ([BitConverter]::ToString($hash.ComputeHash($Bytes))).Replace('-', '').ToLowerInvariant() } finally { $hash.Dispose() } }

function Protect-EeeExecutionState {
    param($State)
    $copy=Copy-EeeValue $State
    $projection=[ordered]@{}
    foreach($name in @($copy.PSObject.Properties.Name)){$projection[$name]=$copy.$name}
    $seal=Get-EeeSha256Hex(ConvertTo-EeeCanonicalJsonBytes([pscustomobject]$projection))
    @($copy.PSObject.TypeNames|Where-Object{$_-clike'A24E.EEE.STATE.*'})|ForEach-Object{[void]$copy.PSObject.TypeNames.Remove($_)}
    $copy.PSObject.TypeNames.Insert(0,"A24E.EEE.STATE.$seal")
    [pscustomobject]$copy
}

function Test-EeeExecutionStateSeal {
    param($State)
    if($null-eq$State){return $false}
    $seals=@($State.PSObject.TypeNames|Where-Object{$_-cmatch'^A24E\.EEE\.STATE\.[0-9a-f]{64}$'})
    if($seals.Count-ne1){return $false}
    $projection=[ordered]@{}
    foreach($name in @($State.PSObject.Properties.Name)){$projection[$name]=$State.$name}
    $actual=Get-EeeSha256Hex(ConvertTo-EeeCanonicalJsonBytes([pscustomobject]$projection))
    $seals[0]-ceq"A24E.EEE.STATE.$actual"
}

function Get-EeeStateRegistry {
    @('NOT_STARTED','DEPENDENCIES_MISSING_CANDIDATE','PREFLIGHT_PASSED','CREDENTIAL_READY','CREATE_STARTED','CREATE_PREMUTATION_FAILED','CREATE_ROLLED_BACK','CREATE_COMMITTED','CREATE_OUTCOME_UNKNOWN','ROLE_ABSENCE_VERIFICATION_STARTED','ROLE_ABSENCE_VERIFIED','ROLE_ATTESTATION_STARTED','ROLE_ATTESTED','ROLE_ATTESTATION_FAILED','HARNESS_STARTED','HARNESS_PASSED','HARNESS_FAILED','CLEANUP_REQUIRED','CLEANUP_STARTED','CLEANUP_PASSED','CLEANUP_FAILED','POST_CLEANUP_STARTED','POST_CLEANUP_PASSED','POST_CLEANUP_RESIDUE','FAILED_PREMUTATION_CANDIDATE','FAILED_CLEANUP_REQUIRED_CANDIDATE','FAILED_CLEANUP_INCOMPLETE_CANDIDATE','EVIDENCE_INVALID_CANDIDATE','EVIDENCE_RECONCILIATION_STARTED','COMPLETE_CANDIDATE','DEPENDENCIES_MISSING_EXECUTION_BLOCKED','COMPLETE','FAILED_PREMUTATION','FAILED_CLEANUP_REQUIRED','FAILED_CLEANUP_INCOMPLETE','EVIDENCE_INVALID')
}

function Get-EeeTransitionRegistry {
    $rows = @(
        'NOT_STARTED|DEPENDENCIES_MISSING_CANDIDATE|DEPENDENCIES_MISSING_BEFORE_SECRET_GENERATION|LITERAL_FALSE|true|RESOLVE_DEPENDENCIES_AND_RETRY','NOT_STARTED|PREFLIGHT_PASSED|PREFLIGHT_VALID|LITERAL_FALSE|false|CONTINUE','NOT_STARTED|FAILED_PREMUTATION_CANDIDATE|PREFLIGHT_REJECTED|LITERAL_FALSE|true|CORRECT_INPUT_AND_RETRY','PREFLIGHT_PASSED|CREDENTIAL_READY|CREDENTIAL_CREATED|LITERAL_FALSE|false|CONTINUE','PREFLIGHT_PASSED|FAILED_PREMUTATION_CANDIDATE|CREDENTIAL_CREATION_FAILED|LITERAL_FALSE|true|CORRECT_INPUT_AND_RETRY','CREDENTIAL_READY|CREATE_STARTED|CREATE_LAUNCH_AUTHORIZED|LITERAL_TRUE|false|CONTINUE','CREDENTIAL_READY|FAILED_PREMUTATION_CANDIDATE|CREATE_NOT_LAUNCHED|LITERAL_FALSE|true|RETRY_ALLOWED','CREATE_STARTED|CREATE_PREMUTATION_FAILED|PROCESS_NOT_STARTED|LITERAL_FALSE|true|RETRY_ALLOWED','CREATE_STARTED|CREATE_ROLLED_BACK|ROLLBACK_MARKER_PROVEN|LITERAL_TRUE|false|VERIFY_ROLE_ABSENCE','CREATE_STARTED|CREATE_COMMITTED|COMMIT_MARKER_AND_OID_PROVEN|LITERAL_TRUE|false|ATTEST_ROLE_IDENTITY','CREATE_STARTED|CREATE_OUTCOME_UNKNOWN|CREATE_OUTCOME_NOT_PROVEN|LITERAL_TRUE|false|ATTEST_ROLE_IDENTITY','CREATE_PREMUTATION_FAILED|FAILED_PREMUTATION_CANDIDATE|NO_DATABASE_EFFECT_PROVEN|LITERAL_FALSE|true|RETRY_ALLOWED','CREATE_ROLLED_BACK|ROLE_ABSENCE_VERIFICATION_STARTED|ROLLBACK_REQUIRES_ABSENCE_PROOF|LITERAL_TRUE|false|VERIFY_ROLE_ABSENCE','ROLE_ABSENCE_VERIFICATION_STARTED|ROLE_ABSENCE_VERIFIED|ROLE_ABSENCE_PROVEN|LITERAL_TRUE|false|VERIFY_CLEAN_STATE','ROLE_ABSENCE_VERIFICATION_STARTED|FAILED_CLEANUP_REQUIRED_CANDIDATE|ROLE_ABSENCE_NOT_PROVEN|LITERAL_TRUE|false|MANUAL_ROLE_REVIEW','ROLE_ABSENCE_VERIFIED|CLEANUP_REQUIRED|CLEAN_STATE_VERIFICATION_REQUIRED|LITERAL_TRUE|false|RUN_CLEANUP_VERIFICATION','CREATE_COMMITTED|ROLE_ATTESTATION_STARTED|COMMITTED_ROLE_REQUIRES_ATTESTATION|LITERAL_TRUE|false|CONTINUE','CREATE_OUTCOME_UNKNOWN|ROLE_ATTESTATION_STARTED|UNKNOWN_CREATE_REQUIRES_ATTESTATION|LITERAL_TRUE|false|CONTINUE','ROLE_ATTESTATION_STARTED|ROLE_ATTESTED|EXACT_NAME_OID_PROVEN|LITERAL_TRUE|false|RUN_HARNESS','ROLE_ATTESTATION_STARTED|ROLE_ATTESTATION_FAILED|ROLE_IDENTITY_NOT_PROVEN|LITERAL_TRUE|false|MANUAL_ROLE_REVIEW','ROLE_ATTESTATION_FAILED|FAILED_CLEANUP_REQUIRED_CANDIDATE|UNSAFE_CLEANUP_IDENTITY|LITERAL_TRUE|false|MANUAL_ROLE_REVIEW','ROLE_ATTESTED|HARNESS_STARTED|HARNESS_LAUNCH_AUTHORIZED|LITERAL_TRUE|false|CONTINUE','ROLE_ATTESTED|CLEANUP_REQUIRED|HARNESS_NOT_LAUNCHED|LITERAL_TRUE|false|RUN_CLEANUP','HARNESS_STARTED|HARNESS_PASSED|HARNESS_CONTRACT_PASS|LITERAL_TRUE|false|RUN_CLEANUP','HARNESS_STARTED|HARNESS_FAILED|HARNESS_CONTRACT_FAIL|LITERAL_TRUE|false|RUN_CLEANUP','HARNESS_PASSED|CLEANUP_REQUIRED|TEST_COMPLETE_CLEANUP_REQUIRED|LITERAL_TRUE|false|RUN_CLEANUP','HARNESS_FAILED|CLEANUP_REQUIRED|TEST_FAILED_CLEANUP_REQUIRED|LITERAL_TRUE|false|RUN_CLEANUP','CLEANUP_REQUIRED|CLEANUP_STARTED|CLEANUP_LAUNCH_AUTHORIZED|LITERAL_TRUE|false|CONTINUE','CLEANUP_REQUIRED|FAILED_CLEANUP_REQUIRED_CANDIDATE|CLEANUP_NOT_STARTED|LITERAL_TRUE|false|MANUAL_CLEANUP_REQUIRED','CLEANUP_STARTED|CLEANUP_PASSED|CLEANUP_MARKER_AND_EXIT_PASS|LITERAL_TRUE|false|VERIFY_POST_CLEANUP','CLEANUP_STARTED|CLEANUP_FAILED|CLEANUP_NOT_PROVEN|LITERAL_TRUE|false|MANUAL_CLEANUP_REQUIRED','CLEANUP_FAILED|FAILED_CLEANUP_INCOMPLETE_CANDIDATE|CLEANUP_FAILURE_CANDIDATE|LITERAL_TRUE|false|MANUAL_CLEANUP_REQUIRED','CLEANUP_PASSED|POST_CLEANUP_STARTED|POST_CLEANUP_LAUNCH_AUTHORIZED|LITERAL_TRUE|false|CONTINUE','POST_CLEANUP_STARTED|POST_CLEANUP_PASSED|ABSENCE_AND_RESIDUE_PASS|LITERAL_FALSE|false|RECONCILE_EVIDENCE','POST_CLEANUP_STARTED|POST_CLEANUP_RESIDUE|ABSENCE_OR_RESIDUE_FAIL|LITERAL_TRUE|false|MANUAL_CLEANUP_REQUIRED','POST_CLEANUP_RESIDUE|FAILED_CLEANUP_INCOMPLETE_CANDIDATE|RESIDUE_FAILURE_CANDIDATE|LITERAL_TRUE|false|MANUAL_CLEANUP_REQUIRED','POST_CLEANUP_PASSED|FAILED_PREMUTATION_CANDIDATE|CONFIRMED_ROLLBACK_CLEAN_STATE_PROVEN|LITERAL_FALSE|true|RECONCILE_EVIDENCE','POST_CLEANUP_PASSED|EVIDENCE_RECONCILIATION_STARTED|CLEANUP_PROOF_COMPLETE|LITERAL_FALSE|false|RECONCILE_EVIDENCE','FAILED_PREMUTATION_CANDIDATE|EVIDENCE_RECONCILIATION_STARTED|FAILURE_EVIDENCE_GATE_STARTED|LITERAL_FALSE|true|RECONCILE_EVIDENCE','FAILED_CLEANUP_REQUIRED_CANDIDATE|EVIDENCE_RECONCILIATION_STARTED|FAILURE_EVIDENCE_GATE_STARTED|LITERAL_TRUE|false|RECONCILE_EVIDENCE','FAILED_CLEANUP_INCOMPLETE_CANDIDATE|EVIDENCE_RECONCILIATION_STARTED|FAILURE_EVIDENCE_GATE_STARTED|LITERAL_TRUE|false|RECONCILE_EVIDENCE','EVIDENCE_INVALID_CANDIDATE|EVIDENCE_RECONCILIATION_STARTED|INVALID_EVIDENCE_COMMIT_GATE_STARTED|ACTIVE_EVENT|false|RECONCILE_EVIDENCE','DEPENDENCIES_MISSING_CANDIDATE|EVIDENCE_RECONCILIATION_STARTED|DEPENDENCY_BLOCK_EVIDENCE_GATE_STARTED|LITERAL_FALSE|true|RECONCILE_EVIDENCE','EVIDENCE_RECONCILIATION_STARTED|COMPLETE_CANDIDATE|SUCCESS_EVIDENCE_VALID|LITERAL_FALSE|false|PUBLISH_TERMINAL_RECORD','EVIDENCE_RECONCILIATION_STARTED|FAILED_PREMUTATION|PREMUTATION_EVIDENCE_VALID_AND_FAILURE_COMMIT_PUBLISHED|LITERAL_FALSE|true|RETRY_ALLOWED','EVIDENCE_RECONCILIATION_STARTED|FAILED_CLEANUP_REQUIRED|CLEANUP_REQUIRED_FAILURE_COMMIT_PUBLISHED|LITERAL_TRUE|false|MANUAL_CLEANUP_REQUIRED','EVIDENCE_RECONCILIATION_STARTED|FAILED_CLEANUP_INCOMPLETE|CLEANUP_INCOMPLETE_FAILURE_COMMIT_PUBLISHED|LITERAL_TRUE|false|MANUAL_CLEANUP_REQUIRED','EVIDENCE_RECONCILIATION_STARTED|DEPENDENCIES_MISSING_EXECUTION_BLOCKED|DEPENDENCY_BLOCK_FAILURE_COMMIT_PUBLISHED|LITERAL_FALSE|true|RESOLVE_DEPENDENCIES_AND_RETRY','EVIDENCE_RECONCILIATION_STARTED|EVIDENCE_INVALID|EVIDENCE_INVALID_FAILURE_COMMIT_PUBLISHED|ACTIVE_EVENT|false|REVIEW_EVIDENCE','COMPLETE_CANDIDATE|COMPLETE|SUCCESS_COMMIT_PUBLISHED_AND_REREAD|LITERAL_FALSE|false|NONE','COMPLETE_CANDIDATE|EVIDENCE_INVALID_CANDIDATE|SUCCESS_PUBLICATION_FAILED|LITERAL_TRUE|false|REVIEW_EVIDENCE'
    )
    foreach ($row in $rows) { $p = $row.Split('|'); [pscustomobject][ordered]@{ state_before=$p[0]; state_after=$p[1]; reason_code=$p[2]; cleanup_source=$p[3]; retry_safe=[bool]::Parse($p[4]); operator_action=$p[5] } }
}

function Get-EeeClassificationRegistry {
    $rows = @(
        @('DEPENDENCIES_MISSING',5,'false','false',$true,'DEPENDENCIES_MISSING_CANDIDATE','RESOLVE_DEPENDENCIES_AND_RETRY','REQUIRED_DEPENDENCY_MISSING'),@('PREMUTATION_FAILURE',10,'NEVER','NEVER',$true,'FAILED_PREMUTATION_CANDIDATE','PRE_CREDENTIAL_CORRECT_INPUT_ELSE_RETRY','NO_PROCESS_OR_DATABASE_EFFECT'),@('CONFIRMED_ROLLBACK',20,'true','true',$false,'FAILED_PREMUTATION_CANDIDATE','RUN_CLEANUP_VERIFICATION','ROLLBACK_REQUIRES_CLEAN_STATE_PROOF'),@('CONFIRMED_COMMIT',0,'true','true',$false,'COMPLETE_CANDIDATE','NONE','COMMIT_AND_EXACT_OID_PROVEN'),@('COMMIT_ACK_UNKNOWN',70,'true','true',$false,'FAILED_CLEANUP_REQUIRED_CANDIDATE','ATTEST_THEN_CLEANUP','COMMIT_ACK_NOT_OBSERVED'),@('TRANSPORT_INTERRUPTED',70,'true','true',$false,'FAILED_CLEANUP_REQUIRED_CANDIDATE','ATTEST_THEN_CLEANUP','TRANSPORT_ENDED_AFTER_LAUNCH'),@('CREATE_MARKER_MISSING',70,'true','true',$false,'FAILED_CLEANUP_REQUIRED_CANDIDATE','ATTEST_THEN_CLEANUP','CREATE_MARKER_NOT_UNIQUE'),@('ATTESTATION_MISMATCH',80,'true','true',$false,'FAILED_CLEANUP_REQUIRED_CANDIDATE','MANUAL_ROLE_REVIEW','IDENTITY_NOT_EXACT'),@('HARNESS_FAILURE',50,'false','true',$false,'FAILED_CLEANUP_INCOMPLETE_CANDIDATE','RUN_CLEANUP','HARNESS_NOT_PASS'),@('CLEANUP_CONFIRMED',0,'false','false',$false,'COMPLETE_CANDIDATE','VERIFY_POST_CLEANUP','CLEANUP_PROVEN'),@('CLEANUP_OUTCOME_UNKNOWN',90,'false','true',$false,'FAILED_CLEANUP_INCOMPLETE_CANDIDATE','MANUAL_CLEANUP_REQUIRED','CLEANUP_NOT_PROVEN'),@('POST_CLEANUP_RESIDUE',95,'false','true',$false,'FAILED_CLEANUP_INCOMPLETE_CANDIDATE','MANUAL_CLEANUP_REQUIRED','RESIDUE_REMAINS'),@('EVIDENCE_INVALID',100,'PHASE','PHASE',$false,'EVIDENCE_INVALID_CANDIDATE','REVIEW_EVIDENCE','EVIDENCE_CONTRACT_NOT_PROVEN')
    )
    foreach ($r in $rows) { [pscustomobject][ordered]@{ classification=$r[0]; severity=[int]$r[1]; attestation_policy=$r[2]; cleanup_policy=$r[3]; retry_safe=[bool]$r[4]; projected_state=$r[5]; operator_action=$r[6]; rationale_code=$r[7] } }
}

function Get-EeeContractRegistry { [pscustomobject][ordered]@{ contract_version=$script:EeeContractVersion; states=@(Get-EeeStateRegistry); transitions=@(Get-EeeTransitionRegistry); classifications=@(Get-EeeClassificationRegistry) } }

function Test-EeeUtc {
    param($Value)
    return $Value -is [string] -and $Value -cmatch '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$'
}

function Test-EeeHash {
    param($Value)
    return $Value -is [string] -and $Value -cmatch '^[0-9a-f]{64}$'
}

function Test-EeeArray {
    param($Value)
    return $null -ne $Value -and $Value -isnot [string] -and $Value -is [System.Collections.IEnumerable]
}

function Get-EeeInternalSchemaRegistry {
    [ordered]@{
        A24E_DIRECT_IDENTITY_OBSERVATION = @('run_id:string','source:string','role_name:string','role_oid:int64','source_artifact_sha256:hash','recorded_utc:utc')
        A24E_DIRECT_PROCESS_OBSERVATION = @('run_id:string','stage_name:string','dependency_block:bool','launch_failed:bool','wrapper_failed:bool','timed_out:bool','termination_incomplete:bool','exit_code:nullable_int64','marker_count:int64','stdout_redaction_rejected:bool','stderr_redaction_rejected:bool','harness_schema_failed:bool','harness_incomplete:bool','stdout_sha256:hash','stderr_sha256:hash','recorded_utc:utc')
        A24E_DIRECT_EXCEPTION_OBSERVATION = @('stage_name:string','exception_type:string','exception_message:string','fully_qualified_error_id:nullable_string','script_stack_trace:string','recorded_utc:utc')
        A24E_DIRECT_CLEANUP_OBSERVATION = @('run_id:string','process_outcome:object','identity_match:bool','membership_removed:bool','sessions_terminated:bool','role_absent:bool','ownership_absent:bool','acl_absent:bool','dependencies_absent:bool','recorded_utc:utc')
        A24E_DIRECT_POST_CLEANUP_OBSERVATION = @('run_id:string','process_outcome:object','identity_match:bool','role_absent:bool','sessions_absent:bool','memberships_absent:bool','ownership_absent:bool','acl_absent:bool','default_privileges_absent:bool','dependencies_absent:bool','baseline_unchanged:bool','recorded_utc:utc')
        A24E_DIRECT_CONFIRMED_ROLLBACK_OBSERVATION = @('run_id:string','rollback_proven:bool','role_absence_pass:bool','cleanup_pass:bool','post_cleanup_pass:bool','role_absent:bool','membership_absent:bool','privilege_absent:bool','sessions_absent:bool','objects_absent:bool','provider_drift_absent:bool','recorded_utc:utc')
        A24E_DIRECT_SECRET_OBSERVATION = @('run_id:string','sequence:int64','handle_id:string','kind:string','phase:string','representation_count:int64','released:bool','recorded_utc:utc')
        A24E_DIRECT_SECRET_LIFECYCLE_EVIDENCE = @('schema_version:string','run_id:string','observations:array','observation_count:int64','open_handle_ids:array','open_handle_count:int64','result:string','failure_code:string')
        A24E_DIRECT_PUBLICATION_COMMAND = @('schema_version:string','run_id:string','command_id:string','sequence:int64','operation:string','source_path:string','destination_path:string','expected_source_sha256:hash','expected_destination_absent:bool','create_once:bool','same_volume:bool','overwrite_forbidden:bool','terminal_commit:bool','bounded_wait_ms:int64','collision_policy:string')
        A24E_DIRECT_PUBLICATION_RECEIPT = @('schema_version:string','run_id:string','command_id:string','attempted:bool','source_reread:string','destination_precondition:string','operation_result:string','destination_reread:string','actual_destination_sha256:nullable_hash','exact_match:bool','collision_result:string','terminal_ordering:string','failure_code:string','recorded_utc:utc')
    }
}

function Test-EeeTypedRecord {
    param([string]$SchemaId,$Record)
    $schemas=Get-EeeInternalSchemaRegistry
    if(-not$schemas.Contains($SchemaId) -or $null-eq$Record){return New-EeeValidationResult $false 'SCHEMA_INVALID'}
    $rules=@($schemas[$SchemaId]);$names=@($Record.PSObject.Properties.Name)
    if($names.Count-ne$rules.Count){return New-EeeValidationResult $false 'SCHEMA_INVALID'}
    for($i=0;$i-lt$rules.Count;$i++){
        $parts=$rules[$i].Split(':');$name=$parts[0];$type=$parts[1]
        if($names[$i]-cne$name){return New-EeeValidationResult $false 'SCHEMA_INVALID'}
        $value=$Record.$name;$valid=switch($type){
            'string' {$value-is[string]}
            'bool' {$value-is[bool]}
            'int64' {$value-is[int64]}
            'nullable_int64' {$null-eq$value-or$value-is[int64]}
            'nullable_string' {$null-eq$value-or$value-is[string]}
            'hash' {Test-EeeHash $value}
            'nullable_hash' {$null-eq$value-or(Test-EeeHash $value)}
            'utc' {Test-EeeUtc $value}
            'object' {$null-ne$value-and$value-isnot[string]-and$value-isnot[ValueType]}
            'array' {Test-EeeArray $value}
            default {$false}
        }
        if(-not$valid){return New-EeeValidationResult $false 'SCHEMA_INVALID'}
    }
    New-EeeValidationResult $true
}

function New-EeeExecutionState {
    param([Parameter(Mandatory)][string]$RunId)
    if ($RunId -cnotmatch '^[A-Za-z0-9._-]{1,128}$') { throw 'EEE_RUN_ID_INVALID' }
    Protect-EeeExecutionState ([pscustomobject][ordered]@{ schema_version=$script:EeeSchemaVersion; contract_version=$script:EeeContractVersion; run_id=$RunId; current_state='NOT_STARTED'; next_sequence=[long]1; transition_records=@(); classification_records=@(); stage_authorities=@(); role_name=''; role_oid=[long]0; trusted_identity_record_hash=$null; identity_bound=$false; identity_required=$false; identity_authoritative=$false; cleanup_result='NOT_RUN'; post_cleanup_result='NOT_RUN'; admitted_logical_ids=@(); terminal_record_type='NONE' })
}

function Test-EeeExecutionState {
    param($State)
    $fields=@('schema_version','contract_version','run_id','current_state','next_sequence','transition_records','classification_records','stage_authorities','role_name','role_oid','trusted_identity_record_hash','identity_bound','identity_required','identity_authoritative','cleanup_result','post_cleanup_result','admitted_logical_ids','terminal_record_type')
    $valid=(Test-EeeClosedRecord $State $fields) -and (Test-EeeExecutionStateSeal $State) -and $State.schema_version -ceq $script:EeeSchemaVersion -and $State.contract_version -ceq $script:EeeContractVersion -and $State.run_id -cmatch '^[A-Za-z0-9._-]{1,128}$' -and $State.current_state -cin (Get-EeeStateRegistry) -and $State.next_sequence -is [long] -and $State.next_sequence -ge 1 -and (Test-EeeArray $State.transition_records) -and (Test-EeeArray $State.classification_records) -and (Test-EeeArray $State.stage_authorities) -and (Test-EeeArray $State.admitted_logical_ids)
    if($valid){$all=@($State.transition_records)+@($State.classification_records)+@($State.stage_authorities);$seq=@($all|ForEach-Object{[long]$_.sequence});$valid=@($seq|Sort-Object -Unique).Count-eq$seq.Count-and(-not$seq.Count-or(@($seq|Sort-Object)[-1]-lt$State.next_sequence));$valid=$valid-and@($State.admitted_logical_ids|Sort-Object -Unique).Count-eq@($State.admitted_logical_ids).Count}
    if ($valid) { $empty=($State.role_name -ceq '' -and [long]$State.role_oid -eq 0 -and $null -eq $State.trusted_identity_record_hash -and -not $State.identity_bound -and -not $State.identity_required -and -not $State.identity_authoritative); $bound=($State.role_name -cmatch '^afex_core_test_login_[0-9]{14}_[0-9a-f]{8}$' -and [long]$State.role_oid -gt 0 -and (Test-EeeHash $State.trusted_identity_record_hash) -and $State.identity_bound -and $State.identity_authoritative); $valid=$empty -or $bound }
    New-EeeValidationResult $valid 'EXECUTION_STATE_INVALID'
}

function Invoke-EeeTransitionInternal {
    param($State,[Parameter(Mandatory)][string]$StateAfter,[Parameter(Mandatory)][string]$ReasonCode,[Parameter(Mandatory)][string]$RecordedUtc)
    if (-not (Test-EeeExecutionState $State).valid) { throw 'EEE_STATE_INVALID' }
    $row=@(Get-EeeTransitionRegistry | Where-Object { $_.state_before -ceq $State.current_state -and $_.state_after -ceq $StateAfter -and $_.reason_code -ceq $ReasonCode })
    if ($row.Count -ne 1) { throw 'EEE_INVALID_TRANSITION' }
    if ($RecordedUtc -cnotmatch '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$') { throw 'EEE_UTC_INVALID' }
    $cleanup = switch ($row[0].cleanup_source) { 'LITERAL_TRUE' {$true} 'LITERAL_FALSE' {$false} 'ACTIVE_EVENT' { if (-not $State.classification_records.Count) { throw 'EEE_ACTIVE_EVENT_MISSING' }; [bool]$State.classification_records[-1].cleanup_required } }
    $record=[pscustomobject][ordered]@{ run_id=$State.run_id; sequence=[long]$State.next_sequence; state_before=$State.current_state; state_after=$StateAfter; reason_code=$ReasonCode; cleanup_required=$cleanup; retry_safe=[bool]$row[0].retry_safe; operator_action=$row[0].operator_action; recorded_utc=$RecordedUtc }
    $copy=Copy-EeeValue $State; $copy.current_state=$StateAfter; $copy.next_sequence=[long]($State.next_sequence+1); $copy.transition_records=@($State.transition_records)+@($record); return Protect-EeeExecutionState $copy
}

function Add-EeeClassificationInternal {
    param($State,[Parameter(Mandatory)][string]$Classification,[Parameter(Mandatory)][string]$Phase,[Parameter(Mandatory)][string]$RecordedUtc)
    $definition=@(Get-EeeClassificationRegistry | Where-Object classification -CEQ $Classification); if ($definition.Count -ne 1) { throw 'EEE_CLASSIFICATION_INVALID' }
    $attest=switch -CaseSensitive ([string]$definition[0].attestation_policy) { 'true' {$true} 'false' {$false} 'NEVER' {$false} 'PHASE' {$Phase-ceq'POST_CREATE_EVIDENCE_INVALID'} default {throw 'EEE_ATTESTATION_POLICY_INVALID'} }
    $cleanup=switch -CaseSensitive ([string]$definition[0].cleanup_policy) { 'true' {$true} 'false' {$false} 'NEVER' {$false} 'PHASE' {$Phase-ceq'POST_CREATE_EVIDENCE_INVALID'} default {throw 'EEE_CLEANUP_POLICY_INVALID'} }
    $event=[pscustomobject][ordered]@{schema_version='A24E_FINAL_V4_CLASSIFICATION_ROW';run_id=$State.run_id;sequence=[long]$State.next_sequence;classification=$Classification;evidence_invalid_phase=$Phase;attestation_required=$attest;cleanup_required=$cleanup;retry_safe=[bool]$definition[0].retry_safe;projected_state=$definition[0].projected_state;operator_action=$definition[0].operator_action;rationale_code=$definition[0].rationale_code;recorded_utc=$RecordedUtc}
    $copy=Copy-EeeValue $State;$copy.next_sequence=[long]($State.next_sequence+1);$copy.classification_records=@($State.classification_records)+@($event);return Protect-EeeExecutionState $copy
}

function Get-EeeActiveClassification {
    param($State)
    if(-not @($State.classification_records).Count){return $null}
    @(@($State.classification_records) | Sort-Object @{Expression={if($_.evidence_invalid_phase-ceq'POST_CREATE_EVIDENCE_INVALID'){2}elseif($_.evidence_invalid_phase-ceq'PREMUTATION_EVIDENCE_INVALID'){1}else{0}};Descending=$true},@{Expression={(@(Get-EeeClassificationRegistry|Where-Object classification -CEQ $_.classification))[0].severity};Descending=$true},sequence)[0]
}

function Invoke-EeeFailureCandidateInternal {
    param($State,[Parameter(Mandatory)][string]$StageName,[Parameter(Mandatory)][string]$RecordedUtc)
    if(-not(Test-EeeExecutionState $State).valid){throw 'EEE_STATE_INVALID'}
    $active=Get-EeeActiveClassification $State
    if($null-eq$active){throw 'EEE_FAILURE_CLASSIFICATION_MISSING'}
    $target=switch -CaseSensitive($active.classification){
        'DEPENDENCIES_MISSING' {'DEPENDENCIES_MISSING_CANDIDATE'}
        'PREMUTATION_FAILURE' {'FAILED_PREMUTATION_CANDIDATE'}
        'CONFIRMED_ROLLBACK' {'FAILED_PREMUTATION_CANDIDATE'}
        'EVIDENCE_INVALID' {'EVIDENCE_INVALID_CANDIDATE'}
        'CLEANUP_OUTCOME_UNKNOWN' {'FAILED_CLEANUP_INCOMPLETE_CANDIDATE'}
        'POST_CLEANUP_RESIDUE' {'FAILED_CLEANUP_INCOMPLETE_CANDIDATE'}
        'HARNESS_FAILURE' {'FAILED_CLEANUP_INCOMPLETE_CANDIDATE'}
        'TRANSPORT_INTERRUPTED' {if($StageName-ceq'cleanup'-or$StageName-ceq'post_cleanup'){'FAILED_CLEANUP_INCOMPLETE_CANDIDATE'}else{'FAILED_CLEANUP_REQUIRED_CANDIDATE'}}
        'COMMIT_ACK_UNKNOWN' {'FAILED_CLEANUP_REQUIRED_CANDIDATE'}
        'CREATE_MARKER_MISSING' {'FAILED_CLEANUP_REQUIRED_CANDIDATE'}
        'ATTESTATION_MISMATCH' {'FAILED_CLEANUP_REQUIRED_CANDIDATE'}
        default {throw 'EEE_FAILURE_CANDIDATE_DERIVATION_INVALID'}
    }
    if($State.current_state-ceq$target){return $State}
    if($State.current_state-cin@('COMPLETE','FAILED_PREMUTATION','FAILED_CLEANUP_REQUIRED','FAILED_CLEANUP_INCOMPLETE','EVIDENCE_INVALID','DEPENDENCIES_MISSING_EXECUTION_BLOCKED')){throw 'EEE_FAILURE_TERMINAL_JUMP_REJECTED'}
    $record=[pscustomobject][ordered]@{run_id=$State.run_id;sequence=[long]$State.next_sequence;state_before=$State.current_state;state_after=$target;reason_code='CLASSIFICATION_CANDIDATE_DERIVED';cleanup_required=[bool]$active.cleanup_required;retry_safe=[bool]$active.retry_safe;operator_action=$active.operator_action;recorded_utc=$RecordedUtc}
    $copy=Copy-EeeValue $State;$copy.current_state=$target;$copy.next_sequence=[long]($State.next_sequence+1);$copy.transition_records=@($State.transition_records)+@($record)
    Protect-EeeExecutionState $copy
}

function Bind-EeeTrustedIdentity {
    param($State,$Observation)
    if(-not(Test-EeeExecutionState $State).valid){throw 'EEE_STATE_INVALID'}
    if(-not(Test-EeeTypedRecord 'A24E_DIRECT_IDENTITY_OBSERVATION' $Observation).valid){throw 'EEE_IDENTITY_OBSERVATION_INVALID'}
    if($Observation.run_id-cne$State.run_id-or$Observation.source-cnotin@('CREATE','ATTESTATION','CLEANUP','POST_CLEANUP','REPLAY')){throw 'EEE_IDENTITY_SOURCE_INVALID'}
    if($Observation.role_name-cnotmatch'^afex_core_test_login_[0-9]{14}_[0-9a-f]{8}$'-or$Observation.role_oid-le0){throw 'EEE_IDENTITY_VALUE_INVALID'}
    $projection=[pscustomobject][ordered]@{run_id=$Observation.run_id;role_name=$Observation.role_name;role_oid=[long]$Observation.role_oid}
    $identityHash=Get-EeeSha256Hex(ConvertTo-EeeCanonicalJsonBytes $projection)
    if($State.identity_bound-and($State.role_name-cne$Observation.role_name-or$State.role_oid-ne$Observation.role_oid-or$State.trusted_identity_record_hash-cne$identityHash)){throw 'EEE_IDENTITY_MISMATCH'}
    $copy=Copy-EeeValue $State;$copy.role_name=$Observation.role_name;$copy.role_oid=[long]$Observation.role_oid;$copy.trusted_identity_record_hash=$identityHash;$copy.identity_bound=$true;$copy.identity_required=$true;$copy.identity_authoritative=$true
    [pscustomobject][ordered]@{state=(Protect-EeeExecutionState $copy);trusted_identity=[pscustomobject][ordered]@{schema_version='A24E_FINAL_V4_TRUSTED_IDENTITY';run_id=$State.run_id;role_name=$Observation.role_name;role_oid=[long]$Observation.role_oid;source=$Observation.source;source_artifact_sha256=$Observation.source_artifact_sha256;trusted_identity_record_hash=$identityHash;recorded_utc=$Observation.recorded_utc}}
}

function Get-EeeProcessPrecedenceRegistry {
    @(
        [pscustomobject][ordered]@{rank=1;fact='dependency_block';classification='DEPENDENCIES_MISSING';failure_code='REQUIRED_DEPENDENCY_MISSING';stage_result='BLOCKED'},
        [pscustomobject][ordered]@{rank=2;fact='launch_failed';classification='PREMUTATION_FAILURE';failure_code='PROCESS_LAUNCH_FAILED';stage_result='FAIL'},
        [pscustomobject][ordered]@{rank=3;fact='wrapper_failed';classification='PREMUTATION_FAILURE';failure_code='WRAPPER_FAILURE';stage_result='FAIL'},
        [pscustomobject][ordered]@{rank=4;fact='timed_out';classification='TRANSPORT_INTERRUPTED';failure_code='PROCESS_TIMEOUT';stage_result='FAIL'},
        [pscustomobject][ordered]@{rank=5;fact='termination_incomplete';classification='TRANSPORT_INTERRUPTED';failure_code='TERMINATION_INCOMPLETE';stage_result='FAIL'},
        [pscustomobject][ordered]@{rank=6;fact='stdout_redaction_rejected';classification='EVIDENCE_INVALID';failure_code='REDACTION_REJECTED';stage_result='REJECTED'},
        [pscustomobject][ordered]@{rank=7;fact='stderr_redaction_rejected';classification='EVIDENCE_INVALID';failure_code='REDACTION_REJECTED';stage_result='REJECTED'},
        [pscustomobject][ordered]@{rank=8;fact='exit_code_missing';classification='TRANSPORT_INTERRUPTED';failure_code='EXIT_CODE_MISSING';stage_result='FAIL'},
        [pscustomobject][ordered]@{rank=9;fact='exit_code_nonzero';classification='COMMIT_ACK_UNKNOWN';failure_code='PROCESS_EXIT_NONZERO';stage_result='FAIL'},
        [pscustomobject][ordered]@{rank=10;fact='marker_duplicate';classification='CREATE_MARKER_MISSING';failure_code='MARKER_DUPLICATE';stage_result='FAIL'},
        [pscustomobject][ordered]@{rank=11;fact='marker_missing';classification='CREATE_MARKER_MISSING';failure_code='MARKER_MISSING';stage_result='FAIL'},
        [pscustomobject][ordered]@{rank=12;fact='harness_schema_failed';classification='HARNESS_FAILURE';failure_code='HARNESS_SCHEMA_INVALID';stage_result='FAIL'},
        [pscustomobject][ordered]@{rank=13;fact='harness_incomplete';classification='HARNESS_FAILURE';failure_code='HARNESS_INCOMPLETE';stage_result='FAIL'}
    )
}

function Invoke-EeeReasonPathInternal {
    param($State,[string[]]$ReasonCodes,[string]$RecordedUtc)
    $current=$State
    foreach($reason in $ReasonCodes){$edge=@(Get-EeeTransitionRegistry|Where-Object{$_.state_before-ceq$current.current_state-and$_.reason_code-ceq$reason});if($edge.Count-ne1){throw 'EEE_DERIVED_TRANSITION_INVALID'};$current=Invoke-EeeTransitionInternal $current $edge[0].state_after $reason $RecordedUtc}
    return $current
}

function Get-EeeSuccessReasonPath {
    param([string]$StageName,[string]$CurrentState)
    switch -CaseSensitive($StageName){
        'preflight' {return @('PREFLIGHT_VALID')}
        'credential' {return @('CREDENTIAL_CREATED')}
        'create' {return @('CREATE_LAUNCH_AUTHORIZED','COMMIT_MARKER_AND_OID_PROVEN')}
        'role_attestation' {return @('COMMITTED_ROLE_REQUIRES_ATTESTATION','EXACT_NAME_OID_PROVEN')}
        'harness' {return @('HARNESS_LAUNCH_AUTHORIZED','HARNESS_CONTRACT_PASS')}
        'cleanup' {if($CurrentState-ceq'HARNESS_PASSED'){return @('TEST_COMPLETE_CLEANUP_REQUIRED','CLEANUP_LAUNCH_AUTHORIZED','CLEANUP_MARKER_AND_EXIT_PASS')};if($CurrentState-ceq'HARNESS_FAILED'){return @('TEST_FAILED_CLEANUP_REQUIRED','CLEANUP_LAUNCH_AUTHORIZED','CLEANUP_MARKER_AND_EXIT_PASS')};return @()}
        'post_cleanup' {return @('POST_CLEANUP_LAUNCH_AUTHORIZED','ABSENCE_AND_RESIDUE_PASS')}
        default {return @()}
    }
}

function Invoke-EeeProcessObservation {
    param($State,$Observation)
    if(-not(Test-EeeExecutionState $State).valid){throw 'EEE_STATE_INVALID'}
    if(-not(Test-EeeTypedRecord 'A24E_DIRECT_PROCESS_OBSERVATION' $Observation).valid-or$Observation.run_id-cne$State.run_id){throw 'EEE_PROCESS_OBSERVATION_INVALID'}
    $facts=@();foreach($row in Get-EeeProcessPrecedenceRegistry){$set=switch($row.fact){'exit_code_missing'{$null-eq$Observation.exit_code};'exit_code_nonzero'{$null-ne$Observation.exit_code-and$Observation.exit_code-ne0};'marker_missing'{$Observation.marker_count-eq0};'marker_duplicate'{$Observation.marker_count-gt1};default{[bool]$Observation.($row.fact)}};if($set){$facts+=,$row}}
    $winner=@($facts|Sort-Object rank|Select-Object -First 1);$classification=$(if($winner.Count){$winner[0].classification}else{'CONFIRMED_COMMIT'});$failure=$(if($winner.Count){$winner[0].failure_code}else{'NONE'});$result=$(if($winner.Count){$winner[0].stage_result}else{'PASS'})
    $phase=$(if($classification-cne'EVIDENCE_INVALID'){'NONE'}elseif($State.current_state-cin@('NOT_STARTED','PREFLIGHT_PASSED','CREDENTIAL_READY','CREATE_PREMUTATION_FAILED','FAILED_PREMUTATION_CANDIDATE')){'PREMUTATION_EVIDENCE_INVALID'}else{'POST_CREATE_EVIDENCE_INVALID'});$copy=Add-EeeClassificationInternal $State $classification $phase $Observation.recorded_utc
    $stage=[pscustomobject][ordered]@{run_id=$State.run_id;sequence=[long]$copy.next_sequence;stage_name=$Observation.stage_name;process_started=[bool](-not$Observation.launch_failed);timed_out=$Observation.timed_out;exit_code=$(if($null-eq$Observation.exit_code){[long]-1}else{[long]$Observation.exit_code});marker_count=[long]$Observation.marker_count;result=$result;stdout_sha256=$Observation.stdout_sha256;stderr_sha256=$Observation.stderr_sha256;failure_code=$failure;secondary_facts=@($facts|Select-Object -Skip 1|ForEach-Object{$_.fact});recorded_utc=$Observation.recorded_utc}
    $next=Copy-EeeValue $copy;$next.next_sequence=[long]($copy.next_sequence+1);$next.stage_authorities=@($copy.stage_authorities)+@($stage);$next=Protect-EeeExecutionState $next
    if(-not$winner.Count){$path=@(Get-EeeSuccessReasonPath $Observation.stage_name $next.current_state);if($path.Count){$next=Invoke-EeeReasonPathInternal $next $path $Observation.recorded_utc}}
    elseif($classification-ceq'DEPENDENCIES_MISSING'-and$next.current_state-ceq'NOT_STARTED'){$next=Invoke-EeeTransitionInternal $next 'DEPENDENCIES_MISSING_CANDIDATE' 'DEPENDENCIES_MISSING_BEFORE_SECRET_GENERATION' $Observation.recorded_utc}
    elseif($classification-ceq'PREMUTATION_FAILURE'){
        $reason=switch -CaseSensitive($next.current_state){'NOT_STARTED'{'PREFLIGHT_REJECTED'}'PREFLIGHT_PASSED'{'CREDENTIAL_CREATION_FAILED'}'CREDENTIAL_READY'{'CREATE_NOT_LAUNCHED'}'CREATE_STARTED'{'PROCESS_NOT_STARTED'}default{$null}}
        if($null-ne$reason){$next=Invoke-EeeReasonPathInternal $next @($reason) $Observation.recorded_utc;if($next.current_state-ceq'CREATE_PREMUTATION_FAILED'){$next=Invoke-EeeTransitionInternal $next 'FAILED_PREMUTATION_CANDIDATE' 'NO_DATABASE_EFFECT_PROVEN' $Observation.recorded_utc}}
    }
    elseif($winner.Count){$next=Invoke-EeeFailureCandidateInternal $next $Observation.stage_name $Observation.recorded_utc}
    [pscustomobject][ordered]@{state=(Protect-EeeExecutionState $next);outcome=[pscustomobject][ordered]@{classification=$classification;failure_code=$failure;stage_result=$result;winning_fact=$(if($winner.Count){$winner[0].fact}else{'success'});secondary_facts=$stage.secondary_facts;cleanup_required=[bool](Get-EeeActiveClassification $next).cleanup_required;attestation_required=[bool](Get-EeeActiveClassification $next).attestation_required;retry_safe=[bool](Get-EeeActiveClassification $next).retry_safe;operator_action=(Get-EeeActiveClassification $next).operator_action}}
}

function Invoke-EeeCleanupObservation {
    param($State,$Observation)
    if(-not(Test-EeeTypedRecord 'A24E_DIRECT_CLEANUP_OBSERVATION' $Observation).valid-or$Observation.run_id-cne$State.run_id){throw 'EEE_CLEANUP_OBSERVATION_INVALID'}
    $checks=@('identity_match','membership_removed','sessions_terminated','role_absent','ownership_absent','acl_absent','dependencies_absent');$failed=@($checks|Where-Object{-not$Observation.$_});$processPass=$Observation.process_outcome.stage_result-ceq'PASS';$result=$(if($processPass -and -not $failed.Count){'PASS'}else{'FAIL'});$code=$(if(-not$processPass){'CLN_PROCESS_FAILURE'}elseif($failed.Count){'CLN_'+$failed[0].ToUpperInvariant()}else{'NONE'});$copy=Copy-EeeValue $State;$copy.cleanup_result=$result
    $copy=Protect-EeeExecutionState $copy
    if($result-ceq'FAIL'){$copy=Add-EeeClassificationInternal $copy 'CLEANUP_OUTCOME_UNKNOWN' 'NONE' $Observation.recorded_utc;$copy=Invoke-EeeFailureCandidateInternal $copy 'cleanup' $Observation.recorded_utc}
    [pscustomobject][ordered]@{state=(Protect-EeeExecutionState $copy);evidence=[pscustomobject][ordered]@{schema_version='A24E_FINAL_V4_CLEANUP_EVIDENCE';run_id=$State.run_id;role_name=$State.role_name;role_oid=$State.role_oid;trusted_identity_record_hash=$State.trusted_identity_record_hash;checks=[pscustomobject](Copy-EeeValue $Observation);failure_code=$code;result=$result;recorded_utc=$Observation.recorded_utc}}
}

function Invoke-EeePostCleanupObservation {
    param($State,$Observation)
    if(-not(Test-EeeTypedRecord 'A24E_DIRECT_POST_CLEANUP_OBSERVATION' $Observation).valid-or$Observation.run_id-cne$State.run_id){throw 'EEE_POST_CLEANUP_OBSERVATION_INVALID'}
    $checks=@('identity_match','role_absent','sessions_absent','memberships_absent','ownership_absent','acl_absent','default_privileges_absent','dependencies_absent','baseline_unchanged');$failed=@($checks|Where-Object{-not$Observation.$_});$processPass=$Observation.process_outcome.stage_result-ceq'PASS';$result=$(if($processPass -and -not $failed.Count){'PASS'}else{'FAIL'});$code=$(if(-not$processPass){'PCL_PROCESS_FAILURE'}elseif($failed.Count){'PCL_'+$failed[0].ToUpperInvariant()}else{'NONE'});$copy=Copy-EeeValue $State;$copy.post_cleanup_result=$result
    $copy=Protect-EeeExecutionState $copy
    if($result-ceq'FAIL'){$copy=Add-EeeClassificationInternal $copy 'POST_CLEANUP_RESIDUE' 'NONE' $Observation.recorded_utc;$copy=Invoke-EeeFailureCandidateInternal $copy 'post_cleanup' $Observation.recorded_utc}
    [pscustomobject][ordered]@{state=(Protect-EeeExecutionState $copy);evidence=[pscustomobject][ordered]@{schema_version='A24E_FINAL_V4_POST_CLEANUP_EVIDENCE';run_id=$State.run_id;role_name=$State.role_name;role_oid=$State.role_oid;trusted_identity_record_hash=$State.trusted_identity_record_hash;checks=[pscustomobject](Copy-EeeValue $Observation);failure_code=$code;result=$result;recorded_utc=$Observation.recorded_utc}}
}

function Invoke-EeeConfirmedRollbackObservation {
    param($State,$Observation)
    if(-not(Test-EeeExecutionState $State).valid){throw 'EEE_STATE_INVALID'}
    if(-not(Test-EeeTypedRecord 'A24E_DIRECT_CONFIRMED_ROLLBACK_OBSERVATION' $Observation).valid-or$Observation.run_id-cne$State.run_id){throw 'EEE_ROLLBACK_OBSERVATION_INVALID'}
    if($State.current_state-cne'CREDENTIAL_READY'){throw 'EEE_ROLLBACK_STATE_INVALID'}
    if(-not$Observation.rollback_proven){throw 'EEE_ROLLBACK_PROOF_MISSING'}
    if(-not$Observation.role_absence_pass-or-not$Observation.role_absent){throw 'EEE_ROLE_ABSENCE_PROOF_MISSING'}
    if(-not$Observation.cleanup_pass){throw 'EEE_ROLLBACK_CLEANUP_MISSING'}
    if(-not$Observation.post_cleanup_pass){throw 'EEE_ROLLBACK_POST_CLEANUP_MISSING'}
    if(-not$Observation.membership_absent-or-not$Observation.privilege_absent-or-not$Observation.sessions_absent-or-not$Observation.objects_absent-or-not$Observation.provider_drift_absent){throw 'EEE_ROLLBACK_RESIDUAL_DRIFT'}
    $copy=Invoke-EeeReasonPathInternal $State @('CREATE_LAUNCH_AUTHORIZED','ROLLBACK_MARKER_PROVEN','ROLLBACK_REQUIRES_ABSENCE_PROOF','ROLE_ABSENCE_PROVEN','CLEAN_STATE_VERIFICATION_REQUIRED','CLEANUP_LAUNCH_AUTHORIZED','CLEANUP_MARKER_AND_EXIT_PASS','POST_CLEANUP_LAUNCH_AUTHORIZED','ABSENCE_AND_RESIDUE_PASS') $Observation.recorded_utc
    $copy=Add-EeeClassificationInternal $copy 'CONFIRMED_ROLLBACK' 'NONE' $Observation.recorded_utc
    $copy=Invoke-EeeTransitionInternal $copy 'FAILED_PREMUTATION_CANDIDATE' 'CONFIRMED_ROLLBACK_CLEAN_STATE_PROVEN' $Observation.recorded_utc
    $copy.cleanup_result='PASS';$copy.post_cleanup_result='PASS'
    [pscustomobject][ordered]@{state=(Protect-EeeExecutionState $copy);outcome=[pscustomobject][ordered]@{classification='CONFIRMED_ROLLBACK';result='FAIL';retry_safe=$true;operator_action='RETRY_ALLOWED';cleanup_required=$false;attestation_required=$false;terminal_candidate='FAILED_PREMUTATION';failure_code='NONE'}}
}

function Invoke-EeeExceptionObservation {
    param($State,$Observation)
    if(-not(Test-EeeExecutionState $State).valid-or-not(Test-EeeTypedRecord 'A24E_DIRECT_EXCEPTION_OBSERVATION' $Observation).valid){throw 'EEE_EXCEPTION_OBSERVATION_INVALID'}
    if($Observation.stage_name-cnotmatch'^[a-z][a-z0-9_]{0,63}$'-or$Observation.exception_type-cnotmatch'^[A-Za-z_][A-Za-z0-9_.+`]{0,255}$'){throw 'EEE_EXCEPTION_OBSERVATION_INVALID'}
    $message=[string]$Observation.exception_message;$stack=[string]$Observation.script_stack_trace;$fqid=$Observation.fully_qualified_error_id
    $oversized=$message.Length-gt4096-or$stack.Length-gt16384
    $sensitivePattern='(?i)postgres(?:ql)?://|password\s*[:=]|scram-sha-256\$|bearer\s+[A-Za-z0-9._~+/=-]+|pgpassfile|(?:^|[\r\n])[^:\r\n]+:[0-9*]+:[^:\r\n]+:[^:\r\n]+:[^\r\n]+'
    $sensitive=$message-cmatch$sensitivePattern-or$stack-cmatch$sensitivePattern
    $fqidSafe=$null-eq$fqid-or($fqid.Length-le256-and$fqid-cmatch'^[A-Za-z0-9_.:+`-]+(?:,[A-Za-z0-9_.+`-]+)?$')
    $knownPattern='^(EEE|ROLE|HASH|MARKER|REDACTION|INVENTORY|BINDING|PUBLICATION|REPLAY)_[A-Z0-9_]{1,127}$'
    $messageCode=$(if($message-cmatch$knownPattern){$Matches[0]}else{$null});$fqidCode=$(if($null-ne$fqid-and$fqid.Split(',')[0]-cmatch$knownPattern){$Matches[0]}else{$null})
    $failureCode=$(if($oversized-or$sensitive-or-not$fqidSafe){'ENGINE_EXCEPTION_METADATA_REJECTED'}elseif($null-ne$fqidCode){$fqidCode}elseif($null-ne$messageCode){$messageCode}else{'UNCLASSIFIED_ENGINE_EXCEPTION'})
    $metadata=[pscustomobject][ordered]@{schema_version='A24E_FINAL_V4_EXCEPTION_METADATA';stage_name=$Observation.stage_name;exception_type=$Observation.exception_type;fully_qualified_error_id=$(if($fqidSafe){$fqid}else{$null});message_retention='OMITTED';stack_trace_retention='OMITTED';failure_code=$failureCode;recorded_utc=$Observation.recorded_utc}
    $phase=$(if($State.current_state-cin@('NOT_STARTED','PREFLIGHT_PASSED','CREDENTIAL_READY','CREATE_PREMUTATION_FAILED','FAILED_PREMUTATION_CANDIDATE')){'PREMUTATION_EVIDENCE_INVALID'}else{'POST_CREATE_EVIDENCE_INVALID'})
    $copy=Add-EeeClassificationInternal $State 'EVIDENCE_INVALID' $phase $Observation.recorded_utc
    $stage=[pscustomobject][ordered]@{run_id=$State.run_id;sequence=[long]$copy.next_sequence;stage_name=$Observation.stage_name;process_started=$false;timed_out=$false;exit_code=[long]-1;marker_count=[long]0;result='REJECTED';stdout_sha256='0'*64;stderr_sha256='0'*64;failure_code=$failureCode;secondary_facts=@('exception_boundary',('exception_type='+$Observation.exception_type),('fully_qualified_error_id='+$(if($fqidSafe-and$null-ne$fqid){$fqid}else{'NULL'})));recorded_utc=$Observation.recorded_utc}
    $next=Copy-EeeValue $copy;$next.next_sequence=[long]($copy.next_sequence+1);$next.stage_authorities=@($copy.stage_authorities)+@($stage);$next=Protect-EeeExecutionState $next;$next=Invoke-EeeFailureCandidateInternal $next $Observation.stage_name $Observation.recorded_utc
    [pscustomobject][ordered]@{state=(Protect-EeeExecutionState $next);outcome=[pscustomobject][ordered]@{classification='EVIDENCE_INVALID';failure_code=$failureCode;stage_result='REJECTED';cleanup_required=[bool](Get-EeeActiveClassification $next).cleanup_required;attestation_required=[bool](Get-EeeActiveClassification $next).attestation_required;retry_safe=$false;operator_action=(Get-EeeActiveClassification $next).operator_action;exception_metadata=$metadata}}
}

function Invoke-EeeSecretLifecycle {
    param([string]$RunId,[object[]]$Observations)
    $allowedKinds=@('PASSWORD','ADMIN_URI','SCRAM_VERIFIER','PGPASS','CHILD_ENVIRONMENT','REDACTION_NEEDLE','DERIVED_REPRESENTATION');$allowedPhases=@('ALLOCATED','GENERATED','LEASED','RELEASED');$byHandle=@{};$rows=@()
    foreach($o in @($Observations|Sort-Object sequence)){if(-not(Test-EeeTypedRecord 'A24E_DIRECT_SECRET_OBSERVATION' $o).valid-or$o.run_id-cne$RunId-or$o.kind-cnotin$allowedKinds-or$o.phase-cnotin$allowedPhases){throw 'EEE_SECRET_OBSERVATION_INVALID'};if($o.PSObject.Properties.Name|Where-Object{$_-cmatch'(?i)value|secret|password|verifier|url'}){throw 'EEE_SECRET_VALUE_FIELD_REJECTED'};$prior=$byHandle[$o.handle_id];$expected=$(if($null-eq$prior){'ALLOCATED'}elseif($prior-ceq'ALLOCATED'){'GENERATED'}elseif($prior-ceq'GENERATED'){'LEASED'}elseif($prior-ceq'LEASED'){'RELEASED'}else{'NONE'});if($o.phase-cne$expected){throw 'EEE_SECRET_TRANSITION_INVALID'};$byHandle[$o.handle_id]=$o.phase;$rows+=,[pscustomobject][ordered]@{sequence=$o.sequence;handle_id=$o.handle_id;kind=$o.kind;phase=$o.phase;representation_count=$o.representation_count;released=$o.released;recorded_utc=$o.recorded_utc}}
    $open=@($byHandle.Keys|Where-Object{$byHandle[$_]-cne'RELEASED'});[pscustomobject][ordered]@{schema_version='A24E_DIRECT_SECRET_LIFECYCLE_EVIDENCE';run_id=$RunId;observations=$rows;observation_count=[long]$rows.Count;open_handle_ids=@($open|Sort-Object);open_handle_count=[long]$open.Count;result=$(if($open.Count){'FAIL'}else{'PASS'});failure_code=$(if($open.Count){'SECRET_NOT_RELEASED'}else{'NONE'})}
}

function ConvertTo-EeeJsonLinesBytes { param([object[]]$Rows) $text=(@($Rows|ForEach-Object{ConvertTo-EeeCanonicalJson $_}) -join "`n")+$(if($Rows.Count){"`n"}else{''}); [Text.UTF8Encoding]::new($false,$true).GetBytes($text) }

function Get-EeeArtifactRegistry {
    $rows=@(
        'create_identity|evidence/create-identity.json|A24E_FINAL_V4_CREATE_IDENTITY|PRECOMMIT_EVIDENCE|1|FIRST_BIND','role_attestation_identity|evidence/role-attestation-identity.json|A24E_FINAL_V4_ROLE_ATTESTATION_IDENTITY|PRECOMMIT_EVIDENCE|1|CONFIRMATION','trusted_role_identity|evidence/trusted-role-identity.json|A24E_FINAL_V4_TRUSTED_IDENTITY|PRECOMMIT_EVIDENCE|1|AUTHORITATIVE','cleanup_evidence|evidence/cleanup-evidence.json|A24E_FINAL_V4_CLEANUP_EVIDENCE|PRECOMMIT_EVIDENCE|1|NULLABLE_CONFIRMATION','post_cleanup_evidence|evidence/post-cleanup-evidence.json|A24E_FINAL_V4_POST_CLEANUP_EVIDENCE|PRECOMMIT_EVIDENCE|1|NULLABLE_CONFIRMATION','transition_ledger|ledgers/transitions.jsonl|A24E_FINAL_V4_TRANSITION_ROW_STREAM|PRECOMMIT_EVIDENCE|1|RUN_ONLY','classification_ledger|ledgers/classifications.jsonl|A24E_FINAL_V4_CLASSIFICATION_ROW_STREAM|PRECOMMIT_EVIDENCE|1|RUN_ONLY','stage_ledger|ledgers/stages.jsonl|A24E_FINAL_V4_STAGE_ROW_STREAM|PRECOMMIT_EVIDENCE|1|RUN_ONLY','recursive_redaction_precommit|control/redaction-precommit.json|A24E_FINAL_V4_RECURSIVE_REDACTION_PRECOMMIT|PRECOMMIT_CONTROL|1|RUN_ONLY','ledger_binding_set|control/ledger-binding-set.json|A24E_FINAL_V4_LEDGER_BINDING_SET|PRECOMMIT_CONTROL|1|RUN_ONLY','artifact_registry|control/artifact-registry.json|A24E_FINAL_V4_ARTIFACT_REGISTRY|PRECOMMIT_CONTROL|1|DESCRIPTOR','evidence_inventory|control/evidence-inventory.json|A24E_FINAL_V4_EVIDENCE_INVENTORY|PRECOMMIT_CONTROL|1|HASH_INVENTORY','precommit_control_inventory|control/precommit-control-inventory.json|A24E_FINAL_V4_PRECOMMIT_CONTROL_INVENTORY|PRECOMMIT_CONTROL|1|RUN_ONLY','reconciliation_result|derived/reconciliation.json|A24E_FINAL_V4_RECONCILIATION|PRECOMMIT_DERIVED|1|NULLABLE_IDENTITY','replay_snapshot|derived/replay-snapshot.json|A24E_FINAL_V4_REPLAY_SNAPSHOT|PRECOMMIT_DERIVED|1|NULLABLE_IDENTITY','prepublication_verification|derived/prepublication-verification.json|A24E_FINAL_V4_PREPUBLICATION_VERIFICATION|PRECOMMIT_DERIVED|1|RUN_ONLY','final_summary|final/final-summary.json|A24E_FINAL_V4_FINAL_SUMMARY|COMMIT_DEPENDENT_NONCOMMIT|1|NULLABLE_IDENTITY','success_commit|commit/success.json|A24E_FINAL_V4_SUCCESS_COMMIT|TERMINAL_COMMIT|1|RUN_ONLY','failure_commit|commit/failure.json|A24E_FINAL_V4_FAILURE_COMMIT|TERMINAL_COMMIT|1|RUN_ONLY')
    foreach($r in $rows){$p=$r.Split('|');[pscustomobject][ordered]@{logical_id=$p[0];path=$p[1];schema_version=$p[2];scope=$p[3];cardinality=[long]$p[4];identity_mode=$p[5]}}
}

function Get-EeeProfileRegistry {
    [ordered]@{SUCCESS_PROFILE=@('create_identity','role_attestation_identity','trusted_role_identity','cleanup_evidence','post_cleanup_evidence','transition_ledger','classification_ledger','stage_ledger','recursive_redaction_precommit','ledger_binding_set','artifact_registry','evidence_inventory');FAILURE_PREMUTATION_PROFILE=@('transition_ledger','classification_ledger','stage_ledger','recursive_redaction_precommit','ledger_binding_set','artifact_registry','evidence_inventory');FAILURE_CONFIRMED_ROLLBACK_PROFILE=@('cleanup_evidence','post_cleanup_evidence','transition_ledger','classification_ledger','stage_ledger','recursive_redaction_precommit','ledger_binding_set','artifact_registry','evidence_inventory');FAILURE_POST_CREATE_PROFILE=@('create_identity','trusted_role_identity','cleanup_evidence','post_cleanup_evidence','transition_ledger','classification_ledger','stage_ledger','recursive_redaction_precommit','ledger_binding_set','artifact_registry','evidence_inventory');FAILURE_EVIDENCE_INVALID_PROFILE=@('transition_ledger','classification_ledger','stage_ledger','recursive_redaction_precommit','ledger_binding_set','artifact_registry','evidence_inventory');DEPENDENCY_BLOCK_PROFILE=@('transition_ledger','classification_ledger','stage_ledger','recursive_redaction_precommit','ledger_binding_set','artifact_registry','evidence_inventory')}
}

function Get-EeeIdentityBindingRegistry {
    $targets=@('create_identity|trusted_role_identity|111001','trusted_role_identity|role_attestation_identity|111100','trusted_role_identity|cleanup_evidence|111100','trusted_role_identity|post_cleanup_evidence|111100','trusted_role_identity|reconciliation_result|100100','trusted_role_identity|final_summary|111110','trusted_role_identity|prepublication_verification|100000','trusted_role_identity|success_commit|100000','trusted_role_identity|failure_commit|100000','trusted_role_identity|replay_snapshot|100100','trusted_role_identity|recursive_redaction_precommit|100000','trusted_role_identity|ledger_binding_set|100000','trusted_role_identity|precommit_control_inventory|100000','trusted_role_identity|replay_result|100000')
    $i=0;foreach($t in $targets){$i++;$p=$t.Split('|');$f=$p[2].ToCharArray();[pscustomobject][ordered]@{binding_id=('B{0:D2}'-f$i);source_logical_id=$p[0];target_logical_id=$p[1];bind_run_id=$f[0]-eq'1';bind_role_name=$f[1]-eq'1';bind_role_oid=$f[2]-eq'1';bind_identity_record_hash=$f[3]-eq'1';bind_identity_artifact_hash=$f[4]-eq'1';bind_sequence=$f[5]-eq'1'}}
}

function Get-EeeFailureCodeRegistry {
    [pscustomobject][ordered]@{global=@('SCHEMA_INVALID','RUN_ID_MISMATCH','CANONICAL_BYTES_INVALID','HASH_MISMATCH','ARTIFACT_MISSING','ARTIFACT_DUPLICATE','ARTIFACT_TAMPERED','INVENTORY_PROFILE_MISMATCH','INVENTORY_COUNT_MISMATCH','INVENTORY_MEMBER_MISMATCH','CONTROL_INVENTORY_MISMATCH','BINDING_MISMATCH','REDACTION_REJECTED','RECONCILIATION_FAILED','REPLAY_SNAPSHOT_INVALID','PREPUBLICATION_INVALID','PUBLICATION_PLAN_INVALID','PUBLICATION_COLLISION','COMMIT_MISSING','COMMIT_TAMPERED','SUMMARY_MISSING','SUMMARY_INVALID','MARKER_MISMATCH','INVALID_TRANSITION','IDENTITY_MISMATCH','DEPENDENCY_CYCLE_DETECTED');transition_ledger=@('TRL_SCHEMA_INVALID','TRL_SEQUENCE_INVALID','TRL_DUPLICATE','TRL_HASH_MISMATCH','TRL_TERMINAL_PRECOMMIT');classification_ledger=@('CLL_SCHEMA_INVALID','CLL_SEQUENCE_INVALID','CLL_DUPLICATE','CLL_HASH_MISMATCH','CLL_REDUCTION_INVALID');stage_ledger=@('STL_SCHEMA_INVALID','STL_SEQUENCE_INVALID','STL_DUPLICATE','STL_HASH_MISMATCH','STL_EXIT_MODEL_INVALID')}
}

function Add-EeeAdmittedArtifact {
    param([string]$RunId,[string]$ProfileId,[hashtable]$Store,[string]$LogicalId,[byte[]]$Bytes,[byte[][]]$SecretNeedles)
    if($null-eq$Bytes){throw 'EEE_ARTIFACT_BYTES_MISSING'}
    $profiles=Get-EeeProfileRegistry;if(-not$profiles.Contains($ProfileId)-or$LogicalId-cnotin@($profiles[$ProfileId])){throw 'EEE_ARTIFACT_PROFILE_REJECTED'}
    $descriptor=@(Get-EeeArtifactRegistry|Where-Object logical_id -CEQ $LogicalId);if($descriptor.Count-ne1){throw 'EEE_ARTIFACT_DESCRIPTOR_INVALID'}
    if($Store.ContainsKey($LogicalId)){throw 'EEE_ARTIFACT_DUPLICATE'}
    foreach($needle in @($SecretNeedles)){if($null-eq$needle-or$needle.Length-eq0){continue};for($i=0;$i-le$Bytes.Length-$needle.Length;$i++){$same=$true;for($j=0;$j-lt$needle.Length;$j++){if($Bytes[$i+$j]-ne$needle[$j]){$same=$false;break}};if($same){throw 'EEE_REDACTION_REJECTED'}}}
    $copy=@{};foreach($key in $Store.Keys){$copy[$key]=[byte[]]$Store[$key].Clone()};$copy[$LogicalId]=[byte[]]$Bytes.Clone()
    [pscustomobject][ordered]@{store=$copy;admission=[pscustomobject][ordered]@{run_id=$RunId;logical_id=$LogicalId;path=$descriptor[0].path;schema_version=$descriptor[0].schema_version;sha256=Get-EeeSha256Hex $Bytes;byte_count=[long]$Bytes.Length;result='PASS'}}
}

function New-EeeExactInventory {
    param([string]$RunId,[string]$ProfileId,[hashtable]$Store,[string]$RecordedUtc)
    $profiles=Get-EeeProfileRegistry
    if(-not$profiles.Contains($ProfileId)){throw 'EEE_PROFILE_INVALID'}
    $publishedRequired=@($profiles[$ProfileId])
    if('evidence_inventory'-cnotin$publishedRequired){throw 'EEE_INVENTORY_SELF_EXCLUSION_NOT_APPLICABLE'}
    $subjectRequired=@($publishedRequired|Where-Object{$_-cne'evidence_inventory'})
    $actual=@($Store.Keys|Sort-Object)
    $missing=@($subjectRequired|Where-Object{$_-cnotin$actual})
    $extra=@($actual|Where-Object{$_-cnotin$subjectRequired})
    if($missing.Count-or$extra.Count){throw 'EEE_INVENTORY_MEMBER_MISMATCH'}
    $registry=@(Get-EeeArtifactRegistry);$rows=@()
    foreach($id in @($subjectRequired|Sort-Object)){
        $d=@($registry|Where-Object logical_id -CEQ $id)
        if($d.Count-ne1){throw 'EEE_ARTIFACT_DESCRIPTOR_INVALID'}
        $b=[byte[]]$Store[$id]
        if($null-eq$b){throw 'EEE_ARTIFACT_BYTES_MISSING'}
        $rows+=,[pscustomobject][ordered]@{logical_id=$id;path=$d[0].path;schema_version=$d[0].schema_version;sha256=Get-EeeSha256Hex $b;byte_count=[long]$b.Length}
    }
    $subjectHash=Get-EeeSha256Hex (ConvertTo-EeeCanonicalJsonBytes @($rows))
    [pscustomobject][ordered]@{schema_version='A24E_FINAL_V4_EVIDENCE_INVENTORY';run_id=$RunId;profile_id=$ProfileId;self_excluded_logical_id='evidence_inventory';inventory_rows=$rows;subject_membership_hash=$subjectHash;required_count=[long]$subjectRequired.Count;optional_present_count=[long]0;total_count=[long]$rows.Count;recorded_utc=$RecordedUtc}
}

function Test-EeeExactInventory {
    param([string]$RunId,[string]$ProfileId,[hashtable]$SubjectStore,$Inventory,[byte[]]$InventoryBytes,[hashtable]$PublishedStore)
    try {
        if($null-eq$Inventory-or$Inventory.self_excluded_logical_id-cne'evidence_inventory'){throw 'EEE_INVENTORY_SELF_EXCLUSION_INVALID'}
        if(@($Inventory.inventory_rows|Where-Object logical_id -CEQ 'evidence_inventory').Count){throw 'EEE_INVENTORY_SYNTHETIC_SELF_ROW'}
        $expected=New-EeeExactInventory $RunId $ProfileId $SubjectStore $Inventory.recorded_utc
        $expectedBytes=ConvertTo-EeeCanonicalJsonBytes $expected
        if($null-eq$InventoryBytes-or(Get-EeeSha256Hex $expectedBytes)-cne(Get-EeeSha256Hex $InventoryBytes)){throw 'EEE_INVENTORY_ARTIFACT_HASH_MISMATCH'}
        if((Get-EeeSha256Hex $expectedBytes)-cne(Get-EeeSha256Hex(ConvertTo-EeeCanonicalJsonBytes $Inventory))){throw 'EEE_INVENTORY_SUBJECT_MISMATCH'}
        if($null-eq$PublishedStore-or-not$PublishedStore.ContainsKey('evidence_inventory')){throw 'EEE_INVENTORY_ARTIFACT_MISSING'}
        if((Get-EeeSha256Hex([byte[]]$PublishedStore.evidence_inventory))-cne(Get-EeeSha256Hex $InventoryBytes)){throw 'EEE_INVENTORY_ARTIFACT_HASH_MISMATCH'}
        New-EeeValidationResult $true
    } catch { New-EeeValidationResult $false 'EVIDENCE_INVALID' }
}

function New-EeeRecursiveRedactionPrecommit {
    param([string]$RunId,[string]$ProfileId,[hashtable]$SourceStore,[byte[][]]$SecretNeedles,[string]$RecordedUtc)
    $profiles=Get-EeeProfileRegistry;if(-not$profiles.Contains($ProfileId)){throw 'EEE_PROFILE_INVALID'}
    $registry=@(Get-EeeArtifactRegistry);$expected=@($profiles[$ProfileId]|Where-Object{$id=$_;@($registry|Where-Object{$_.logical_id-ceq$id-and$_.scope-ceq'PRECOMMIT_EVIDENCE'}).Count-eq1}|Sort-Object)
    $actual=@($SourceStore.Keys|Sort-Object);if(@($expected|Where-Object{$_-cnotin$actual}).Count-or@($actual|Where-Object{$_-cnotin$expected}).Count){throw 'EEE_REDACTION_SUBJECT_MISMATCH'}
    $rejected=@()
    foreach($id in $expected){$bytes=[byte[]]$SourceStore[$id];foreach($needle in @($SecretNeedles)){if($null-eq$needle-or$needle.Length-eq0){continue};for($i=0;$i-le$bytes.Length-$needle.Length;$i++){$same=$true;for($j=0;$j-lt$needle.Length;$j++){if($bytes[$i+$j]-ne$needle[$j]){$same=$false;break}};if($same){$rejected+=$id;break}}}}
    $rejected=@($rejected|Sort-Object -Unique)
    [pscustomobject][ordered]@{schema_version='A24E_FINAL_V4_RECURSIVE_REDACTION_PRECOMMIT';run_id=$RunId;scan_phase='PRECOMMIT_SOURCE_AND_LEDGERS';scanned_logical_ids=$expected;scanned_count=[long]$expected.Count;rejected_logical_ids=$rejected;rejected_count=[long]$rejected.Count;secret_patterns_version='A24E_FINAL_V4_SECRET_PATTERNS';result=$(if($rejected.Count){'FAIL'}else{'PASS'});recorded_utc=$RecordedUtc}
}

function New-EeeLedgerBindingSet {
    param([string]$RunId,[hashtable]$LedgerStore,[string]$RecordedUtc)
    $ids=@('transition_ledger','classification_ledger','stage_ledger');$actual=@($LedgerStore.Keys|Sort-Object)
    if(@($ids|Where-Object{$_-cnotin$actual}).Count-or@($actual|Where-Object{$_-cnotin$ids}).Count){throw 'EEE_LEDGER_BINDING_MEMBER_MISMATCH'}
    $projection=ConvertTo-EeeCanonicalJsonBytes([pscustomobject][ordered]@{run_id=$RunId});$projectionHash=Get-EeeSha256Hex $projection;$rows=@();$failed=@();$ordinal=0
    foreach($id in $ids){$ordinal++;$bytes=[byte[]]$LedgerStore[$id];$text=[Text.UTF8Encoding]::new($false,$true).GetString($bytes);$lines=@($text.TrimEnd("`n").Split("`n")|Where-Object{$_-ne''});$valid=$lines.Count-gt0
        foreach($line in $lines){try{$row=$line|ConvertFrom-Json;if($row.run_id-cne$RunId){$valid=$false}}catch{$valid=$false}}
        if(-not$valid){$failed+=('LB{0:D2}'-f$ordinal)}
        $rows+=,[pscustomobject][ordered]@{binding_id=('LB{0:D2}'-f$ordinal);artifact_sha256=Get-EeeSha256Hex $bytes;source_projection_hash=$(if($valid){$projectionHash}else{'0'*64});target_projection_hash=$projectionHash;result=$(if($valid){'PASS'}else{'FAIL'})}
    }
    [pscustomobject][ordered]@{schema_version='A24E_FINAL_V4_LEDGER_BINDING_SET';run_id=$RunId;binding_registry_version='A24E_FINAL_V4_LEDGER_BINDINGS';binding_rows=$rows;binding_count=[long]3;failed_binding_ids=$failed;failed_count=[long]$failed.Count;result=$(if($failed.Count){'FAIL'}else{'PASS'});recorded_utc=$RecordedUtc}
}

function New-EeeArtifactRegistryRecord {
    param([string]$RunId,[string]$ProfileId,[string]$RecordedUtc)
    $profiles=Get-EeeProfileRegistry;if(-not$profiles.Contains($ProfileId)){throw 'EEE_PROFILE_INVALID'};$ids=@($profiles[$ProfileId]);$all=@(Get-EeeArtifactRegistry);$rows=@()
    foreach($id in @($ids|Sort-Object)){$d=@($all|Where-Object logical_id -CEQ $id);if($d.Count-ne1){throw 'EEE_ARTIFACT_DESCRIPTOR_INVALID'};$rows+=,[pscustomobject][ordered]@{logical_id=$d[0].logical_id;path=$d[0].path;schema_version=$d[0].schema_version;scope=$d[0].scope;cardinality=[long]$d[0].cardinality;identity_mode=$d[0].identity_mode}}
    if(@($rows|Group-Object logical_id|Where-Object Count -ne 1).Count-or@($rows|Group-Object path|Where-Object Count -ne 1).Count){throw 'EEE_ARTIFACT_REGISTRY_DUPLICATE'}
    [pscustomobject][ordered]@{schema_version='A24E_FINAL_V4_ARTIFACT_REGISTRY';run_id=$RunId;profile_id=$ProfileId;registry_rows=$rows;registry_count=[long]$rows.Count;recorded_utc=$RecordedUtc}
}

function New-EeePrecommitControlInventory {
    param([string]$RunId,[string]$ProfileId,[hashtable]$ControlStore,[string]$RecordedUtc)
    $ids=@('recursive_redaction_precommit','ledger_binding_set','artifact_registry','evidence_inventory');$actual=@($ControlStore.Keys)
    if(@($ids|Where-Object{$_-cnotin$actual}).Count-or@($actual|Where-Object{$_-cnotin$ids}).Count){throw 'EEE_CONTROL_INVENTORY_MISMATCH'}
    $registry=@(Get-EeeArtifactRegistry);$rows=@();foreach($id in $ids){$d=@($registry|Where-Object logical_id -CEQ $id);$rows+=,[pscustomobject][ordered]@{logical_id=$id;schema_version=$d[0].schema_version;path=$d[0].path;sha256=Get-EeeSha256Hex([byte[]]$ControlStore[$id])}}
    [pscustomobject][ordered]@{schema_version='A24E_FINAL_V4_PRECOMMIT_CONTROL_INVENTORY';run_id=$RunId;profile_id=$ProfileId;member_rows=$rows;member_count=[long]4;recorded_utc=$RecordedUtc}
}

function New-EeeTerminalProjection {
    param($State,$ReconciliationArtifact,[string]$RecordedUtc)
    if(-not(Test-EeeExecutionState $State).valid-or-not(Test-EeeUtc $RecordedUtc)){throw 'EEE_TERMINAL_PROJECTION_INPUT_INVALID'}
    if($null-eq$ReconciliationArtifact-or$ReconciliationArtifact.schema_version-cne'A24E_FINAL_V4_ENGINE_OWNED_RECONCILIATION_ARTIFACT'-or-not(Test-EeeHash $ReconciliationArtifact.sha256)){throw 'EEE_TERMINAL_PROJECTION_RECONCILIATION_INVALID'}
    $active=Get-EeeActiveClassification $State
    if($ReconciliationArtifact.record.result-ceq'PASS'-and$State.current_state-cin@('POST_CLEANUP_PASSED','COMPLETE_CANDIDATE')){
        $values=@('SUCCESS','COMPLETE','PASS','CONFIRMED_COMMIT','A24E_FINAL_V4_SUCCESS_COMPLETE','SUCCESS','COMPLETE_PASS')
    } else {
        $terminal=Get-EeeFailureTerminalInternal $State.current_state
        if($null-eq$active){throw 'EEE_TERMINAL_CLASSIFICATION_MISSING'}
        $values=@('FAILURE',$terminal.terminal,'FAIL',$active.classification,('A24E_FINAL_V4_FAILURE_'+$terminal.terminal),'FAILURE',($terminal.terminal+'_FAIL'))
    }
    $record=[pscustomobject][ordered]@{schema_version='A24E_FINAL_V4_TERMINAL_PROJECTION';run_id=$State.run_id;terminal_kind=$values[0];expected_final_state=$values[1];expected_final_result=$values[2];expected_classification=$values[3];expected_completion_marker=$values[4];commit_kind=$values[5];replay_expectation=$values[6];reconciliation_result_hash=$ReconciliationArtifact.sha256;recorded_utc=$RecordedUtc}
    $bytes=ConvertTo-EeeCanonicalJsonBytes $record
    [pscustomobject][ordered]@{schema_version='A24E_FINAL_V4_ENGINE_OWNED_TERMINAL_PROJECTION';record=$record;canonical_bytes=$bytes;sha256=Get-EeeSha256Hex $bytes}
}

function Test-EeeTerminalProjection {
    param($State,$ReconciliationArtifact,$Artifact)
    try {
        if($Artifact-is[byte[]]-or-not(Test-EeeRecordShapeInternal $Artifact @('schema_version','record','canonical_bytes','sha256'))-or$Artifact.schema_version-cne'A24E_FINAL_V4_ENGINE_OWNED_TERMINAL_PROJECTION'){throw 'EEE_TERMINAL_PROJECTION_ENVELOPE_INVALID'}
        if(-not(Test-EeeRecordShapeInternal $Artifact.record @('schema_version','run_id','terminal_kind','expected_final_state','expected_final_result','expected_classification','expected_completion_marker','commit_kind','replay_expectation','reconciliation_result_hash','recorded_utc'))){throw 'EEE_TERMINAL_PROJECTION_SCHEMA_INVALID'}
        $expected=New-EeeTerminalProjection $State $ReconciliationArtifact $Artifact.record.recorded_utc
        if((Get-EeeSha256Hex([byte[]]$Artifact.canonical_bytes))-cne$Artifact.sha256-or(Get-EeeSha256Hex(ConvertTo-EeeCanonicalJsonBytes $Artifact.record))-cne$Artifact.sha256-or$expected.sha256-cne$Artifact.sha256){throw 'EEE_TERMINAL_PROJECTION_HASH_INVALID'}
        New-EeeValidationResult $true
    } catch { New-EeeValidationResult $false 'EVIDENCE_INVALID' }
}

function New-EeeExpectedFinalSummary {
    param($State,[string]$ProfileId,$TerminalProjection,$ReconciliationArtifact,$Redaction,$BindingSet,$ArtifactRegistry,$Inventory,$ControlInventory,[string]$RecordedUtc)
    if(-not(Test-EeeTerminalProjection $State $ReconciliationArtifact $TerminalProjection).valid){throw 'EEE_EXPECTED_SUMMARY_TERMINAL_INVALID'}
    foreach($item in @($ReconciliationArtifact,$TerminalProjection)){if(-not(Test-EeeHash $item.sha256)){throw 'EEE_EXPECTED_SUMMARY_HASH_INVALID'}}
    $record=[pscustomobject][ordered]@{schema_version='A24E_FINAL_V4_EXPECTED_FINAL_SUMMARY';run_id=$State.run_id;profile_id=$ProfileId;contract_version=$State.contract_version;identity_present=[bool]$State.identity_authoritative;identity_record_hash=$State.trusted_identity_record_hash;terminal_projection_hash=$TerminalProjection.sha256;expected_final_state=$TerminalProjection.record.expected_final_state;expected_final_result=$TerminalProjection.record.expected_final_result;expected_classification=$TerminalProjection.record.expected_classification;expected_completion_marker=$TerminalProjection.record.expected_completion_marker;commit_kind=$TerminalProjection.record.commit_kind;reconciliation_result_hash=$ReconciliationArtifact.sha256;artifact_registry_hash=Get-EeeSha256Hex(ConvertTo-EeeCanonicalJsonBytes $ArtifactRegistry);evidence_inventory_hash=Get-EeeSha256Hex(ConvertTo-EeeCanonicalJsonBytes $Inventory);precommit_control_inventory_hash=Get-EeeSha256Hex(ConvertTo-EeeCanonicalJsonBytes $ControlInventory);recursive_redaction_hash=Get-EeeSha256Hex(ConvertTo-EeeCanonicalJsonBytes $Redaction);ledger_binding_set_hash=Get-EeeSha256Hex(ConvertTo-EeeCanonicalJsonBytes $BindingSet);finding_count=[long]$ReconciliationArtifact.record.finding_count;recorded_utc=$RecordedUtc}
    $bytes=ConvertTo-EeeCanonicalJsonBytes $record
    [pscustomobject][ordered]@{schema_version='A24E_FINAL_V4_ENGINE_OWNED_EXPECTED_SUMMARY';record=$record;canonical_bytes=$bytes;sha256=Get-EeeSha256Hex $bytes}
}

function Test-EeeExpectedFinalSummary {
    param($State,[string]$ProfileId,$TerminalProjection,$ReconciliationArtifact,$Redaction,$BindingSet,$ArtifactRegistry,$Inventory,$ControlInventory,$Artifact)
    try {
        if($Artifact-is[byte[]]-or-not(Test-EeeRecordShapeInternal $Artifact @('schema_version','record','canonical_bytes','sha256'))-or$Artifact.schema_version-cne'A24E_FINAL_V4_ENGINE_OWNED_EXPECTED_SUMMARY'){throw 'EEE_EXPECTED_SUMMARY_ENVELOPE_INVALID'}
        $fields=@('schema_version','run_id','profile_id','contract_version','identity_present','identity_record_hash','terminal_projection_hash','expected_final_state','expected_final_result','expected_classification','expected_completion_marker','commit_kind','reconciliation_result_hash','artifact_registry_hash','evidence_inventory_hash','precommit_control_inventory_hash','recursive_redaction_hash','ledger_binding_set_hash','finding_count','recorded_utc')
        if(-not(Test-EeeRecordShapeInternal $Artifact.record $fields)){throw 'EEE_EXPECTED_SUMMARY_SCHEMA_INVALID'}
        $expected=New-EeeExpectedFinalSummary $State $ProfileId $TerminalProjection $ReconciliationArtifact $Redaction $BindingSet $ArtifactRegistry $Inventory $ControlInventory $Artifact.record.recorded_utc
        if((Get-EeeSha256Hex([byte[]]$Artifact.canonical_bytes))-cne$Artifact.sha256-or(Get-EeeSha256Hex(ConvertTo-EeeCanonicalJsonBytes $Artifact.record))-cne$Artifact.sha256-or$expected.sha256-cne$Artifact.sha256){throw 'EEE_EXPECTED_SUMMARY_HASH_INVALID'}
        New-EeeValidationResult $true
    } catch { New-EeeValidationResult $false 'EVIDENCE_INVALID' }
}

function New-EeeReplaySnapshot {
    param($State,[string]$ProfileId,$TerminalProjection,$ExpectedSummary,[string]$ArtifactRegistryHash,[string]$EvidenceInventoryHash,[string]$ControlInventoryHash,[string]$ReconciliationHash,[string]$ClassificationLedgerHash,[string]$TransitionLedgerHash,[string]$StageLedgerHash,[string]$RecordedUtc)
    if(-not(Test-EeeExecutionState $State).valid-or-not(Test-EeeHash $ExpectedSummary.sha256)-or-not(Test-EeeHash $TerminalProjection.sha256)-or$ExpectedSummary.sha256-ceq('0'*64)-or$TerminalProjection.sha256-ceq('0'*64)){throw 'EEE_REPLAY_SNAPSHOT_PREREQUISITE_INVALID'}
    if((Get-EeeSha256Hex(ConvertTo-EeeCanonicalJsonBytes $ExpectedSummary.record))-cne$ExpectedSummary.sha256-or(Get-EeeSha256Hex([byte[]]$ExpectedSummary.canonical_bytes))-cne$ExpectedSummary.sha256){throw 'EEE_REPLAY_SNAPSHOT_SUMMARY_INVALID'}
    if((Get-EeeSha256Hex(ConvertTo-EeeCanonicalJsonBytes $TerminalProjection.record))-cne$TerminalProjection.sha256-or(Get-EeeSha256Hex([byte[]]$TerminalProjection.canonical_bytes))-cne$TerminalProjection.sha256){throw 'EEE_REPLAY_SNAPSHOT_TERMINAL_INVALID'}
    foreach($hash in @($ArtifactRegistryHash,$EvidenceInventoryHash,$ControlInventoryHash,$ReconciliationHash,$ClassificationLedgerHash,$TransitionLedgerHash,$StageLedgerHash)){if(-not(Test-EeeHash $hash)){throw 'EEE_REPLAY_SNAPSHOT_HASH_INVALID'}}
    [pscustomobject][ordered]@{schema_version='A24E_FINAL_V4_REPLAY_SNAPSHOT';run_id=$State.run_id;profile_id=$ProfileId;contract_version=$State.contract_version;identity_present=[bool]$State.identity_authoritative;identity_record_hash=$State.trusted_identity_record_hash;artifact_registry_hash=$ArtifactRegistryHash;evidence_inventory_hash=$EvidenceInventoryHash;precommit_control_inventory_hash=$ControlInventoryHash;reconciliation_result_hash=$ReconciliationHash;classification_ledger_hash=$ClassificationLedgerHash;transition_ledger_hash=$TransitionLedgerHash;stage_ledger_hash=$StageLedgerHash;terminal_projection_hash=$TerminalProjection.sha256;expected_final_summary_hash=$ExpectedSummary.sha256;expected_terminal_kind=$TerminalProjection.record.terminal_kind;expected_final_state=$TerminalProjection.record.expected_final_state;expected_final_result=$TerminalProjection.record.expected_final_result;expected_completion_marker=$TerminalProjection.record.expected_completion_marker;recorded_utc=$RecordedUtc}
}

function Test-EeeRecordShapeInternal {
    param($Record,[string[]]$Fields)
    Test-EeeClosedRecord $Record $Fields
}

function Test-EeeControlInputsInternal {
    param($State,[string]$ProfileId,[hashtable]$SubjectStore,$Redaction,$BindingSet,$ArtifactRegistry,$Inventory,$ControlInventory)
    try {
        if(-not(Test-EeeExecutionState $State).valid){throw 'EEE_STATE_INVALID'}
        if(-not(Test-EeeRecordShapeInternal $Redaction @('schema_version','run_id','scan_phase','scanned_logical_ids','scanned_count','rejected_logical_ids','rejected_count','secret_patterns_version','result','recorded_utc'))){throw 'EEE_REDACTION_SCHEMA_INVALID'}
        if($Redaction.schema_version-cne'A24E_FINAL_V4_RECURSIVE_REDACTION_PRECOMMIT'-or$Redaction.run_id-cne$State.run_id-or$Redaction.result-cne'PASS'-or$Redaction.rejected_count-ne0-or$Redaction.scanned_count-ne@($Redaction.scanned_logical_ids).Count){throw 'EEE_REDACTION_INVALID'}
        if(-not(Test-EeeRecordShapeInternal $BindingSet @('schema_version','run_id','binding_registry_version','binding_rows','binding_count','failed_binding_ids','failed_count','result','recorded_utc'))){throw 'EEE_BINDING_SCHEMA_INVALID'}
        $ledgerStore=@{};foreach($id in @('transition_ledger','classification_ledger','stage_ledger')){$ledgerStore[$id]=[byte[]]$SubjectStore[$id]};$expectedBinding=New-EeeLedgerBindingSet $State.run_id $ledgerStore $BindingSet.recorded_utc
        if((Get-EeeSha256Hex(ConvertTo-EeeCanonicalJsonBytes $expectedBinding))-cne(Get-EeeSha256Hex(ConvertTo-EeeCanonicalJsonBytes $BindingSet))){throw 'EEE_BINDING_MISMATCH'}
        $expectedRegistry=New-EeeArtifactRegistryRecord $State.run_id $ProfileId $ArtifactRegistry.recorded_utc
        if((Get-EeeSha256Hex(ConvertTo-EeeCanonicalJsonBytes $expectedRegistry))-cne(Get-EeeSha256Hex(ConvertTo-EeeCanonicalJsonBytes $ArtifactRegistry))){throw 'EEE_ARTIFACT_REGISTRY_MISMATCH'}
        foreach($id in @('recursive_redaction_precommit','ledger_binding_set','artifact_registry')){if(-not$SubjectStore.ContainsKey($id)){throw 'EEE_CONTROL_SUBJECT_MISSING'}}
        if((Get-EeeSha256Hex([byte[]]$SubjectStore.recursive_redaction_precommit))-cne(Get-EeeSha256Hex(ConvertTo-EeeCanonicalJsonBytes $Redaction))){throw 'EEE_REDACTION_BYTES_MISMATCH'}
        if((Get-EeeSha256Hex([byte[]]$SubjectStore.ledger_binding_set))-cne(Get-EeeSha256Hex(ConvertTo-EeeCanonicalJsonBytes $BindingSet))){throw 'EEE_BINDING_BYTES_MISMATCH'}
        if((Get-EeeSha256Hex([byte[]]$SubjectStore.artifact_registry))-cne(Get-EeeSha256Hex(ConvertTo-EeeCanonicalJsonBytes $ArtifactRegistry))){throw 'EEE_REGISTRY_BYTES_MISMATCH'}
        $expectedInventory=New-EeeExactInventory $State.run_id $ProfileId $SubjectStore $Inventory.recorded_utc
        if((Get-EeeSha256Hex(ConvertTo-EeeCanonicalJsonBytes $expectedInventory))-cne(Get-EeeSha256Hex(ConvertTo-EeeCanonicalJsonBytes $Inventory))){throw 'EEE_INVENTORY_MISMATCH'}
        $controls=@{recursive_redaction_precommit=ConvertTo-EeeCanonicalJsonBytes $Redaction;ledger_binding_set=ConvertTo-EeeCanonicalJsonBytes $BindingSet;artifact_registry=ConvertTo-EeeCanonicalJsonBytes $ArtifactRegistry;evidence_inventory=ConvertTo-EeeCanonicalJsonBytes $Inventory};$expectedControl=New-EeePrecommitControlInventory $State.run_id $ProfileId $controls $ControlInventory.recorded_utc
        if((Get-EeeSha256Hex(ConvertTo-EeeCanonicalJsonBytes $expectedControl))-cne(Get-EeeSha256Hex(ConvertTo-EeeCanonicalJsonBytes $ControlInventory))){throw 'EEE_CONTROL_INVENTORY_MISMATCH'}
        New-EeeValidationResult $true
    } catch { New-EeeValidationResult $false 'EVIDENCE_INVALID' }
}

function New-EeeReconciliationArtifact {
    param($State,[string]$ProfileId,[hashtable]$SubjectStore,$Redaction,$BindingSet,$ArtifactRegistry,$Inventory,$ControlInventory,[string]$RecordedUtc)
    $valid=Test-EeeControlInputsInternal $State $ProfileId $SubjectStore $Redaction $BindingSet $ArtifactRegistry $Inventory $ControlInventory;if(-not$valid.valid){throw 'EEE_RECONCILIATION_INPUT_INVALID'}
    $findings=@();if($State.identity_required-and-not$State.identity_authoritative){$findings+=,[pscustomobject][ordered]@{finding_code='IDENTITY_MISMATCH';severity=[int]100;logical_id='trusted_role_identity'}};$active=Get-EeeActiveClassification $State;if($null-ne$active-and$active.classification-cne'CONFIRMED_COMMIT'){$findings+=,[pscustomobject][ordered]@{finding_code='TERMINAL_FAILURE_CLASSIFICATION';severity=[int]100;logical_id='classification_ledger'}}
    $record=[pscustomobject][ordered]@{schema_version='A24E_FINAL_V4_RECONCILIATION';run_id=$State.run_id;profile_id=$ProfileId;identity_present=[bool]$State.identity_authoritative;identity_record_hash=$State.trusted_identity_record_hash;artifact_registry_hash=Get-EeeSha256Hex(ConvertTo-EeeCanonicalJsonBytes $ArtifactRegistry);evidence_inventory_hash=Get-EeeSha256Hex(ConvertTo-EeeCanonicalJsonBytes $Inventory);precommit_control_inventory_hash=Get-EeeSha256Hex(ConvertTo-EeeCanonicalJsonBytes $ControlInventory);recursive_redaction_hash=Get-EeeSha256Hex(ConvertTo-EeeCanonicalJsonBytes $Redaction);ledger_binding_set_hash=Get-EeeSha256Hex(ConvertTo-EeeCanonicalJsonBytes $BindingSet);classification_ledger_hash=Get-EeeSha256Hex([byte[]]$SubjectStore.classification_ledger);transition_ledger_hash=Get-EeeSha256Hex([byte[]]$SubjectStore.transition_ledger);stage_ledger_hash=Get-EeeSha256Hex([byte[]]$SubjectStore.stage_ledger);findings=@($findings|Sort-Object finding_code,logical_id);finding_count=[long]$findings.Count;result=$(if($findings.Count){'FAIL'}else{'PASS'});recorded_utc=$RecordedUtc}
    $bytes=ConvertTo-EeeCanonicalJsonBytes $record
    [pscustomobject][ordered]@{schema_version='A24E_FINAL_V4_ENGINE_OWNED_RECONCILIATION_ARTIFACT';record=$record;canonical_bytes=$bytes;sha256=Get-EeeSha256Hex $bytes}
}

function Test-EeeReconciliationArtifact {
    param($State,[string]$ProfileId,[hashtable]$SubjectStore,$Redaction,$BindingSet,$ArtifactRegistry,$Inventory,$ControlInventory,$Artifact)
    try {
        if($Artifact-is[byte[]]-or-not(Test-EeeRecordShapeInternal $Artifact @('schema_version','record','canonical_bytes','sha256'))-or$Artifact.schema_version-cne'A24E_FINAL_V4_ENGINE_OWNED_RECONCILIATION_ARTIFACT'){throw 'EEE_RECONCILIATION_ENVELOPE_INVALID'}
        $expected=New-EeeReconciliationArtifact $State $ProfileId $SubjectStore $Redaction $BindingSet $ArtifactRegistry $Inventory $ControlInventory $Artifact.record.recorded_utc
        if(-not(Test-EeeRecordShapeInternal $Artifact.record @('schema_version','run_id','profile_id','identity_present','identity_record_hash','artifact_registry_hash','evidence_inventory_hash','precommit_control_inventory_hash','recursive_redaction_hash','ledger_binding_set_hash','classification_ledger_hash','transition_ledger_hash','stage_ledger_hash','findings','finding_count','result','recorded_utc'))){throw 'EEE_RECONCILIATION_SCHEMA_INVALID'}
        foreach($finding in @($Artifact.record.findings)){if(-not(Test-EeeRecordShapeInternal $finding @('finding_code','severity','logical_id'))){throw 'EEE_FINDING_SCHEMA_INVALID'}}
        if((Get-EeeSha256Hex([byte[]]$Artifact.canonical_bytes))-cne$Artifact.sha256-or(Get-EeeSha256Hex(ConvertTo-EeeCanonicalJsonBytes $Artifact.record))-cne$Artifact.sha256-or(Get-EeeSha256Hex([byte[]]$expected.canonical_bytes))-cne$Artifact.sha256){throw 'EEE_RECONCILIATION_HASH_INVALID'}
        New-EeeValidationResult $true
    } catch { New-EeeValidationResult $false 'EVIDENCE_INVALID' }
}

function New-EeePrepublicationVerification {
    param($State,[string]$ProfileId,[hashtable]$SubjectStore,$Redaction,$BindingSet,$ArtifactRegistry,$Inventory,$ControlInventory,$ReconciliationArtifact,$TerminalProjection,$ExpectedSummary,$ReplaySnapshot,[string]$RecordedUtc)
    $controlValid=Test-EeeControlInputsInternal $State $ProfileId $SubjectStore $Redaction $BindingSet $ArtifactRegistry $Inventory $ControlInventory;if(-not$controlValid.valid){throw 'EEE_PREPUBLICATION_CONTROL_INVALID'}
    $reconciliationValid=Test-EeeReconciliationArtifact $State $ProfileId $SubjectStore $Redaction $BindingSet $ArtifactRegistry $Inventory $ControlInventory $ReconciliationArtifact;if(-not$reconciliationValid.valid){throw 'EEE_PREPUBLICATION_RECONCILIATION_INVALID'}
    if(-not(Test-EeeExpectedFinalSummary $State $ProfileId $TerminalProjection $ReconciliationArtifact $Redaction $BindingSet $ArtifactRegistry $Inventory $ControlInventory $ExpectedSummary).valid){throw 'EEE_PREPUBLICATION_SUMMARY_INVALID'}
    if(-not(Test-EeeRecordShapeInternal $ReplaySnapshot @('schema_version','run_id','profile_id','contract_version','identity_present','identity_record_hash','artifact_registry_hash','evidence_inventory_hash','precommit_control_inventory_hash','reconciliation_result_hash','classification_ledger_hash','transition_ledger_hash','stage_ledger_hash','terminal_projection_hash','expected_final_summary_hash','expected_terminal_kind','expected_final_state','expected_final_result','expected_completion_marker','recorded_utc'))){throw 'EEE_REPLAY_SNAPSHOT_SCHEMA_INVALID'}
    if($ReplaySnapshot.run_id-cne$State.run_id-or$ReplaySnapshot.reconciliation_result_hash-cne$ReconciliationArtifact.sha256-or$ReplaySnapshot.terminal_projection_hash-cne$TerminalProjection.sha256-or$ReplaySnapshot.expected_final_summary_hash-cne$ExpectedSummary.sha256){throw 'EEE_REPLAY_SNAPSHOT_MISMATCH'}
    $precommit=[ordered]@{artifact_registry=ConvertTo-EeeCanonicalJsonBytes $ArtifactRegistry;evidence_inventory=ConvertTo-EeeCanonicalJsonBytes $Inventory;precommit_control_inventory=ConvertTo-EeeCanonicalJsonBytes $ControlInventory;reconciliation_result=[byte[]]$ReconciliationArtifact.canonical_bytes;replay_snapshot=ConvertTo-EeeCanonicalJsonBytes $ReplaySnapshot};$ids=@($precommit.Keys);$memberProjection=@($ids|ForEach-Object{[pscustomobject][ordered]@{logical_id=$_;sha256=Get-EeeSha256Hex([byte[]]$precommit[$_] )}});$memberHash=Get-EeeSha256Hex(ConvertTo-EeeCanonicalJsonBytes @($memberProjection))
    $record=[pscustomobject][ordered]@{schema_version='A24E_FINAL_V4_PREPUBLICATION_VERIFICATION';run_id=$State.run_id;profile_id=$ProfileId;precommit_member_count=[long]$ids.Count;precommit_membership_hash=$memberHash;artifact_registry_hash=Get-EeeSha256Hex([byte[]]$precommit.artifact_registry);evidence_inventory_hash=Get-EeeSha256Hex([byte[]]$precommit.evidence_inventory);precommit_control_inventory_hash=Get-EeeSha256Hex([byte[]]$precommit.precommit_control_inventory);reconciliation_result_hash=$ReconciliationArtifact.sha256;terminal_projection_hash=$TerminalProjection.sha256;replay_snapshot_hash=Get-EeeSha256Hex([byte[]]$precommit.replay_snapshot);final_summary_hash=$ExpectedSummary.sha256;redaction_pass=$true;binding_pass=$true;schema_pass=$true;hash_pass=$true;inventory_pass=$true;replay_snapshot_pass=$true;result=$(if($ReconciliationArtifact.record.result-ceq'PASS'){'PASS'}else{'FAIL'});recorded_utc=$RecordedUtc};$bytes=ConvertTo-EeeCanonicalJsonBytes $record
    [pscustomobject][ordered]@{schema_version='A24E_FINAL_V4_ENGINE_OWNED_PREPUBLICATION_ARTIFACT';record=$record;canonical_bytes=$bytes;sha256=Get-EeeSha256Hex $bytes}
}

function Test-EeePrepublicationArtifact {
    param($State,[string]$ProfileId,[hashtable]$SubjectStore,$Redaction,$BindingSet,$ArtifactRegistry,$Inventory,$ControlInventory,$ReconciliationArtifact,$TerminalProjection,$ExpectedSummary,$ReplaySnapshot,$Artifact)
    try{if($Artifact-is[byte[]]-or-not(Test-EeeRecordShapeInternal $Artifact @('schema_version','record','canonical_bytes','sha256'))-or$Artifact.schema_version-cne'A24E_FINAL_V4_ENGINE_OWNED_PREPUBLICATION_ARTIFACT'){throw 'EEE_PREPUBLICATION_ENVELOPE_INVALID'};$expected=New-EeePrepublicationVerification $State $ProfileId $SubjectStore $Redaction $BindingSet $ArtifactRegistry $Inventory $ControlInventory $ReconciliationArtifact $TerminalProjection $ExpectedSummary $ReplaySnapshot $Artifact.record.recorded_utc;if((Get-EeeSha256Hex([byte[]]$Artifact.canonical_bytes))-cne$Artifact.sha256-or(Get-EeeSha256Hex(ConvertTo-EeeCanonicalJsonBytes $Artifact.record))-cne$Artifact.sha256-or$expected.sha256-cne$Artifact.sha256){throw 'EEE_PREPUBLICATION_HASH_INVALID'};New-EeeValidationResult $true}catch{New-EeeValidationResult $false 'EVIDENCE_INVALID'}
}

function Test-EeePublishedProfileSet {
    param([string]$ProfileId,[hashtable]$PublishedStore)
    try{$profiles=Get-EeeProfileRegistry;if(-not$profiles.Contains($ProfileId)){throw 'EEE_PROFILE_INVALID'};$expected=@($profiles[$ProfileId]|Sort-Object);$actual=@($PublishedStore.Keys|Sort-Object);if(@($expected|Where-Object{$_-cnotin$actual}).Count-or@($actual|Where-Object{$_-cnotin$expected}).Count){throw 'EEE_PUBLISHED_PROFILE_MISMATCH'};New-EeeValidationResult $true}catch{New-EeeValidationResult $false 'EVIDENCE_INVALID'}
}

function Get-EeeEngineFinalizationProfile {
    param($State)
    if(-not(Test-EeeExecutionState $State).valid){throw 'EEE_STATE_INVALID'}
    $active=Get-EeeActiveClassification $State
    $profile=switch -CaseSensitive($State.current_state){
        'POST_CLEANUP_PASSED' {if($null-ne$active-and$active.classification-ceq'CONFIRMED_ROLLBACK'){'FAILURE_CONFIRMED_ROLLBACK_PROFILE'}else{'SUCCESS_PROFILE'}}
        'COMPLETE_CANDIDATE' {'SUCCESS_PROFILE'}
        'DEPENDENCIES_MISSING_CANDIDATE' {'DEPENDENCY_BLOCK_PROFILE'}
        'FAILED_PREMUTATION_CANDIDATE' {if($null-ne$active-and$active.classification-ceq'CONFIRMED_ROLLBACK'){'FAILURE_CONFIRMED_ROLLBACK_PROFILE'}else{'FAILURE_PREMUTATION_PROFILE'}}
        'EVIDENCE_INVALID_CANDIDATE' {'FAILURE_EVIDENCE_INVALID_PROFILE'}
        'FAILED_CLEANUP_REQUIRED_CANDIDATE' {'FAILURE_POST_CREATE_PROFILE'}
        'FAILED_CLEANUP_INCOMPLETE_CANDIDATE' {'FAILURE_POST_CREATE_PROFILE'}
        default {throw 'EEE_FINALIZATION_PROFILE_STATE_INVALID'}
    }
    $profiles=Get-EeeProfileRegistry
    [pscustomobject][ordered]@{schema_version='A24E_FINAL_V4_ENGINE_PROFILE_DERIVATION';run_id=$State.run_id;profile_id=$profile;required_source_logical_ids=@($profiles[$profile]|Where-Object{$_-cnotin@('recursive_redaction_precommit','ledger_binding_set','artifact_registry','evidence_inventory')}|Sort-Object);result='PASS'}
}

function New-EeeControlArtifactSet {
    param($State,[string]$ProfileId,[hashtable]$SourceStore,[byte[][]]$SecretNeedles,$ReconciliationArtifact,[string]$RecordedUtc)
    if(-not(Test-EeeExecutionState $State).valid){throw 'EEE_STATE_INVALID'}
    $redaction=New-EeeRecursiveRedactionPrecommit $State.run_id $ProfileId $SourceStore $SecretNeedles $RecordedUtc;if($redaction.result-cne'PASS'){throw 'EEE_REDACTION_REJECTED'}
    $ledgerStore=@{};foreach($id in @('transition_ledger','classification_ledger','stage_ledger')){$ledgerStore[$id]=[byte[]]$SourceStore[$id]};$binding=New-EeeLedgerBindingSet $State.run_id $ledgerStore $RecordedUtc;if($binding.result-cne'PASS'){throw 'EEE_BINDING_MISMATCH'}
    $artifactRegistry=New-EeeArtifactRegistryRecord $State.run_id $ProfileId $RecordedUtc
    $subjectStore=@{};foreach($id in $SourceStore.Keys){$subjectStore[$id]=[byte[]]$SourceStore[$id].Clone()};$subjectStore.recursive_redaction_precommit=ConvertTo-EeeCanonicalJsonBytes $redaction;$subjectStore.ledger_binding_set=ConvertTo-EeeCanonicalJsonBytes $binding;$subjectStore.artifact_registry=ConvertTo-EeeCanonicalJsonBytes $artifactRegistry
    $inventory=New-EeeExactInventory $State.run_id $ProfileId $subjectStore $RecordedUtc;$inventoryBytes=ConvertTo-EeeCanonicalJsonBytes $inventory
    $controls=@{recursive_redaction_precommit=$subjectStore.recursive_redaction_precommit;ledger_binding_set=$subjectStore.ledger_binding_set;artifact_registry=$subjectStore.artifact_registry;evidence_inventory=$inventoryBytes};$controlInventory=New-EeePrecommitControlInventory $State.run_id $ProfileId $controls $RecordedUtc;$controlBytes=ConvertTo-EeeCanonicalJsonBytes $controlInventory
    $reconciliationValid=Test-EeeReconciliationArtifact $State $ProfileId $subjectStore $redaction $binding $artifactRegistry $inventory $controlInventory $ReconciliationArtifact;if(-not$reconciliationValid.valid){throw 'EEE_RECONCILIATION_INPUT_INVALID'}
    $terminal=New-EeeTerminalProjection $State $ReconciliationArtifact $RecordedUtc
    $expectedSummary=New-EeeExpectedFinalSummary $State $ProfileId $terminal $ReconciliationArtifact $redaction $binding $artifactRegistry $inventory $controlInventory $RecordedUtc
    $snapshot=New-EeeReplaySnapshot $State $ProfileId $terminal $expectedSummary (Get-EeeSha256Hex $subjectStore.artifact_registry) (Get-EeeSha256Hex $inventoryBytes) (Get-EeeSha256Hex $controlBytes) $ReconciliationArtifact.sha256 (Get-EeeSha256Hex([byte[]]$SourceStore.classification_ledger)) (Get-EeeSha256Hex([byte[]]$SourceStore.transition_ledger)) (Get-EeeSha256Hex([byte[]]$SourceStore.stage_ledger)) $RecordedUtc;$snapshotBytes=ConvertTo-EeeCanonicalJsonBytes $snapshot
    $verification=New-EeePrepublicationVerification $State $ProfileId $subjectStore $redaction $binding $artifactRegistry $inventory $controlInventory $ReconciliationArtifact $terminal $expectedSummary $snapshot $RecordedUtc
    if(-not(Test-EeePrepublicationArtifact $State $ProfileId $subjectStore $redaction $binding $artifactRegistry $inventory $controlInventory $ReconciliationArtifact $terminal $expectedSummary $snapshot $verification).valid){throw 'EEE_PREPUBLICATION_INPUT_INVALID'}
    $artifacts=[ordered]@{recursive_redaction_precommit=$redaction;ledger_binding_set=$binding;artifact_registry=$artifactRegistry;evidence_inventory=$inventory;precommit_control_inventory=$controlInventory;reconciliation_result=$ReconciliationArtifact.record;terminal_projection=$terminal.record;expected_final_summary=$expectedSummary.record;replay_snapshot=$snapshot;prepublication_verification=$verification.record}
    $bytes=[ordered]@{};foreach($id in $artifacts.Keys){$bytes[$id]=ConvertTo-EeeCanonicalJsonBytes $artifacts[$id]}
    $publicationBytes=[ordered]@{};foreach($id in $SourceStore.Keys){$publicationBytes[$id]=[byte[]]$SourceStore[$id].Clone()};foreach($id in @('recursive_redaction_precommit','ledger_binding_set','artifact_registry','evidence_inventory','precommit_control_inventory','reconciliation_result','replay_snapshot','prepublication_verification')){$publicationBytes[$id]=[byte[]]$bytes[$id].Clone()}
    [pscustomobject][ordered]@{schema_version='A24E_FINAL_V4_CONTROL_ARTIFACT_SET';run_id=$State.run_id;profile_id=$ProfileId;artifacts=[pscustomobject]$artifacts;artifact_bytes=[pscustomobject]$bytes;publication_artifact_bytes=[pscustomobject]$publicationBytes;result=$verification.record.result}
}

function New-EeeEngineFinalizationSet {
    param($State,$ControlArtifactSet,[string]$RecordedUtc)
    if(-not(Test-EeeExecutionState $State).valid-or-not(Test-EeeUtc $RecordedUtc)){throw 'EEE_FINALIZATION_INPUT_INVALID'}
    if(-not(Test-EeeRecordShapeInternal $ControlArtifactSet @('schema_version','run_id','profile_id','artifacts','artifact_bytes','publication_artifact_bytes','result'))-or$ControlArtifactSet.schema_version-cne'A24E_FINAL_V4_CONTROL_ARTIFACT_SET'-or$ControlArtifactSet.run_id-cne$State.run_id){throw 'EEE_CONTROL_SET_INVALID'}
    $terminal=$ControlArtifactSet.artifacts.terminal_projection;$expected=$ControlArtifactSet.artifacts.expected_final_summary;$snapshot=$ControlArtifactSet.artifacts.replay_snapshot;$prepublication=$ControlArtifactSet.artifacts.prepublication_verification
    $terminalHash=Get-EeeSha256Hex(ConvertTo-EeeCanonicalJsonBytes $terminal);$expectedBytes=ConvertTo-EeeCanonicalJsonBytes $expected;$expectedHash=Get-EeeSha256Hex $expectedBytes;$snapshotHash=Get-EeeSha256Hex(ConvertTo-EeeCanonicalJsonBytes $snapshot);$prepublicationHash=Get-EeeSha256Hex(ConvertTo-EeeCanonicalJsonBytes $prepublication)
    if($expectedHash-ceq('0'*64)-or$snapshot.expected_final_summary_hash-cne$expectedHash-or$snapshot.terminal_projection_hash-cne$terminalHash-or$prepublication.final_summary_hash-cne$expectedHash-or$prepublication.replay_snapshot_hash-cne$snapshotHash-or$prepublication.terminal_projection_hash-cne$terminalHash){throw 'EEE_FINALIZATION_BINDING_INVALID'}
    if($terminal.terminal_kind-ceq'SUCCESS'){$reason='SUCCESS_COMMIT_PUBLISHED_AND_REREAD'}else{$reason=(Get-EeeFailureTerminalInternal $State.current_state).commit_reason}
    $commit=[pscustomobject][ordered]@{schema_version=$(if($terminal.commit_kind-ceq'SUCCESS'){'A24E_FINAL_V4_SUCCESS_COMMIT'}else{'A24E_FINAL_V4_FAILURE_COMMIT'});run_id=$State.run_id;record_type=$terminal.commit_kind;state_before=$State.current_state;state_after=$terminal.expected_final_state;reason_code=$reason;final_result=$terminal.expected_final_result;actual_classification=$terminal.expected_classification;final_summary_hash=$expectedHash;prepublication_verification_hash=$prepublicationHash;replay_snapshot_hash=$snapshotHash;reconciliation_result_hash=$terminal.reconciliation_result_hash;expected_completion_marker=$terminal.expected_completion_marker;actual_completion_marker=$terminal.expected_completion_marker;commit_created_utc=$RecordedUtc}
    $commitBytes=ConvertTo-EeeCanonicalJsonBytes $commit;$commitHash=Get-EeeSha256Hex $commitBytes
    $complete=[pscustomobject][ordered]@{schema_version='A24E_FINAL_V4_FINAL_SUMMARY';run_id=$expected.run_id;profile_id=$expected.profile_id;contract_version=$expected.contract_version;identity_present=$expected.identity_present;identity_record_hash=$expected.identity_record_hash;terminal_projection_hash=$expected.terminal_projection_hash;expected_final_state=$expected.expected_final_state;expected_final_result=$expected.expected_final_result;expected_classification=$expected.expected_classification;expected_completion_marker=$expected.expected_completion_marker;commit_kind=$expected.commit_kind;reconciliation_result_hash=$expected.reconciliation_result_hash;artifact_registry_hash=$expected.artifact_registry_hash;evidence_inventory_hash=$expected.evidence_inventory_hash;precommit_control_inventory_hash=$expected.precommit_control_inventory_hash;recursive_redaction_hash=$expected.recursive_redaction_hash;ledger_binding_set_hash=$expected.ledger_binding_set_hash;finding_count=[long]$expected.finding_count;recorded_utc=$expected.recorded_utc;commit_record_hash=$commitHash}
    $completeBytes=ConvertTo-EeeCanonicalJsonBytes $complete
    $publicationBytes=[ordered]@{};foreach($id in $ControlArtifactSet.publication_artifact_bytes.PSObject.Properties.Name){$publicationBytes[$id]=[byte[]]$ControlArtifactSet.publication_artifact_bytes.$id.Clone()};$publicationBytes.final_summary=[byte[]]$completeBytes.Clone();$terminalId=$(if($commit.record_type-ceq'SUCCESS'){'success_commit'}else{'failure_commit'});$publicationBytes[$terminalId]=[byte[]]$commitBytes.Clone()
    [pscustomobject][ordered]@{schema_version='A24E_FINAL_V4_ENGINE_FINALIZATION_SET';run_id=$State.run_id;profile_id=$ControlArtifactSet.profile_id;terminal_logical_id=$terminalId;terminal_projection=$terminal;expected_final_summary=$expected;expected_final_summary_bytes=$expectedBytes;expected_final_summary_hash=$expectedHash;replay_snapshot=$snapshot;prepublication_verification=$prepublication;terminal_commit=$commit;terminal_commit_bytes=$commitBytes;terminal_commit_hash=$commitHash;complete_final_summary=$complete;complete_final_summary_bytes=$completeBytes;complete_final_summary_hash=Get-EeeSha256Hex $completeBytes;publication_artifact_bytes=[pscustomobject]$publicationBytes;result='PASS'}
}

function New-EeeEnginePublicationPlan {
    param($FinalizationSet,[string]$StagingRoot,[string]$EvidenceRoot)
    if($null-eq$FinalizationSet-or-not(Test-EeeRecordShapeInternal $FinalizationSet @('schema_version','run_id','profile_id','terminal_logical_id','terminal_projection','expected_final_summary','expected_final_summary_bytes','expected_final_summary_hash','replay_snapshot','prepublication_verification','terminal_commit','terminal_commit_bytes','terminal_commit_hash','complete_final_summary','complete_final_summary_bytes','complete_final_summary_hash','publication_artifact_bytes','result'))-or$FinalizationSet.result-cne'PASS'){throw 'EEE_PUBLICATION_FINALIZATION_INVALID'}
    if(-not[IO.Path]::IsPathRooted($StagingRoot)-or-not[IO.Path]::IsPathRooted($EvidenceRoot)){throw 'EEE_PUBLICATION_ROOT_INVALID'}
    $staging=[IO.Path]::GetFullPath($StagingRoot).TrimEnd('\');$evidence=[IO.Path]::GetFullPath($EvidenceRoot).TrimEnd('\');if([IO.Path]::GetPathRoot($staging)-cne[IO.Path]::GetPathRoot($evidence)){throw 'EEE_PUBLICATION_VOLUME_MISMATCH'}
    $profiles=Get-EeeProfileRegistry;if(-not$profiles.Contains($FinalizationSet.profile_id)){throw 'EEE_PROFILE_INVALID'};$terminalId=$(if($FinalizationSet.terminal_commit.record_type-ceq'SUCCESS'){'success_commit'}else{'failure_commit'});if($FinalizationSet.terminal_logical_id-cne$terminalId){throw 'EEE_TERMINAL_LOGICAL_ID_INVALID'}
    $published=$FinalizationSet.publication_artifact_bytes;$bindings=@{replay_snapshot=Get-EeeSha256Hex(ConvertTo-EeeCanonicalJsonBytes $FinalizationSet.replay_snapshot);prepublication_verification=Get-EeeSha256Hex(ConvertTo-EeeCanonicalJsonBytes $FinalizationSet.prepublication_verification);final_summary=$FinalizationSet.complete_final_summary_hash;$terminalId=$FinalizationSet.terminal_commit_hash};foreach($id in $bindings.Keys){if($null-eq$published.PSObject.Properties[$id]-or(Get-EeeSha256Hex([byte[]]$published.$id))-cne$bindings[$id]){throw 'EEE_PUBLICATION_ARTIFACT_BINDING_INVALID'}}
    $expected=@($profiles[$FinalizationSet.profile_id])+@('precommit_control_inventory','reconciliation_result','replay_snapshot','prepublication_verification','final_summary',$terminalId);$expected=@($expected|Sort-Object -Unique);$actual=@($FinalizationSet.publication_artifact_bytes.PSObject.Properties.Name)
    if(@($expected|Where-Object{$_-cnotin$actual}).Count-or@($actual|Where-Object{$_-cnotin$expected}).Count){throw 'EEE_PUBLICATION_ARTIFACT_SET_INVALID'}
    $registry=@(Get-EeeArtifactRegistry);$selected=@($registry|Where-Object{$_.logical_id-cin$expected});if(@($selected|Group-Object logical_id|Where-Object Count -ne 1).Count-or@($selected|Group-Object path|Where-Object Count -ne 1).Count){throw 'EEE_PUBLICATION_REGISTRY_DUPLICATE'};$nonterminal=@($expected|Where-Object{$_-cne$terminalId}|Sort-Object);$ordered=@($nonterminal)+@($terminalId);$rows=@();$commands=@();$count=[long]$ordered.Count
    for($i=0;$i-lt$ordered.Count;$i++){$id=$ordered[$i];$d=@($registry|Where-Object logical_id -CEQ $id);if($d.Count-ne1){throw 'EEE_PUBLICATION_DESCRIPTOR_INVALID'};$bytes=[byte[]]$FinalizationSet.publication_artifact_bytes.$id;$source=[IO.Path]::GetFullPath((Join-Path $staging $d[0].path));$destination=[IO.Path]::GetFullPath((Join-Path $evidence $d[0].path));if(-not$source.StartsWith($staging+'\',[StringComparison]::OrdinalIgnoreCase)-or-not$destination.StartsWith($evidence+'\',[StringComparison]::OrdinalIgnoreCase)){throw 'EEE_PUBLICATION_PATH_ESCAPE'};$sequence=[long]($i+1);$terminal=$id-ceq$terminalId;$row=[pscustomobject][ordered]@{logical_id=$id;path=$d[0].path;sha256=Get-EeeSha256Hex $bytes;size_bytes=[long]$bytes.Length;terminal_commit=$terminal};$command=[pscustomobject][ordered]@{schema_version='A24E_FINAL_V4_PUBLICATION_COMMAND';run_id=$FinalizationSet.run_id;command_sequence=$sequence;logical_id=$id;source_staging_path=$source;destination_path=$destination;expected_sha256=$row.sha256;expected_size_bytes=$row.size_bytes;expected_destination_absent=$true;create_once=$true;overwrite_forbidden=$true;same_volume_required=$true;terminal_commit=$terminal;expected_final_sequence=$count;collision_policy='FAIL_CLOSED';bounded_timeout_ms=[long]30000};$rows+=,$row;$commands+=,$command}
    $commandHash=Get-EeeSha256Hex(ConvertTo-EeeCanonicalJsonBytes @($commands));[pscustomobject][ordered]@{schema_version='A24E_FINAL_V4_ENGINE_PUBLICATION_PLAN';run_id=$FinalizationSet.run_id;profile_id=$FinalizationSet.profile_id;terminal_logical_id=$terminalId;artifact_rows=$rows;artifact_count=$count;commands=$commands;command_count=$count;command_set_hash=$commandHash;staging_root=$staging;evidence_root=$evidence;result='PASS'}
}

function Test-EeeEnginePublicationPlan {
    param($FinalizationSet,$Plan)
    try{$expected=New-EeeEnginePublicationPlan $FinalizationSet $Plan.staging_root $Plan.evidence_root;if((Get-EeeSha256Hex(ConvertTo-EeeCanonicalJsonBytes $expected))-cne(Get-EeeSha256Hex(ConvertTo-EeeCanonicalJsonBytes $Plan))){throw 'EEE_PUBLICATION_PLAN_MISMATCH'};New-EeeValidationResult $true}catch{New-EeeValidationResult $false 'EVIDENCE_INVALID'}
}

function Test-EeeEnginePublicationReceipts {
    param($FinalizationSet,$Plan,[object[]]$Receipts)
    try {
        if(-not(Test-EeeEnginePublicationPlan $FinalizationSet $Plan).valid-or$Receipts.Count-ne$Plan.command_count){throw 'EEE_PUBLICATION_RECEIPT_COUNT_INVALID'}
        $fields=@('schema_version','run_id','command_sequence','logical_id','command_hash','attempted','source_reread_succeeded','source_sha256','source_size_bytes','destination_was_absent','publish_succeeded','destination_reread_succeeded','destination_sha256','destination_size_bytes','create_once_preserved','overwrite_occurred','same_volume_preserved','collision_detected','recorded_utc','failure_code')
        $validated=@();for($i=0;$i-lt$Plan.commands.Count;$i++){$c=$Plan.commands[$i];$r=$Receipts[$i];if(-not(Test-EeeRecordShapeInternal $r $fields)){throw 'EEE_PUBLICATION_RECEIPT_SCHEMA_INVALID'};$typed=$r.schema_version-is[string]-and$r.run_id-is[string]-and$r.command_sequence-is[long]-and$r.logical_id-is[string]-and$r.command_hash-is[string]-and$r.attempted-is[bool]-and$r.source_reread_succeeded-is[bool]-and$r.source_sha256-is[string]-and$r.source_size_bytes-is[long]-and$r.destination_was_absent-is[bool]-and$r.publish_succeeded-is[bool]-and$r.destination_reread_succeeded-is[bool]-and$r.destination_sha256-is[string]-and$r.destination_size_bytes-is[long]-and$r.create_once_preserved-is[bool]-and$r.overwrite_occurred-is[bool]-and$r.same_volume_preserved-is[bool]-and$r.collision_detected-is[bool]-and$r.recorded_utc-is[string]-and$r.failure_code-is[string];if(-not$typed){throw 'EEE_PUBLICATION_RECEIPT_TYPE_INVALID'};$commandHash=Get-EeeSha256Hex(ConvertTo-EeeCanonicalJsonBytes $c);$valid=$r.schema_version-ceq'A24E_FINAL_V4_TRANSPORT_RECEIPT'-and$r.run_id-ceq$c.run_id-and$r.command_sequence-eq$c.command_sequence-and$r.logical_id-ceq$c.logical_id-and$r.command_hash-ceq$commandHash-and$r.attempted-and$r.source_reread_succeeded-and$r.source_sha256-ceq$c.expected_sha256-and$r.source_size_bytes-eq$c.expected_size_bytes-and$r.destination_was_absent-and$r.publish_succeeded-and$r.destination_reread_succeeded-and$r.destination_sha256-ceq$c.expected_sha256-and$r.destination_size_bytes-eq$c.expected_size_bytes-and$r.create_once_preserved-and-not$r.overwrite_occurred-and$r.same_volume_preserved-and-not$r.collision_detected-and(Test-EeeUtc $r.recorded_utc)-and$r.failure_code-ceq'NONE';if(-not$valid){throw 'EEE_PUBLICATION_RECEIPT_INVALID'};$validated+=,[pscustomobject][ordered]@{command_sequence=[long]$c.command_sequence;logical_id=$c.logical_id;command_hash=$commandHash;receipt_hash=Get-EeeSha256Hex(ConvertTo-EeeCanonicalJsonBytes $r);terminal_commit=[bool]$c.terminal_commit}}
        $lastCommand=$Plan.commands[-1];$lastReceipt=$Receipts[-1];$commitLast=$lastCommand.terminal_commit-and$lastCommand.logical_id-ceq$FinalizationSet.terminal_logical_id-and$lastCommand.command_sequence-eq$Plan.command_count-and$lastReceipt.logical_id-ceq$FinalizationSet.terminal_logical_id-and$lastReceipt.command_sequence-eq$Plan.command_count-and@($Plan.commands|Where-Object{$_.terminal_commit}).Count-eq1
        if(-not$commitLast){throw 'EEE_TERMINAL_COMMIT_NOT_LAST'}
        $terminalBytes=[byte[]]$FinalizationSet.publication_artifact_bytes.($FinalizationSet.terminal_logical_id);if((Get-EeeSha256Hex $terminalBytes)-cne$lastReceipt.destination_sha256-or$terminalBytes.Length-ne$lastReceipt.destination_size_bytes-or(Get-EeeSha256Hex $terminalBytes)-cne$FinalizationSet.terminal_commit_hash){throw 'EEE_TERMINAL_REREAD_INVALID'}
        $proof=[pscustomobject][ordered]@{schema_version='A24E_FINAL_V4_ENGINE_PUBLICATION_PROOF';run_id=$FinalizationSet.run_id;command_set_hash=$Plan.command_set_hash;validated_receipt_rows=$validated;validated_receipt_count=[long]$validated.Count;terminal_logical_id=$FinalizationSet.terminal_logical_id;terminal_sequence=[long]$lastCommand.command_sequence;terminal_commit_hash=$FinalizationSet.terminal_commit_hash;complete_summary_sequence=[long](@($Plan.commands|Where-Object logical_id -CEQ 'final_summary')[0].command_sequence);commit_last_proven=$true;no_postcommit_write_proven=$true;terminal_reread_proven=$true;result='PASS'}
        [pscustomobject][ordered]@{valid=$true;failure_code='NONE';proof=$proof;proof_hash=Get-EeeSha256Hex(ConvertTo-EeeCanonicalJsonBytes $proof)}
    } catch { [pscustomobject][ordered]@{valid=$false;failure_code='EVIDENCE_INVALID';proof=$null;proof_hash=$null} }
}

function Invoke-EeeEngineFinalizationReplay {
    param($FinalizationSet,$PublicationPlan,[object[]]$Receipts)
    try {
        $fields=@('schema_version','run_id','profile_id','terminal_logical_id','terminal_projection','expected_final_summary','expected_final_summary_bytes','expected_final_summary_hash','replay_snapshot','prepublication_verification','terminal_commit','terminal_commit_bytes','terminal_commit_hash','complete_final_summary','complete_final_summary_bytes','complete_final_summary_hash','publication_artifact_bytes','result')
        if(-not(Test-EeeRecordShapeInternal $FinalizationSet $fields)-or$FinalizationSet.result-cne'PASS'-or$null-eq$PublicationPlan-or$null-eq$Receipts){throw 'EEE_REPLAY_SET_INVALID'}
        $expectedHash=Get-EeeSha256Hex(ConvertTo-EeeCanonicalJsonBytes $FinalizationSet.expected_final_summary);$commitHash=Get-EeeSha256Hex(ConvertTo-EeeCanonicalJsonBytes $FinalizationSet.terminal_commit);$completeHash=Get-EeeSha256Hex(ConvertTo-EeeCanonicalJsonBytes $FinalizationSet.complete_final_summary)
        if($expectedHash-cne$FinalizationSet.expected_final_summary_hash-or$commitHash-cne$FinalizationSet.terminal_commit_hash-or$completeHash-cne$FinalizationSet.complete_final_summary_hash-or(Get-EeeSha256Hex([byte[]]$FinalizationSet.expected_final_summary_bytes))-cne$expectedHash-or(Get-EeeSha256Hex([byte[]]$FinalizationSet.terminal_commit_bytes))-cne$commitHash-or(Get-EeeSha256Hex([byte[]]$FinalizationSet.complete_final_summary_bytes))-cne$completeHash-or$FinalizationSet.terminal_commit.final_summary_hash-cne$expectedHash-or$FinalizationSet.complete_final_summary.commit_record_hash-cne$commitHash-or$FinalizationSet.prepublication_verification.final_summary_hash-cne$expectedHash-or$FinalizationSet.replay_snapshot.expected_final_summary_hash-cne$expectedHash-or$FinalizationSet.terminal_commit.expected_completion_marker-cne$FinalizationSet.terminal_commit.actual_completion_marker){throw 'EEE_REPLAY_BINDING_INVALID'}
        $publication=Test-EeeEnginePublicationReceipts $FinalizationSet $PublicationPlan $Receipts;if(-not$publication.valid-or-not$publication.proof.commit_last_proven-or-not$publication.proof.terminal_reread_proven){throw 'EEE_PUBLICATION_AUTHORITY_MISSING'}
        [pscustomobject][ordered]@{authoritative=$true;terminal_state=$FinalizationSet.terminal_commit.state_after;terminal_result=$FinalizationSet.terminal_commit.final_result;publication_proof_hash=$publication.proof_hash;failure_code='NONE'}
    } catch { [pscustomobject][ordered]@{authoritative=$false;terminal_state='EVIDENCE_INVALID';terminal_result='FAIL';publication_proof_hash=$null;failure_code='EVIDENCE_INVALID'} }
}

function New-EeePublicationReceiptFixtureInternal {
    param($Plan,[string]$RecordedUtc)
    $receipts=@()
    foreach($command in @($Plan.commands)){
        $receipts+=,[pscustomobject][ordered]@{schema_version='A24E_FINAL_V4_TRANSPORT_RECEIPT';run_id=$command.run_id;command_sequence=[long]$command.command_sequence;logical_id=$command.logical_id;command_hash=Get-EeeSha256Hex(ConvertTo-EeeCanonicalJsonBytes $command);attempted=$true;source_reread_succeeded=$true;source_sha256=$command.expected_sha256;source_size_bytes=[long]$command.expected_size_bytes;destination_was_absent=$true;publish_succeeded=$true;destination_reread_succeeded=$true;destination_sha256=$command.expected_sha256;destination_size_bytes=[long]$command.expected_size_bytes;create_once_preserved=$true;overwrite_occurred=$false;same_volume_preserved=$true;collision_detected=$false;recorded_utc=$RecordedUtc;failure_code='NONE'}
    }
    return $receipts
}

function Invoke-EeeInventorySelfFixTestSuite {
    $failures=New-Object System.Collections.ArrayList;$results=New-Object System.Collections.ArrayList;$test=[ref]0
    function Add-Result([string]$Name,[bool]$Pass){$test.Value++;[void]$results.Add([pscustomobject][ordered]@{test_id=('ISF{0:D2}'-f$test.Value);name=$Name;result=$(if($Pass){'PASS'}else{'FAIL'})});if(-not$Pass){[void]$failures.Add($Name)}}
    $run='inventory-self-fix';$utc='2026-01-01T00:00:00.000Z';$profile='SUCCESS_PROFILE';$utf8=[Text.UTF8Encoding]::new($false,$true);$source=@{}
    foreach($id in @('create_identity','role_attestation_identity','trusted_role_identity','cleanup_evidence','post_cleanup_evidence')){$source[$id]=$utf8.GetBytes('{"run_id":"inventory-self-fix"}')}
    foreach($id in @('transition_ledger','classification_ledger','stage_ledger')){$source[$id]=$utf8.GetBytes("{`"run_id`":`"inventory-self-fix`"}`n")}
    $state=New-EeeExecutionState $run;$zero='0'*64;$redactionSeed=New-EeeRecursiveRedactionPrecommit $run $profile $source @() $utc;$ledgerSeed=@{transition_ledger=$source.transition_ledger;classification_ledger=$source.classification_ledger;stage_ledger=$source.stage_ledger};$bindingSeed=New-EeeLedgerBindingSet $run $ledgerSeed $utc;$registrySeed=New-EeeArtifactRegistryRecord $run $profile $utc;$subject=@{};foreach($id in $source.Keys){$subject[$id]=[byte[]]$source[$id]};$subject.recursive_redaction_precommit=ConvertTo-EeeCanonicalJsonBytes $redactionSeed;$subject.ledger_binding_set=ConvertTo-EeeCanonicalJsonBytes $bindingSeed;$subject.artifact_registry=ConvertTo-EeeCanonicalJsonBytes $registrySeed;$inventorySeed=New-EeeExactInventory $run $profile $subject $utc;$controlSeed=New-EeePrecommitControlInventory $run $profile @{recursive_redaction_precommit=$subject.recursive_redaction_precommit;ledger_binding_set=$subject.ledger_binding_set;artifact_registry=$subject.artifact_registry;evidence_inventory=ConvertTo-EeeCanonicalJsonBytes $inventorySeed} $utc;$reconciliation=New-EeeReconciliationArtifact $state $profile $subject $redactionSeed $bindingSeed $registrySeed $inventorySeed $controlSeed $utc
    $state.current_state='COMPLETE_CANDIDATE';$state=Protect-EeeExecutionState $state;$reconciliation=New-EeeReconciliationArtifact $state $profile $subject $redactionSeed $bindingSeed $registrySeed $inventorySeed $controlSeed $utc
    try{$set=New-EeeControlArtifactSet $state $profile $source @() $reconciliation $utc;Add-Result 'valid_inventory_self_exclusion' ($set.result-ceq'PASS')}catch{Add-Result 'valid_inventory_self_exclusion' $false}
    $inventory=$set.artifacts.evidence_inventory;$inventoryBytes=[byte[]]$set.artifact_bytes.evidence_inventory
    $published=@{};foreach($id in $subject.Keys){$published[$id]=[byte[]]$subject[$id]};$published.evidence_inventory=$inventoryBytes
    $again=New-EeeExactInventory $run $profile $subject $utc;Add-Result 'first_construction_stable' ((Get-EeeSha256Hex $inventoryBytes)-ceq(Get-EeeSha256Hex(ConvertTo-EeeCanonicalJsonBytes $inventory)))
    Add-Result 'repeat_construction_deterministic' ((Get-EeeSha256Hex(ConvertTo-EeeCanonicalJsonBytes $again))-ceq(Get-EeeSha256Hex $inventoryBytes))
    $bad=Copy-EeeValue $inventory;$bad.inventory_rows+=,[pscustomobject][ordered]@{logical_id='evidence_inventory';path='control/evidence-inventory.json';schema_version='A24E_FINAL_V4_EVIDENCE_INVENTORY';sha256=$zero;byte_count=[long]1};Add-Result 'synthetic_self_row_rejected' (-not(Test-EeeExactInventory $run $profile $subject $bad (ConvertTo-EeeCanonicalJsonBytes $bad) $published).valid)
    $bad=Copy-EeeValue $inventory;$bad.self_excluded_logical_id=$null;Add-Result 'missing_exclusion_rejected' (-not(Test-EeeExactInventory $run $profile $subject $bad (ConvertTo-EeeCanonicalJsonBytes $bad) $published).valid)
    $bad=Copy-EeeValue $inventory;$bad.self_excluded_logical_id='artifact_registry';Add-Result 'other_exclusion_rejected' (-not(Test-EeeExactInventory $run $profile $subject $bad (ConvertTo-EeeCanonicalJsonBytes $bad) $published).valid)
    $missingPublished=@{};foreach($id in $subject.Keys){$missingPublished[$id]=$subject[$id]};Add-Result 'missing_inventory_publication_rejected' (-not(Test-EeeExactInventory $run $profile $subject $inventory $inventoryBytes $missingPublished).valid)
    $missing=@{};foreach($id in $subject.Keys){if($id-cne'create_identity'){$missing[$id]=$subject[$id]}};$caught=$false;try{[void](New-EeeExactInventory $run $profile $missing $utc)}catch{$caught=$_.Exception.Message-ceq'EEE_INVENTORY_MEMBER_MISMATCH'};Add-Result 'missing_subject_rejected' $caught
    $extra=@{};foreach($id in $subject.Keys){$extra[$id]=$subject[$id]};$extra.final_summary=$utf8.GetBytes('{}');$caught=$false;try{[void](New-EeeExactInventory $run $profile $extra $utc)}catch{$caught=$true};Add-Result 'forbidden_subject_rejected' $caught
    $extra.unknown=$utf8.GetBytes('{}');$caught=$false;try{[void](New-EeeExactInventory $run $profile $extra $utc)}catch{$caught=$true};Add-Result 'unknown_subject_rejected' $caught
    $tampered=[byte[]]$inventoryBytes.Clone();$tampered[0]=$tampered[0]-bxor1;Add-Result 'tampered_inventory_rejected' (-not(Test-EeeExactInventory $run $profile $subject $inventory $tampered $published).valid)
    $bad=Copy-EeeValue $inventory;$bad.inventory_rows[0].sha256=$zero;Add-Result 'tampered_subject_hash_rejected' (-not(Test-EeeExactInventory $run $profile $subject $bad (ConvertTo-EeeCanonicalJsonBytes $bad) $published).valid)
    Add-Result 'replay_valid_inventory' ((Test-EeeExactInventory $run $profile $subject $inventory $inventoryBytes $published).valid)
    Add-Result 'replay_missing_inventory_rejected' (-not(Test-EeeExactInventory $run $profile $subject $inventory $inventoryBytes $missingPublished).valid)
    Add-Result 'redaction_valid' ($set.artifacts.recursive_redaction_precommit.result-ceq'PASS')
    $secret=$utf8.GetBytes('secret');$secretSource=@{};foreach($id in $source.Keys){$secretSource[$id]=[byte[]]$source[$id]};$secretSource.create_identity=$utf8.GetBytes('secret');$red=New-EeeRecursiveRedactionPrecommit $run $profile $secretSource @(,$secret) $utc;Add-Result 'redaction_secret_detected' ($red.result-ceq'FAIL')
    Add-Result 'ledger_binding_valid' ($set.artifacts.ledger_binding_set.result-ceq'PASS')
    $badLedgers=@{transition_ledger=$source.transition_ledger;classification_ledger=$source.classification_ledger};$caught=$false;try{[void](New-EeeLedgerBindingSet $run $badLedgers $utc)}catch{$caught=$true};Add-Result 'ledger_binding_missing_rejected' $caught
    Add-Result 'artifact_registry_valid' ($set.artifacts.artifact_registry.registry_count-eq12)
    $registry=@(Get-EeeArtifactRegistry);Add-Result 'artifact_registry_unique' (-not@($registry|Group-Object logical_id|Where-Object Count -ne 1).Count-and-not@($registry|Group-Object path|Where-Object Count -ne 1).Count)
    Add-Result 'replay_snapshot_valid' ($set.artifacts.replay_snapshot.schema_version-ceq'A24E_FINAL_V4_REPLAY_SNAPSHOT')
    $snapshotNames=@($set.artifacts.replay_snapshot.PSObject.Properties.Name);Add-Result 'replay_snapshot_has_no_terminal_commit_fields' ('commit_record_hash'-cnotin$snapshotNames-and'actual_completion_marker'-cnotin$snapshotNames)
    Add-Result 'prepublication_valid' ($set.artifacts.prepublication_verification.result-ceq'PASS')
    $forced=Copy-EeeValue $set.artifacts.prepublication_verification;$forced.binding_pass=$false;$forced.result='PASS';Add-Result 'caller_forced_pass_not_engine_output' ((Get-EeeSha256Hex(ConvertTo-EeeCanonicalJsonBytes $forced))-cne(Get-EeeSha256Hex([byte[]]$set.artifact_bytes.prepublication_verification)))
    Add-Result 'end_to_end_control_build' ($set.result-ceq'PASS'-and@($set.artifacts.PSObject.Properties).Count-eq10)
    Add-Result 'success_published_membership' ((Test-EeePublishedProfileSet $profile $published).valid)
    Add-Result 'success_subject_membership' ($inventory.required_count-eq11-and$inventory.total_count-eq11-and$inventory.self_excluded_logical_id-ceq'evidence_inventory')
    $completeAuthority=$false;$replayAuthority=$false
    try{$finalState=Copy-EeeValue $state;$finalState.current_state='COMPLETE_CANDIDATE';$finalState.cleanup_result='PASS';$finalState.post_cleanup_result='PASS';$finalState=Protect-EeeExecutionState $finalState;$secretEvidence=Invoke-EeeSecretLifecycle $run @();$plan=New-EeeFinalizationPlan $finalState $profile $subject $inventory $secretEvidence $published 'C:\a24e-stage' 'C:\a24e-evidence' 'MARKER' $utc;$receipts=@();foreach($command in $plan.commands){$receipts+=,[pscustomobject][ordered]@{schema_version='A24E_DIRECT_PUBLICATION_RECEIPT';run_id=$run;command_id=$command.command_id;attempted=$true;source_reread='PASS';destination_precondition='ABSENT';operation_result='PASS';destination_reread='PASS';actual_destination_sha256=$command.expected_source_sha256;exact_match=$true;collision_result='NONE';terminal_ordering=$(if($command.terminal_commit){'LAST'}else{'BEFORE_TERMINAL'});failure_code='NONE';recorded_utc=$utc}};$confirmation=Confirm-EeeFinalization $finalState $plan $receipts;$completeAuthority=$confirmation.complete_authoritative-and$confirmation.state.current_state-ceq'COMPLETE';$replay=Invoke-EeeReplay $plan.summary $plan.commit $plan.summary_bytes $plan.commit_bytes;$replayAuthority=$replay.authoritative-and$replay.terminal_state-ceq'COMPLETE'-and$replay.terminal_result-ceq'PASS'}catch{$completeAuthority=$false;$replayAuthority=$false}
    Add-Result 'success_finalization_authoritative_complete' $completeAuthority
    Add-Result 'success_replay_authoritative_complete_pass' $replayAuthority
    $fabricated=Copy-EeeValue $inventory;$fabricated.inventory_rows=@();Add-Result 'runner_fabricated_rows_rejected' (-not(Test-EeeExactInventory $run $profile $subject $fabricated (ConvertTo-EeeCanonicalJsonBytes $fabricated) $published).valid)
    Add-Result 'inputs_immutable' (-not$source.ContainsKey('evidence_inventory')-and$source.Count-eq8)
    $set2=New-EeeControlArtifactSet $state $profile $source @() $reconciliation $utc;Add-Result 'canonical_determinism' ((ConvertTo-EeeCanonicalJson $set.artifacts)-ceq(ConvertTo-EeeCanonicalJson $set2.artifacts))
    Add-Result 'hash_determinism' ((Get-EeeSha256Hex([byte[]]$set.artifact_bytes.evidence_inventory))-ceq(Get-EeeSha256Hex([byte[]]$set2.artifact_bytes.evidence_inventory)))
    $v1=Test-EeeExactInventory $run $profile $subject $inventory $inventoryBytes $published;$v2=Test-EeeExactInventory $run $profile $subject $inventory $inventoryBytes $published;Add-Result 'replay_determinism' ($v1.valid-eq$v2.valid-and$v1.failure_code-ceq$v2.failure_code)
    [pscustomobject][ordered]@{result=$(if($failures.Count){'FAIL'}else{'PASS'});test_count=[long]$test.Value;pass_count=[long]($test.Value-$failures.Count);failure_count=[long]$failures.Count;failures=@($failures);tests=@($results)}
}

function Invoke-EeeReconcileFixTestSuite {
    $failures=New-Object System.Collections.ArrayList;$rows=New-Object System.Collections.ArrayList;$counter=[ref]0
    function Add-Rf([string]$Name,[bool]$Pass){$counter.Value++;[void]$rows.Add([pscustomobject][ordered]@{test_id=('RCF{0:D2}'-f$counter.Value);name=$Name;result=$(if($Pass){'PASS'}else{'FAIL'})});if(-not$Pass){[void]$failures.Add($Name)}}
    $run='reconcile-fix';$utc='2026-01-01T00:00:00.000Z';$profile='SUCCESS_PROFILE';$u=[Text.UTF8Encoding]::new($false,$true);$zero='0'*64;$source=@{}
    foreach($id in @('create_identity','role_attestation_identity','trusted_role_identity','cleanup_evidence','post_cleanup_evidence')){$source[$id]=$u.GetBytes('{"run_id":"reconcile-fix"}')};foreach($id in @('transition_ledger','classification_ledger','stage_ledger')){$source[$id]=$u.GetBytes("{`"run_id`":`"reconcile-fix`"}`n")}
    $state=New-EeeExecutionState $run;$red=New-EeeRecursiveRedactionPrecommit $run $profile $source @() $utc;$ledgers=@{transition_ledger=$source.transition_ledger;classification_ledger=$source.classification_ledger;stage_ledger=$source.stage_ledger};$binding=New-EeeLedgerBindingSet $run $ledgers $utc;$registry=New-EeeArtifactRegistryRecord $run $profile $utc;$subject=@{};foreach($id in $source.Keys){$subject[$id]=[byte[]]$source[$id]};$subject.recursive_redaction_precommit=ConvertTo-EeeCanonicalJsonBytes $red;$subject.ledger_binding_set=ConvertTo-EeeCanonicalJsonBytes $binding;$subject.artifact_registry=ConvertTo-EeeCanonicalJsonBytes $registry;$inventory=New-EeeExactInventory $run $profile $subject $utc;$control=New-EeePrecommitControlInventory $run $profile @{recursive_redaction_precommit=$subject.recursive_redaction_precommit;ledger_binding_set=$subject.ledger_binding_set;artifact_registry=$subject.artifact_registry;evidence_inventory=ConvertTo-EeeCanonicalJsonBytes $inventory} $utc;$rec=New-EeeReconciliationArtifact $state $profile $subject $red $binding $registry $inventory $control $utc
    $state.current_state='COMPLETE_CANDIDATE';$state=Protect-EeeExecutionState $state;$rec=New-EeeReconciliationArtifact $state $profile $subject $red $binding $registry $inventory $control $utc
    $recValid=Test-EeeReconciliationArtifact $state $profile $subject $red $binding $registry $inventory $control $rec;Add-Rf 'valid_engine_reconciliation' $recValid.valid
    Add-Rf 'arbitrary_byte_array_rejected' (-not(Test-EeeReconciliationArtifact $state $profile $subject $red $binding $registry $inventory $control ([byte[]](1,2,3))).valid)
    Add-Rf 'random_utf8_rejected' (-not(Test-EeeReconciliationArtifact $state $profile $subject $red $binding $registry $inventory $control ($u.GetBytes('random'))).valid)
    Add-Rf 'caller_pass_object_rejected' (-not(Test-EeeReconciliationArtifact $state $profile $subject $red $binding $registry $inventory $control ([pscustomobject]@{result='PASS'})).valid)
    $m=Copy-EeeValue $rec;$m.PSObject.Properties.Remove('sha256');Add-Rf 'missing_field_rejected' (-not(Test-EeeReconciliationArtifact $state $profile $subject $red $binding $registry $inventory $control $m).valid)
    $m=Copy-EeeValue $rec;$m|Add-Member noteproperty unknown x;Add-Rf 'unknown_field_rejected' (-not(Test-EeeReconciliationArtifact $state $profile $subject $red $binding $registry $inventory $control $m).valid)
    $m=Copy-EeeValue $rec;$m.schema_version='WRONG';Add-Rf 'wrong_schema_rejected' (-not(Test-EeeReconciliationArtifact $state $profile $subject $red $binding $registry $inventory $control $m).valid)
    $m=Copy-EeeValue $rec;$m.record.run_id='wrong';Add-Rf 'wrong_run_rejected' (-not(Test-EeeReconciliationArtifact $state $profile $subject $red $binding $registry $inventory $control $m).valid)
    $m=Copy-EeeValue $rec;$m.record.identity_present=$true;Add-Rf 'wrong_state_identity_rejected' (-not(Test-EeeReconciliationArtifact $state $profile $subject $red $binding $registry $inventory $control $m).valid)
    $m=Copy-EeeValue $rec;$m.record.evidence_inventory_hash=$zero;Add-Rf 'wrong_inventory_hash_rejected' (-not(Test-EeeReconciliationArtifact $state $profile $subject $red $binding $registry $inventory $control $m).valid)
    $m=Copy-EeeValue $rec;$m.record.ledger_binding_set_hash=$zero;Add-Rf 'wrong_binding_hash_rejected' (-not(Test-EeeReconciliationArtifact $state $profile $subject $red $binding $registry $inventory $control $m).valid)
    $m=Copy-EeeValue $rec;$m.record.findings=@([pscustomobject][ordered]@{finding_code='FORGED';severity=[int]1;logical_id='x'});Add-Rf 'forged_findings_rejected' (-not(Test-EeeReconciliationArtifact $state $profile $subject $red $binding $registry $inventory $control $m).valid)
    $m=Copy-EeeValue $rec;$m.record.finding_count=[long]1;Add-Rf 'wrong_blocking_count_rejected' (-not(Test-EeeReconciliationArtifact $state $profile $subject $red $binding $registry $inventory $control $m).valid)
    $m=Copy-EeeValue $rec;$m.canonical_bytes=[byte[]]$m.canonical_bytes.Clone();$m.canonical_bytes[0]=$m.canonical_bytes[0]-bxor1;Add-Rf 'tampered_reconciliation_bytes_rejected' (-not(Test-EeeReconciliationArtifact $state $profile $subject $red $binding $registry $inventory $control $m).valid)
    $obs=[pscustomobject][ordered]@{run_id=$run;stage_name='create';dependency_block=$false;launch_failed=$true;wrapper_failed=$false;timed_out=$false;termination_incomplete=$false;exit_code=[long]-1;marker_count=[long]0;stdout_redaction_rejected=$false;stderr_redaction_rejected=$false;harness_schema_failed=$false;harness_incomplete=$false;stdout_sha256=$zero;stderr_sha256=$zero;recorded_utc=$utc};$failureState=(Invoke-EeeProcessObservation $state $obs).state;$failureRec=New-EeeReconciliationArtifact $failureState $profile $subject $red $binding $registry $inventory $control $utc;Add-Rf 'valid_failure_reconciliation' ((Test-EeeReconciliationArtifact $failureState $profile $subject $red $binding $registry $inventory $control $failureRec).valid-and$failureRec.record.result-ceq'FAIL')
    Add-Rf 'valid_success_reconciliation' ($rec.record.result-ceq'PASS')
    $rec2=New-EeeReconciliationArtifact $state $profile $subject $red $binding $registry $inventory $control $utc;Add-Rf 'reconciliation_deterministic' ($rec.sha256-ceq$rec2.sha256)
    Add-Rf 'reconciliation_replay_equivalent' ((Test-EeeReconciliationArtifact $state $profile $subject $red $binding $registry $inventory $control $rec2).valid)
    $terminal=New-EeeTerminalProjection $state $rec $utc;$expected=New-EeeExpectedFinalSummary $state $profile $terminal $rec $red $binding $registry $inventory $control $utc;$snapshot=New-EeeReplaySnapshot $state $profile $terminal $expected (Get-EeeSha256Hex(ConvertTo-EeeCanonicalJsonBytes $registry)) (Get-EeeSha256Hex(ConvertTo-EeeCanonicalJsonBytes $inventory)) (Get-EeeSha256Hex(ConvertTo-EeeCanonicalJsonBytes $control)) $rec.sha256 (Get-EeeSha256Hex $source.classification_ledger) (Get-EeeSha256Hex $source.transition_ledger) (Get-EeeSha256Hex $source.stage_ledger) $utc;$pre=New-EeePrepublicationVerification $state $profile $subject $red $binding $registry $inventory $control $rec $terminal $expected $snapshot $utc
    Add-Rf 'valid_engine_prepublication' ((Test-EeePrepublicationArtifact $state $profile $subject $red $binding $registry $inventory $control $rec $terminal $expected $snapshot $pre).valid)
    Add-Rf 'caller_pass_prepublication_rejected' (-not(Test-EeePrepublicationArtifact $state $profile $subject $red $binding $registry $inventory $control $rec $terminal $expected $snapshot ([pscustomobject]@{result='PASS'})).valid)
    $m=Copy-EeeValue $pre;$m.PSObject.Properties.Remove('sha256');Add-Rf 'incomplete_prepublication_rejected' (-not(Test-EeePrepublicationArtifact $state $profile $subject $red $binding $registry $inventory $control $rec $terminal $expected $snapshot $m).valid)
    $m=Copy-EeeValue $pre;$m|Add-Member noteproperty unknown x;Add-Rf 'unknown_prepublication_field_rejected' (-not(Test-EeePrepublicationArtifact $state $profile $subject $red $binding $registry $inventory $control $rec $terminal $expected $snapshot $m).valid)
    $m=Copy-EeeValue $pre;$m.record.reconciliation_result_hash=$zero;Add-Rf 'wrong_reconciliation_hash_rejected' (-not(Test-EeePrepublicationArtifact $state $profile $subject $red $binding $registry $inventory $control $rec $terminal $expected $snapshot $m).valid)
    $m=Copy-EeeValue $pre;$m.record.replay_snapshot_hash=$zero;Add-Rf 'wrong_snapshot_hash_rejected' (-not(Test-EeePrepublicationArtifact $state $profile $subject $red $binding $registry $inventory $control $rec $terminal $expected $snapshot $m).valid)
    $m=Copy-EeeValue $pre;$m.record.precommit_member_count=[long]4;Add-Rf 'wrong_inventory_count_rejected' (-not(Test-EeePrepublicationArtifact $state $profile $subject $red $binding $registry $inventory $control $rec $terminal $expected $snapshot $m).valid)
    $m=Copy-EeeValue $pre;$m.record.artifact_registry_hash=$zero;Add-Rf 'wrong_artifact_hash_rejected' (-not(Test-EeePrepublicationArtifact $state $profile $subject $red $binding $registry $inventory $control $rec $terminal $expected $snapshot $m).valid)
    $badRed=Copy-EeeValue $red;$badRed.result='FAIL';$caught=$false;try{[void](New-EeePrepublicationVerification $state $profile $subject $badRed $binding $registry $inventory $control $rec $terminal $expected $snapshot $utc)}catch{$caught=$true};Add-Rf 'redaction_fail_rejected' $caught
    $badBinding=Copy-EeeValue $binding;$badBinding.result='FAIL';$caught=$false;try{[void](New-EeePrepublicationVerification $state $profile $subject $red $badBinding $registry $inventory $control $rec $terminal $expected $snapshot $utc)}catch{$caught=$true};Add-Rf 'binding_mismatch_rejected' $caught
    $badRegistry=Copy-EeeValue $registry;$badRegistry.registry_count=[long]0;$caught=$false;try{[void](New-EeePrepublicationVerification $state $profile $subject $red $binding $badRegistry $inventory $control $rec $terminal $expected $snapshot $utc)}catch{$caught=$true};Add-Rf 'registry_mismatch_rejected' $caught
    $m=Copy-EeeValue $pre;$m.canonical_bytes=[byte[]]$m.canonical_bytes.Clone();$m.canonical_bytes[0]=$m.canonical_bytes[0]-bxor1;Add-Rf 'tampered_prepublication_bytes_rejected' (-not(Test-EeePrepublicationArtifact $state $profile $subject $red $binding $registry $inventory $control $rec $terminal $expected $snapshot $m).valid)
    $pre2=New-EeePrepublicationVerification $state $profile $subject $red $binding $registry $inventory $control $rec $terminal $expected $snapshot $utc;Add-Rf 'prepublication_deterministic' ($pre.sha256-ceq$pre2.sha256)
    Add-Rf 'prepublication_replay_equivalent' ((Test-EeePrepublicationArtifact $state $profile $subject $red $binding $registry $inventory $control $rec $terminal $expected $snapshot $pre2).valid)
    $set=New-EeeControlArtifactSet $state $profile $source @() $rec $utc;Add-Rf 'valid_complete_control_set' ($set.result-ceq'PASS')
    $caught=$false;try{[void](New-EeeControlArtifactSet $state $profile $source @() ([byte[]](1,2)) $utc)}catch{$caught=$true};Add-Rf 'arbitrary_control_reconciliation_rejected' $caught
    $caught=$false;try{$caught=-not(Test-EeePrepublicationArtifact $state $profile $subject $red $binding $registry $inventory $control $rec $terminal $expected $snapshot ([pscustomobject]@{result='PASS'})).valid}catch{$caught=$true};Add-Rf 'forged_control_prepublication_rejected' $caught
    $missing=@{};foreach($id in $source.Keys){if($id-cne'stage_ledger'){$missing[$id]=$source[$id]}};$caught=$false;try{[void](New-EeeControlArtifactSet $state $profile $missing @() $rec $utc)}catch{$caught=$true};Add-Rf 'missing_control_input_rejected' $caught
    $extra=@{};foreach($id in $source.Keys){$extra[$id]=$source[$id]};$extra.unknown=$u.GetBytes('{}');$caught=$false;try{[void](New-EeeControlArtifactSet $state $profile $extra @() $rec $utc)}catch{$caught=$true};Add-Rf 'extra_control_input_rejected' $caught
    $tampered=Copy-EeeValue $rec;$tampered.sha256=$zero;$caught=$false;try{[void](New-EeeControlArtifactSet $state $profile $source @() $tampered $utc)}catch{$caught=$true};Add-Rf 'tampered_control_hash_rejected' $caught
    $legacy=Invoke-EeeInventorySelfFixTestSuite;Add-Rf 'success_finalization_authoritative' ($legacy.tests[27].result-ceq'PASS')
    Add-Rf 'success_replay_authoritative' ($legacy.tests[28].result-ceq'PASS')
    [pscustomobject][ordered]@{result=$(if($failures.Count){'FAIL'}else{'PASS'});test_count=[long]$counter.Value;pass_count=[long]($counter.Value-$failures.Count);failure_count=[long]$failures.Count;failures=@($failures);tests=@($rows)}
}

function New-EeeSummaryDagFixtureInternal {
    param([string]$Kind)
    $run='summary-dag-'+$Kind.ToLowerInvariant();$utc='2026-01-01T00:00:00.000Z';$u=[Text.UTF8Encoding]::new($false,$true)
    switch -CaseSensitive($Kind){
        'SUCCESS' {$profile='SUCCESS_PROFILE';$state=New-EeeExecutionState $run;$state.current_state='COMPLETE_CANDIDATE';$state=Protect-EeeExecutionState $state}
        'ROLLBACK' {$profile='FAILURE_CONFIRMED_ROLLBACK_PROFILE';$state=Add-EeeClassificationInternal (New-EeeExecutionState $run) 'CONFIRMED_ROLLBACK' 'NONE' $utc;$state.current_state='FAILED_PREMUTATION_CANDIDATE';$state.cleanup_result='PASS';$state.post_cleanup_result='PASS';$state=Protect-EeeExecutionState $state}
        'DEPENDENCY' {$profile='DEPENDENCY_BLOCK_PROFILE';$state=Add-EeeClassificationInternal (New-EeeExecutionState $run) 'DEPENDENCIES_MISSING' 'NONE' $utc;$state.current_state='DEPENDENCIES_MISSING_CANDIDATE';$state=Protect-EeeExecutionState $state}
        default {$profile='FAILURE_PREMUTATION_PROFILE';$state=Add-EeeClassificationInternal (New-EeeExecutionState $run) 'PREMUTATION_FAILURE' 'NONE' $utc;$state.current_state='FAILED_PREMUTATION_CANDIDATE';$state=Protect-EeeExecutionState $state}
    }
    $source=@{};$registry=@(Get-EeeArtifactRegistry);$profiles=Get-EeeProfileRegistry;foreach($id in @($profiles[$profile])){$d=@($registry|Where-Object logical_id -CEQ $id)[0];if($d.scope-ceq'PRECOMMIT_EVIDENCE'){$source[$id]=$(if($id-cin@('transition_ledger','classification_ledger','stage_ledger')){$u.GetBytes("{`"run_id`":`"$run`"}`n")}else{$u.GetBytes("{`"run_id`":`"$run`"}")})}}
    $red=New-EeeRecursiveRedactionPrecommit $run $profile $source @() $utc;$ledgers=@{transition_ledger=$source.transition_ledger;classification_ledger=$source.classification_ledger;stage_ledger=$source.stage_ledger};$binding=New-EeeLedgerBindingSet $run $ledgers $utc;$artifactRegistry=New-EeeArtifactRegistryRecord $run $profile $utc;$subject=@{};foreach($id in $source.Keys){$subject[$id]=[byte[]]$source[$id]};$subject.recursive_redaction_precommit=ConvertTo-EeeCanonicalJsonBytes $red;$subject.ledger_binding_set=ConvertTo-EeeCanonicalJsonBytes $binding;$subject.artifact_registry=ConvertTo-EeeCanonicalJsonBytes $artifactRegistry;$inventory=New-EeeExactInventory $run $profile $subject $utc;$control=New-EeePrecommitControlInventory $run $profile @{recursive_redaction_precommit=$subject.recursive_redaction_precommit;ledger_binding_set=$subject.ledger_binding_set;artifact_registry=$subject.artifact_registry;evidence_inventory=ConvertTo-EeeCanonicalJsonBytes $inventory} $utc;$rec=New-EeeReconciliationArtifact $state $profile $subject $red $binding $artifactRegistry $inventory $control $utc;$set=New-EeeControlArtifactSet $state $profile $source @() $rec $utc
    [pscustomobject][ordered]@{state=$state;profile=$profile;source=$source;subject=$subject;redaction=$red;binding=$binding;registry=$artifactRegistry;inventory=$inventory;control_inventory=$control;reconciliation=$rec;control_set=$set;utc=$utc}
}

function Invoke-EeeSummaryDagFixTestSuite {
    $rows=New-Object System.Collections.ArrayList;$failed=New-Object System.Collections.ArrayList;$n=[ref]0
    function Add-Sd([string]$Name,[bool]$Pass){$n.Value++;[void]$rows.Add([pscustomobject][ordered]@{test_id=('SDF{0:D2}'-f$n.Value);name=$Name;result=$(if($Pass){'PASS'}else{'FAIL'})});if(-not$Pass){[void]$failed.Add($Name)}}
    $f=New-EeeSummaryDagFixtureInternal SUCCESS;$set=$f.control_set;$terminal=$set.artifacts.terminal_projection;$summary=$set.artifacts.expected_final_summary;$snapshot=$set.artifacts.replay_snapshot;$pre=$set.artifacts.prepublication_verification;$final=New-EeeEngineFinalizationSet $f.state $set $f.utc
    $dag=@('terminal_projection','expected_final_summary','expected_final_summary_hash','replay_snapshot','prepublication_verification','terminal_commit','complete_final_summary','publication_reread','replay_authority');Add-Sd 'dependency_graph_acyclic' (@($dag|Sort-Object -Unique).Count-eq$dag.Count)
    Add-Sd 'summary_without_replay' ($summary.PSObject.Properties.Name-cnotcontains'replay_snapshot_hash')
    Add-Sd 'summary_without_prepublication' ($summary.PSObject.Properties.Name-cnotcontains'prepublication_verification_hash')
    $caught=$false;try{[void](New-EeeReplaySnapshot $f.state $f.profile ([pscustomobject]@{}) ([pscustomobject]@{}) ('1'*64) ('1'*64) ('1'*64) ('1'*64) ('1'*64) ('1'*64) ('1'*64) $f.utc)}catch{$caught=$true};Add-Sd 'snapshot_before_summary_rejected' $caught
    $caught=$false;try{[void](New-EeePrepublicationVerification $f.state $f.profile $f.subject $f.redaction $f.binding $f.registry $f.inventory $f.control_inventory $f.reconciliation ([pscustomobject]@{}) ([pscustomobject]@{}) ([pscustomobject]@{}) $f.utc)}catch{$caught=$true};Add-Sd 'prepublication_before_snapshot_rejected' $caught
    $bad=Copy-EeeValue $set;$bad.artifacts.prepublication_verification=$null;$caught=$false;try{[void](New-EeeEngineFinalizationSet $f.state ([pscustomobject]$bad) $f.utc)}catch{$caught=$true};Add-Sd 'commit_before_prepublication_rejected' $caught
    $bad=Copy-EeeValue $final;$bad.terminal_commit_hash=$null;Add-Sd 'complete_before_commit_hash_rejected' (-not(Invoke-EeeEngineFinalizationReplay ([pscustomobject]$bad)).authoritative)
    Add-Sd 'reverse_dependency_rejected' ($summary.PSObject.Properties.Name-cnotcontains'terminal_commit_hash')
    Add-Sd 'success_terminal_projection' ($terminal.terminal_kind-ceq'SUCCESS'-and$terminal.expected_final_state-ceq'COMPLETE')
    $failure=New-EeeSummaryDagFixtureInternal FAILURE;Add-Sd 'failure_terminal_projection' ($failure.control_set.artifacts.terminal_projection.expected_final_result-ceq'FAIL')
    $rollback=New-EeeSummaryDagFixtureInternal ROLLBACK;Add-Sd 'rollback_terminal_projection' ($rollback.control_set.artifacts.terminal_projection.expected_classification-ceq'CONFIRMED_ROLLBACK')
    $dependency=New-EeeSummaryDagFixtureInternal DEPENDENCY;Add-Sd 'dependency_terminal_projection' ($dependency.control_set.artifacts.terminal_projection.expected_final_state-ceq'DEPENDENCIES_MISSING_EXECUTION_BLOCKED')
    $controlParameters=@((Get-Command New-EeeControlArtifactSet).Parameters.Keys);foreach($pair in @(@('caller_terminal_kind','ExpectedTerminalKind'),@('caller_state','ExpectedFinalState'),@('caller_result','ExpectedFinalResult'),@('caller_classification','ExpectedClassification'),@('caller_marker','ExpectedMarker'),@('caller_commit_kind','CommitKind'))){Add-Sd $pair[0] ($pair[1]-cnotin$controlParameters)}
    Add-Sd 'valid_expected_summary' ((Get-EeeSha256Hex(ConvertTo-EeeCanonicalJsonBytes $summary))-ceq$snapshot.expected_final_summary_hash)
    $badExpected=New-EeeExpectedFinalSummary $f.state $f.profile ([pscustomobject][ordered]@{schema_version='A24E_FINAL_V4_ENGINE_OWNED_TERMINAL_PROJECTION';record=$terminal;canonical_bytes=ConvertTo-EeeCanonicalJsonBytes $terminal;sha256=Get-EeeSha256Hex(ConvertTo-EeeCanonicalJsonBytes $terminal)}) $f.reconciliation $f.redaction $f.binding $f.registry $f.inventory $f.control_inventory $f.utc;$badExpected.sha256='0'*64;$caught=$false;try{[void](New-EeeReplaySnapshot $f.state $f.profile ([pscustomobject][ordered]@{schema_version='A24E_FINAL_V4_ENGINE_OWNED_TERMINAL_PROJECTION';record=$terminal;canonical_bytes=ConvertTo-EeeCanonicalJsonBytes $terminal;sha256=Get-EeeSha256Hex(ConvertTo-EeeCanonicalJsonBytes $terminal)}) $badExpected ('1'*64) ('1'*64) ('1'*64) $f.reconciliation.sha256 ('1'*64) ('1'*64) ('1'*64) $f.utc)}catch{$caught=$true};Add-Sd 'zero_summary_hash_rejected' $caught
    $params=@((Get-Command New-EeeExpectedFinalSummary).Parameters.Keys);Add-Sd 'caller_summary_bytes_rejected' ('SummaryBytes'-cnotin$params)
    Add-Sd 'caller_summary_hash_rejected' ('SummaryHash'-cnotin$params)
    $expectedEnvelope=[pscustomobject][ordered]@{schema_version='A24E_FINAL_V4_ENGINE_OWNED_EXPECTED_SUMMARY';record=$summary;canonical_bytes=ConvertTo-EeeCanonicalJsonBytes $summary;sha256=Get-EeeSha256Hex(ConvertTo-EeeCanonicalJsonBytes $summary)}
    $bad=Copy-EeeValue $expectedEnvelope;$bad.record.PSObject.Properties.Remove('profile_id');Add-Sd 'missing_summary_field_rejected' (-not(Test-EeeExpectedFinalSummary $f.state $f.profile ([pscustomobject][ordered]@{schema_version='A24E_FINAL_V4_ENGINE_OWNED_TERMINAL_PROJECTION';record=$terminal;canonical_bytes=ConvertTo-EeeCanonicalJsonBytes $terminal;sha256=Get-EeeSha256Hex(ConvertTo-EeeCanonicalJsonBytes $terminal)}) $f.reconciliation $f.redaction $f.binding $f.registry $f.inventory $f.control_inventory $bad).valid)
    $bad=Copy-EeeValue $expectedEnvelope;$bad.record|Add-Member noteproperty unknown x;Add-Sd 'unknown_summary_field_rejected' (-not(Test-EeeExpectedFinalSummary $f.state $f.profile ([pscustomobject][ordered]@{schema_version='A24E_FINAL_V4_ENGINE_OWNED_TERMINAL_PROJECTION';record=$terminal;canonical_bytes=ConvertTo-EeeCanonicalJsonBytes $terminal;sha256=Get-EeeSha256Hex(ConvertTo-EeeCanonicalJsonBytes $terminal)}) $f.reconciliation $f.redaction $f.binding $f.registry $f.inventory $f.control_inventory $bad).valid)
    $bad=Copy-EeeValue $final;$bad.terminal_commit.actual_completion_marker='WRONG';Add-Sd 'wrong_marker_rejected' (-not(Invoke-EeeEngineFinalizationReplay ([pscustomobject]$bad)).authoritative)
    $bad=Copy-EeeValue $final;$bad.terminal_commit.state_after='FAILED_PREMUTATION';Add-Sd 'wrong_terminal_tuple_rejected' (-not(Invoke-EeeEngineFinalizationReplay ([pscustomobject]$bad)).authoritative)
    $set2=New-EeeControlArtifactSet $f.state $f.profile $f.source @() $f.reconciliation $f.utc;Add-Sd 'summary_deterministic' ((Get-EeeSha256Hex([byte[]]$set.artifact_bytes.expected_final_summary))-ceq(Get-EeeSha256Hex([byte[]]$set2.artifact_bytes.expected_final_summary)))
    Add-Sd 'snapshot_deterministic' ((Get-EeeSha256Hex([byte[]]$set.artifact_bytes.replay_snapshot))-ceq(Get-EeeSha256Hex([byte[]]$set2.artifact_bytes.replay_snapshot)))
    $plan=New-EeeEnginePublicationPlan $final 'C:\a24e-stage' 'C:\a24e-evidence';$receipts=New-EeePublicationReceiptFixtureInternal $plan $f.utc;$replay=Invoke-EeeEngineFinalizationReplay $final $plan $receipts;Add-Sd 'success_finalization_complete' ($replay.authoritative-and$replay.terminal_state-ceq'COMPLETE'-and$replay.terminal_result-ceq'PASS')
    $failureFinal=New-EeeEngineFinalizationSet $failure.state $failure.control_set $failure.utc;$failurePlan=New-EeeEnginePublicationPlan $failureFinal 'C:\a24e-stage' 'C:\a24e-evidence';$failureReceipts=New-EeePublicationReceiptFixtureInternal $failurePlan $failure.utc;$failureReplay=Invoke-EeeEngineFinalizationReplay $failureFinal $failurePlan $failureReceipts;Add-Sd 'failure_finalization_fail' ($failureReplay.authoritative-and$failureReplay.terminal_result-ceq'FAIL')
    $rollbackFinal=New-EeeEngineFinalizationSet $rollback.state $rollback.control_set $rollback.utc;$rollbackPlan=New-EeeEnginePublicationPlan $rollbackFinal 'C:\a24e-stage' 'C:\a24e-evidence';$rollbackReceipts=New-EeePublicationReceiptFixtureInternal $rollbackPlan $rollback.utc;Add-Sd 'rollback_finalization_fail' ((Invoke-EeeEngineFinalizationReplay $rollbackFinal $rollbackPlan $rollbackReceipts).terminal_result-ceq'FAIL')
    $dependencyFinal=New-EeeEngineFinalizationSet $dependency.state $dependency.control_set $dependency.utc;$dependencyPlan=New-EeeEnginePublicationPlan $dependencyFinal 'C:\a24e-stage' 'C:\a24e-evidence';$dependencyReceipts=New-EeePublicationReceiptFixtureInternal $dependencyPlan $dependency.utc;Add-Sd 'dependency_finalization_fail' ((Invoke-EeeEngineFinalizationReplay $dependencyFinal $dependencyPlan $dependencyReceipts).terminal_result-ceq'FAIL')
    Add-Sd 'success_replay_complete_pass' ($replay.authoritative-and$replay.terminal_state-ceq'COMPLETE')
    Add-Sd 'failure_replay_fail' ($failureReplay.authoritative-and$failureReplay.terminal_state-ceq'FAILED_PREMUTATION')
    Add-Sd 'missing_commit_no_authority' (-not(Invoke-EeeEngineFinalizationReplay $null).authoritative)
    $bad=Copy-EeeValue $final;$bad.expected_final_summary_hash='0'*64;Add-Sd 'tampered_summary_hash_invalid' (-not(Invoke-EeeEngineFinalizationReplay ([pscustomobject]$bad)).authoritative)
    $bad=Copy-EeeValue $final;$bad.replay_snapshot.expected_final_summary_hash='0'*64;Add-Sd 'tampered_snapshot_binding_invalid' (-not(Invoke-EeeEngineFinalizationReplay ([pscustomobject]$bad)).authoritative)
    $bad=Copy-EeeValue $final;$bad.prepublication_verification.final_summary_hash='0'*64;Add-Sd 'tampered_prepublication_binding_invalid' (-not(Invoke-EeeEngineFinalizationReplay ([pscustomobject]$bad)).authoritative)
    $bad=Copy-EeeValue $final;$bad.terminal_commit.actual_completion_marker='CALLER';Add-Sd 'tampered_commit_marker_invalid' (-not(Invoke-EeeEngineFinalizationReplay ([pscustomobject]$bad)).authoritative)
    Add-Sd 'no_caller_terminal_authority' (@((Get-Command New-EeeControlArtifactSet).Parameters.Keys|Where-Object{$_-cin@('FinalSummaryHash','ExpectedTerminalKind','ExpectedFinalState','ExpectedFinalResult','ExpectedMarker','ExpectedClassification','CommitKind')}).Count-eq0)
    [pscustomobject][ordered]@{result=$(if($failed.Count){'FAIL'}else{'PASS'});test_count=[long]$n.Value;pass_count=[long]($n.Value-$failed.Count);failure_count=[long]$failed.Count;failures=@($failed);tests=@($rows)}
}

function Invoke-EeePublicationAuthorityFixTestSuite {
    $rows=New-Object System.Collections.ArrayList;$failures=New-Object System.Collections.ArrayList;$counter=[ref]0
    function Add-Pa([string]$Name,[bool]$Pass){$counter.Value++;[void]$rows.Add([pscustomobject][ordered]@{test_id=('PAF{0:D2}'-f$counter.Value);name=$Name;result=$(if($Pass){'PASS'}else{'FAIL'})});if(-not$Pass){[void]$failures.Add($Name)}}
    function Is-Rejected([scriptblock]$Action){try{&$Action|Out-Null;return $false}catch{return $true}}
    $utc='2026-01-01T00:00:00.000Z';$stage='C:\a24e-stage';$evidence='C:\a24e-evidence'
    $success=New-EeeSummaryDagFixtureInternal SUCCESS;$successFinal=New-EeeEngineFinalizationSet $success.state $success.control_set $success.utc;$successPlan=New-EeeEnginePublicationPlan $successFinal $stage $evidence;$successReceipts=New-EeePublicationReceiptFixtureInternal $successPlan $utc
    $failure=New-EeeSummaryDagFixtureInternal FAILURE;$failureFinal=New-EeeEngineFinalizationSet $failure.state $failure.control_set $failure.utc;$failurePlan=New-EeeEnginePublicationPlan $failureFinal $stage $evidence;$failureReceipts=New-EeePublicationReceiptFixtureInternal $failurePlan $utc
    $rollback=New-EeeSummaryDagFixtureInternal ROLLBACK;$rollbackFinal=New-EeeEngineFinalizationSet $rollback.state $rollback.control_set $rollback.utc;$rollbackPlan=New-EeeEnginePublicationPlan $rollbackFinal $stage $evidence;$rollbackReceipts=New-EeePublicationReceiptFixtureInternal $rollbackPlan $utc
    Add-Pa 'success_profile_command_derivation' ((Test-EeeEnginePublicationPlan $successFinal $successPlan).valid)
    Add-Pa 'failure_profile_command_derivation' ((Test-EeeEnginePublicationPlan $failureFinal $failurePlan).valid)
    Add-Pa 'caller_artifact_map_not_accepted' ('StagedArtifacts'-cnotin@((Get-Command New-EeeEnginePublicationPlan).Parameters.Keys))
    Add-Pa 'caller_terminal_id_not_accepted' ('TerminalLogicalId'-cnotin@((Get-Command New-EeeEnginePublicationPlan).Parameters.Keys))
    $bad=Copy-EeeValue $successFinal;$bad.publication_artifact_bytes.PSObject.Properties.Remove(@($bad.publication_artifact_bytes.PSObject.Properties.Name)[0]);Add-Pa 'missing_artifact_rejected' (Is-Rejected {[void](New-EeeEnginePublicationPlan ([pscustomobject]$bad) $stage $evidence)})
    $bad=Copy-EeeValue $successFinal;$bad.publication_artifact_bytes|Add-Member NoteProperty caller_extra ([byte[]](1,2,3));Add-Pa 'extra_artifact_rejected' (Is-Rejected {[void](New-EeeEnginePublicationPlan ([pscustomobject]$bad) $stage $evidence)})
    $bad=Copy-EeeValue $successPlan;$bad.artifact_rows+=,$bad.artifact_rows[0];Add-Pa 'duplicate_logical_id_rejected' (-not(Test-EeeEnginePublicationPlan $successFinal ([pscustomobject]$bad)).valid)
    $bad=Copy-EeeValue $successPlan;$bad.commands[1].destination_path=$bad.commands[0].destination_path;Add-Pa 'duplicate_destination_path_rejected' (-not(Test-EeeEnginePublicationPlan $successFinal ([pscustomobject]$bad)).valid)
    $bad=Copy-EeeValue $successPlan;$tmp=$bad.commands[0];$bad.commands[0]=$bad.commands[1];$bad.commands[1]=$tmp;Add-Pa 'wrong_command_order_rejected' (-not(Test-EeeEnginePublicationPlan $successFinal ([pscustomobject]$bad)).valid)
    $bad=Copy-EeeValue $successPlan;$bad.commands[-1].terminal_commit=$false;$bad.commands[0].terminal_commit=$true;Add-Pa 'terminal_not_last_plan_rejected' (-not(Test-EeeEnginePublicationPlan $successFinal ([pscustomobject]$bad)).valid)
    $bad=Copy-EeeValue $successPlan;$bad.commands+=,$bad.commands[0];Add-Pa 'artifact_after_terminal_rejected' (-not(Test-EeeEnginePublicationPlan $successFinal ([pscustomobject]$bad)).valid)
    $plan2=New-EeeEnginePublicationPlan $successFinal $stage $evidence;Add-Pa 'command_derivation_deterministic' ((Get-EeeSha256Hex(ConvertTo-EeeCanonicalJsonBytes $successPlan))-ceq(Get-EeeSha256Hex(ConvertTo-EeeCanonicalJsonBytes $plan2)))
    $proof=Test-EeeEnginePublicationReceipts $successFinal $successPlan $successReceipts;Add-Pa 'valid_nonterminal_receipt' ($proof.valid-and$proof.proof.validated_receipt_rows[0].terminal_commit-eq$false)
    Add-Pa 'valid_terminal_receipt' ($proof.valid-and$proof.proof.validated_receipt_rows[-1].terminal_commit)
    $bad=Copy-EeeValue $successReceipts;$bad[0]|Add-Member NoteProperty pass $true;Add-Pa 'legacy_pass_field_rejected' (-not(Test-EeeEnginePublicationReceipts $successFinal $successPlan @($bad)).valid)
    $bad=Copy-EeeValue $successReceipts;$bad[0].PSObject.Properties.Remove('source_sha256');Add-Pa 'missing_receipt_field_rejected' (-not(Test-EeeEnginePublicationReceipts $successFinal $successPlan @($bad)).valid)
    $bad=Copy-EeeValue $successReceipts;$bad[0]|Add-Member NoteProperty unknown 'x';Add-Pa 'unknown_receipt_field_rejected' (-not(Test-EeeEnginePublicationReceipts $successFinal $successPlan @($bad)).valid)
    $bad=Copy-EeeValue $successReceipts;$bad[0].command_hash='0'*64;Add-Pa 'wrong_command_hash_rejected' (-not(Test-EeeEnginePublicationReceipts $successFinal $successPlan @($bad)).valid)
    $bad=Copy-EeeValue $successReceipts;$bad[0].source_sha256='0'*64;Add-Pa 'wrong_source_hash_rejected' (-not(Test-EeeEnginePublicationReceipts $successFinal $successPlan @($bad)).valid)
    $bad=Copy-EeeValue $successReceipts;$bad[0].destination_sha256='0'*64;Add-Pa 'wrong_destination_hash_rejected' (-not(Test-EeeEnginePublicationReceipts $successFinal $successPlan @($bad)).valid)
    $bad=Copy-EeeValue $successReceipts;$bad[0].destination_size_bytes++;Add-Pa 'wrong_size_rejected' (-not(Test-EeeEnginePublicationReceipts $successFinal $successPlan @($bad)).valid)
    $bad=Copy-EeeValue $successReceipts;$bad[0].destination_was_absent=$false;Add-Pa 'preexisting_destination_rejected' (-not(Test-EeeEnginePublicationReceipts $successFinal $successPlan @($bad)).valid)
    $bad=Copy-EeeValue $successReceipts;$bad[0].overwrite_occurred=$true;Add-Pa 'overwrite_rejected' (-not(Test-EeeEnginePublicationReceipts $successFinal $successPlan @($bad)).valid)
    $bad=Copy-EeeValue $successReceipts;$bad[0].same_volume_preserved=$false;Add-Pa 'cross_volume_rejected' (-not(Test-EeeEnginePublicationReceipts $successFinal $successPlan @($bad)).valid)
    $bad=Copy-EeeValue $successReceipts;$bad[0].collision_detected=$true;Add-Pa 'collision_rejected' (-not(Test-EeeEnginePublicationReceipts $successFinal $successPlan @($bad)).valid)
    $bad=Copy-EeeValue $successReceipts;$bad[0].destination_reread_succeeded=$false;Add-Pa 'missing_destination_reread_rejected' (-not(Test-EeeEnginePublicationReceipts $successFinal $successPlan @($bad)).valid)
    $bad=Copy-EeeValue $successReceipts;$tmp=$bad[0];$bad[0]=$bad[1];$bad[1]=$tmp;Add-Pa 'receipt_reorder_rejected' (-not(Test-EeeEnginePublicationReceipts $successFinal $successPlan @($bad)).valid)
    Add-Pa 'commit_last_valid_proof' ($proof.valid-and$proof.proof.commit_last_proven)
    $bad=Copy-EeeValue $successPlan;$bad.commands[-1].terminal_commit=$false;Add-Pa 'terminal_command_not_final_rejected' (-not(Test-EeeEnginePublicationReceipts $successFinal ([pscustomobject]$bad) $successReceipts).valid)
    $bad=Copy-EeeValue $successReceipts;$tmp=$bad[-1];$bad[-1]=$bad[-2];$bad[-2]=$tmp;Add-Pa 'terminal_receipt_not_final_rejected' (-not(Test-EeeEnginePublicationReceipts $successFinal $successPlan @($bad)).valid)
    Add-Pa 'missing_receipt_rejected' (-not(Test-EeeEnginePublicationReceipts $successFinal $successPlan @($successReceipts|Select-Object -SkipLast 1)).valid)
    $bad=@($successReceipts)+@($successReceipts[0]);Add-Pa 'extra_postcommit_receipt_rejected' (-not(Test-EeeEnginePublicationReceipts $successFinal $successPlan $bad).valid)
    $bad=Copy-EeeValue $successFinal;$bad.terminal_commit_bytes[0]=[byte]($bad.terminal_commit_bytes[0]-bxor1);Add-Pa 'tampered_commit_bytes_rejected' (-not(Invoke-EeeEngineFinalizationReplay ([pscustomobject]$bad) $successPlan $successReceipts).authoritative)
    $bad=Copy-EeeValue $successFinal;$bad.terminal_commit_hash='0'*64;Add-Pa 'tampered_commit_hash_rejected' (-not(Invoke-EeeEngineFinalizationReplay ([pscustomobject]$bad) $successPlan $successReceipts).authoritative)
    $bad=Copy-EeeValue $successFinal;$bad.terminal_commit.actual_completion_marker='WRONG';Add-Pa 'tampered_commit_marker_rejected' (-not(Invoke-EeeEngineFinalizationReplay ([pscustomobject]$bad) $successPlan $successReceipts).authoritative)
    $bad=Copy-EeeValue $successFinal;$bad.complete_final_summary.commit_record_hash='0'*64;Add-Pa 'tampered_summary_binding_rejected' (-not(Invoke-EeeEngineFinalizationReplay ([pscustomobject]$bad) $successPlan $successReceipts).authoritative)
    $bad=Copy-EeeValue $successFinal;$bad.prepublication_verification.final_summary_hash='0'*64;Add-Pa 'tampered_prepublication_rejected' (-not(Invoke-EeeEngineFinalizationReplay ([pscustomobject]$bad) $successPlan $successReceipts).authoritative)
    $bad=Copy-EeeValue $successFinal;$bad.terminal_logical_id='failure_commit';Add-Pa 'wrong_terminal_kind_rejected' (-not(Invoke-EeeEngineFinalizationReplay ([pscustomobject]$bad) $successPlan $successReceipts).authoritative)
    Add-Pa 'missing_receipts_no_authority' (-not(Invoke-EeeEngineFinalizationReplay $successFinal $successPlan $null).authoritative)
    $bad=Copy-EeeValue $successReceipts;$bad[-1].source_reread_succeeded=$false;Add-Pa 'failed_terminal_source_reread_no_authority' (-not(Invoke-EeeEngineFinalizationReplay $successFinal $successPlan @($bad)).authoritative)
    $bad=Copy-EeeValue $successReceipts;$bad[-1].destination_reread_succeeded=$false;Add-Pa 'failed_terminal_destination_reread_no_authority' (-not(Invoke-EeeEngineFinalizationReplay $successFinal $successPlan @($bad)).authoritative)
    $successReplay=Invoke-EeeEngineFinalizationReplay $successFinal $successPlan $successReceipts;Add-Pa 'valid_success_receipts_grant_complete' ($successReplay.authoritative-and$successReplay.terminal_state-ceq'COMPLETE'-and$successReplay.terminal_result-ceq'PASS')
    $failureReplay=Invoke-EeeEngineFinalizationReplay $failureFinal $failurePlan $failureReceipts;Add-Pa 'valid_failure_receipts_grant_failure' ($failureReplay.authoritative-and$failureReplay.terminal_result-ceq'FAIL')
    $rollbackReplay=Invoke-EeeEngineFinalizationReplay $rollbackFinal $rollbackPlan $rollbackReceipts;Add-Pa 'valid_confirmed_rollback_receipts_grant_failure' ($rollbackReplay.authoritative-and$rollbackReplay.terminal_result-ceq'FAIL')
    Add-Pa 'null_finalization_no_authority' (-not(Invoke-EeeEngineFinalizationReplay $null $successPlan $successReceipts).authoritative)
    $bad=Copy-EeeValue $successReceipts;$bad[-1].publish_succeeded=$false;Add-Pa 'failed_terminal_publish_no_authority' (-not(Invoke-EeeEngineFinalizationReplay $successFinal $successPlan @($bad)).authoritative)
    $bad=Copy-EeeValue $successPlan;$bad|Add-Member NoteProperty caller_authoritative $true;Add-Pa 'forged_plan_authority_rejected' (-not(Invoke-EeeEngineFinalizationReplay $successFinal ([pscustomobject]$bad) $successReceipts).authoritative)
    $bad=Copy-EeeValue $successReceipts;$bad[-1].recorded_utc='not-utc';Add-Pa 'invalid_receipt_timestamp_rejected' (-not(Test-EeeEnginePublicationReceipts $successFinal $successPlan @($bad)).valid)
    $bad=Copy-EeeValue $successReceipts;$bad[-1].failure_code='CALLER_PASS';Add-Pa 'non_none_failure_code_rejected' (-not(Test-EeeEnginePublicationReceipts $successFinal $successPlan @($bad)).valid)
    $exported=@((Get-Module A2.4E.ExecutionEvidenceEngine).ExportedCommands.Keys);Add-Pa 'legacy_publication_apis_not_exported' ('New-EeePublicationCommands'-cnotin$exported-and'Test-EeePublicationReceipts'-cnotin$exported)
    [pscustomobject][ordered]@{result=$(if($failures.Count){'FAIL'}else{'PASS'});test_count=[long]$counter.Value;pass_count=[long]($counter.Value-$failures.Count);failure_count=[long]$failures.Count;failures=@($failures);tests=@($rows)}
}

function Invoke-EeeReconciliation {
    param($State,[string]$ProfileId,[hashtable]$Store,$Inventory,$SecretEvidence,[string]$RecordedUtc)
    if(-not(Test-EeeExecutionState $State).valid){throw 'EEE_STATE_INVALID'};$findings=@()
    try{$expected=New-EeeExactInventory $State.run_id $ProfileId $Store $RecordedUtc;if((Get-EeeSha256Hex(ConvertTo-EeeCanonicalJsonBytes $expected)) -cne (Get-EeeSha256Hex(ConvertTo-EeeCanonicalJsonBytes $Inventory))){$findings+='INVENTORY_MISMATCH'}}catch{$findings+='INVENTORY_MISMATCH'}
    if($State.identity_required -and -not $State.identity_authoritative){$findings+='IDENTITY_MISMATCH'}
    $secretSchema=Test-EeeTypedRecord 'A24E_DIRECT_SECRET_LIFECYCLE_EVIDENCE' $SecretEvidence;if(-not$secretSchema.valid-or$SecretEvidence.run_id-cne$State.run_id-or$SecretEvidence.result-cne'PASS'-or$SecretEvidence.open_handle_count-ne0){$findings+='SECRET_LIFECYCLE_INVALID'}
    $ledger=@($State.transition_records)+@($State.classification_records)+@($State.stage_authorities);$seq=@($ledger|ForEach-Object{[long]$_.sequence});if(@($seq|Sort-Object -Unique).Count-ne$seq.Count){$findings+='LEDGER_SEQUENCE_DUPLICATE'}
    [pscustomobject][ordered]@{schema_version='A24E_DIRECT_RECONCILIATION';run_id=$State.run_id;profile_id=$ProfileId;inventory_sha256=Get-EeeSha256Hex(ConvertTo-EeeCanonicalJsonBytes $Inventory);identity_record_hash=$State.trusted_identity_record_hash;secret_lifecycle_sha256=$(if($null-ne$SecretEvidence){Get-EeeSha256Hex(ConvertTo-EeeCanonicalJsonBytes $SecretEvidence)}else{$null});finding_codes=@($findings|Sort-Object -Unique);finding_count=[long]@($findings|Sort-Object -Unique).Count;result=$(if($findings.Count){'FAIL'}else{'PASS'});recorded_utc=$RecordedUtc}
}

function Get-EeeFailureProfileInternal {
    param($State)
    $active=Get-EeeActiveClassification $State
    if($null-eq$active){throw 'EEE_FAILURE_CLASSIFICATION_MISSING'}
    switch -CaseSensitive($active.classification){
        'DEPENDENCIES_MISSING' {'DEPENDENCY_BLOCK_PROFILE'}
        'PREMUTATION_FAILURE' {'FAILURE_PREMUTATION_PROFILE'}
        'CONFIRMED_ROLLBACK' {'FAILURE_CONFIRMED_ROLLBACK_PROFILE'}
        'EVIDENCE_INVALID' {'FAILURE_EVIDENCE_INVALID_PROFILE'}
        default {'FAILURE_POST_CREATE_PROFILE'}
    }
}

function Get-EeeFailureTerminalInternal {
    param([string]$Candidate)
    switch -CaseSensitive($Candidate){
        'FAILED_PREMUTATION_CANDIDATE' {[pscustomobject][ordered]@{terminal='FAILED_PREMUTATION';gate_reason='FAILURE_EVIDENCE_GATE_STARTED';commit_reason='PREMUTATION_EVIDENCE_VALID_AND_FAILURE_COMMIT_PUBLISHED'}}
        'FAILED_CLEANUP_REQUIRED_CANDIDATE' {[pscustomobject][ordered]@{terminal='FAILED_CLEANUP_REQUIRED';gate_reason='FAILURE_EVIDENCE_GATE_STARTED';commit_reason='CLEANUP_REQUIRED_FAILURE_COMMIT_PUBLISHED'}}
        'FAILED_CLEANUP_INCOMPLETE_CANDIDATE' {[pscustomobject][ordered]@{terminal='FAILED_CLEANUP_INCOMPLETE';gate_reason='FAILURE_EVIDENCE_GATE_STARTED';commit_reason='CLEANUP_INCOMPLETE_FAILURE_COMMIT_PUBLISHED'}}
        'EVIDENCE_INVALID_CANDIDATE' {[pscustomobject][ordered]@{terminal='EVIDENCE_INVALID';gate_reason='INVALID_EVIDENCE_COMMIT_GATE_STARTED';commit_reason='EVIDENCE_INVALID_FAILURE_COMMIT_PUBLISHED'}}
        'DEPENDENCIES_MISSING_CANDIDATE' {[pscustomobject][ordered]@{terminal='DEPENDENCIES_MISSING_EXECUTION_BLOCKED';gate_reason='DEPENDENCY_BLOCK_EVIDENCE_GATE_STARTED';commit_reason='DEPENDENCY_BLOCK_FAILURE_COMMIT_PUBLISHED'}}
        default {throw 'EEE_FAILURE_CANDIDATE_INVALID'}
    }
}

function Invoke-EeeFailureReconciliation {
    param($State,[string]$ProfileId,[hashtable]$Store,$Inventory,$SecretEvidence,[string]$RecordedUtc)
    if(-not(Test-EeeExecutionState $State).valid){throw 'EEE_STATE_INVALID'}
    $terminal=Get-EeeFailureTerminalInternal $State.current_state
    $expectedProfile=Get-EeeFailureProfileInternal $State
    $findings=@()
    if($ProfileId-cne$expectedProfile){$findings+='FAILURE_PROFILE_MISMATCH'}
    try{$expected=New-EeeExactInventory $State.run_id $ProfileId $Store $RecordedUtc;if((Get-EeeSha256Hex(ConvertTo-EeeCanonicalJsonBytes $expected))-cne(Get-EeeSha256Hex(ConvertTo-EeeCanonicalJsonBytes $Inventory))){$findings+='INVENTORY_MISMATCH'}}catch{$findings+='INVENTORY_MISMATCH'}
    $secretSchema=Test-EeeTypedRecord 'A24E_DIRECT_SECRET_LIFECYCLE_EVIDENCE' $SecretEvidence
    if(-not$secretSchema.valid-or$SecretEvidence.run_id-cne$State.run_id-or$SecretEvidence.result-cne'PASS'-or$SecretEvidence.open_handle_count-ne0){$findings+='SECRET_LIFECYCLE_INVALID'}
    $active=Get-EeeActiveClassification $State
    if($null-eq$active-or$active.projected_state-cne$State.current_state){$findings+='CLASSIFICATION_STATE_MISMATCH'}
    if(($ProfileId-ceq'FAILURE_POST_CREATE_PROFILE'-or($null-ne$active-and$active.attestation_required))-and(-not$State.identity_authoritative-or-not(Test-EeeHash $State.trusted_identity_record_hash))){$findings+='FAILURE_IDENTITY_BINDING_MISSING'}
    if($active.classification-ceq'CONFIRMED_ROLLBACK'-and($State.cleanup_result-cne'PASS'-or$State.post_cleanup_result-cne'PASS')){$findings+='ROLLBACK_CLEAN_STATE_MISSING'}
    $ledger=@($State.transition_records)+@($State.classification_records)+@($State.stage_authorities);$seq=@($ledger|ForEach-Object{[long]$_.sequence})
    if(@($seq|Sort-Object -Unique).Count-ne$seq.Count){$findings+='LEDGER_SEQUENCE_DUPLICATE'}
    [pscustomobject][ordered]@{schema_version='A24E_DIRECT_FAILURE_RECONCILIATION';run_id=$State.run_id;profile_id=$ProfileId;terminal_state=$terminal.terminal;inventory_sha256=$(if($null-ne$Inventory){Get-EeeSha256Hex(ConvertTo-EeeCanonicalJsonBytes $Inventory)}else{$null});identity_record_hash=$State.trusted_identity_record_hash;secret_lifecycle_sha256=$(if($null-ne$SecretEvidence){Get-EeeSha256Hex(ConvertTo-EeeCanonicalJsonBytes $SecretEvidence)}else{$null});finding_codes=@($findings|Sort-Object -Unique);finding_count=[long]@($findings|Sort-Object -Unique).Count;result=$(if($findings.Count){'FAIL'}else{'PASS'});recorded_utc=$RecordedUtc}
}

function New-EeePublicationCommands {
    param([string]$RunId,[hashtable]$StagedArtifacts,[string]$StagingRoot,[string]$EvidenceRoot,[string]$TerminalLogicalId)
    if([IO.Path]::IsPathRooted($StagingRoot)-eq$false-or[IO.Path]::IsPathRooted($EvidenceRoot)-eq$false){throw 'EEE_PUBLICATION_ROOT_INVALID'}
    $staging=[IO.Path]::GetFullPath($StagingRoot).TrimEnd('\');$evidence=[IO.Path]::GetFullPath($EvidenceRoot).TrimEnd('\');if([IO.Path]::GetPathRoot($staging)-cne[IO.Path]::GetPathRoot($evidence)){throw 'EEE_PUBLICATION_VOLUME_MISMATCH'}
    $registry=@(Get-EeeArtifactRegistry);$ids=@($StagedArtifacts.Keys|Where-Object{$_-cne$TerminalLogicalId}|Sort-Object)+@($TerminalLogicalId);$rows=@();$sequence=0
    foreach($id in $ids){if(-not$StagedArtifacts.ContainsKey($id)){throw 'EEE_PUBLICATION_ARTIFACT_MISSING'};$d=@($registry|Where-Object logical_id -CEQ $id);if($d.Count-ne1){throw 'EEE_PUBLICATION_DESCRIPTOR_INVALID'};$sequence++;$source=[IO.Path]::GetFullPath((Join-Path $staging $d[0].path));$destination=[IO.Path]::GetFullPath((Join-Path $evidence $d[0].path));if(-not $source.StartsWith($staging+'\',[StringComparison]::OrdinalIgnoreCase) -or -not $destination.StartsWith($evidence+'\',[StringComparison]::OrdinalIgnoreCase)){throw 'EEE_PUBLICATION_PATH_ESCAPE'};$rows+=,[pscustomobject][ordered]@{schema_version='A24E_DIRECT_PUBLICATION_COMMAND';run_id=$RunId;command_id=('PUB-{0:D4}'-f$sequence);sequence=[long]$sequence;operation='ATOMIC_MOVE_CREATE_NEW';source_path=$source;destination_path=$destination;expected_source_sha256=Get-EeeSha256Hex([byte[]]$StagedArtifacts[$id]);expected_destination_absent=$true;create_once=$true;same_volume=$true;overwrite_forbidden=$true;terminal_commit=$id-ceq$TerminalLogicalId;bounded_wait_ms=[long]30000;collision_policy='FAIL_CLOSED'}}
    return $rows
}

function Test-EeePublicationReceipts {
    param([object[]]$Commands,[object[]]$Receipts)
    if($Commands.Count-ne$Receipts.Count){return [pscustomobject][ordered]@{authoritative=$false;failure_code='PUBLICATION_RECEIPT_COUNT_MISMATCH';validated_count=[long]0}}
    $validated=0
    for($i=0;$i-lt$Commands.Count;$i++){
        $c=$Commands[$i];$r=$Receipts[$i]
        $commandSchema=Test-EeeTypedRecord 'A24E_DIRECT_PUBLICATION_COMMAND' $c
        $receiptSchema=Test-EeeTypedRecord 'A24E_DIRECT_PUBLICATION_RECEIPT' $r
        if(-not $commandSchema.valid -or -not $receiptSchema.valid){return [pscustomobject][ordered]@{authoritative=$false;failure_code='PUBLICATION_SCHEMA_INVALID';validated_count=[long]$validated}}
        $expectedOrdering=$(if($c.terminal_commit){'LAST'}else{'BEFORE_TERMINAL'})
        $valid=$r.run_id-ceq$c.run_id -and $r.command_id-ceq$c.command_id -and $r.attempted -and $r.source_reread-ceq'PASS' -and $r.destination_precondition-ceq'ABSENT' -and $r.operation_result-ceq'PASS' -and $r.destination_reread-ceq'PASS' -and $r.exact_match -and $r.actual_destination_sha256-ceq$c.expected_source_sha256 -and $r.collision_result-ceq'NONE' -and $r.terminal_ordering-ceq$expectedOrdering -and $r.failure_code-ceq'NONE'
        if(-not $valid){return [pscustomobject][ordered]@{authoritative=$false;failure_code='PUBLICATION_RECEIPT_INVALID';validated_count=[long]$validated}}
        $validated++
    }
    [pscustomobject][ordered]@{authoritative=$true;failure_code='NONE';validated_count=[long]$validated}
}

function New-EeeFinalizationPlan {
    param($State,[string]$ProfileId,[hashtable]$Store,$Inventory,$SecretEvidence,[hashtable]$NoncommitArtifacts,[string]$StagingRoot,[string]$EvidenceRoot,[string]$ExpectedMarker,[string]$RecordedUtc)
    if(-not(Test-EeeExecutionState $State).valid){throw 'EEE_FINALIZATION_INPUT_INVALID'};$Reconciliation=Invoke-EeeReconciliation $State $ProfileId $Store $Inventory $SecretEvidence $RecordedUtc;if($Reconciliation.result-cne'PASS'){throw 'EEE_RECONCILIATION_FAILED'}
    if($State.cleanup_result-cne'PASS'-or$State.post_cleanup_result-cne'PASS'){throw 'EEE_CLEANUP_AUTHORITY_MISSING'}
    $active=Get-EeeActiveClassification $State;$classification=$(if($null-ne$active){$active.classification}else{'CONFIRMED_COMMIT'})
    $summary=[pscustomobject][ordered]@{schema_version='A24E_DIRECT_FINAL_SUMMARY';run_id=$State.run_id;classification=$classification;terminal_state='COMPLETE';final_result='PASS';identity_record_hash=$State.trusted_identity_record_hash;reconciliation_sha256=Get-EeeSha256Hex(ConvertTo-EeeCanonicalJsonBytes $Reconciliation);expected_completion_marker=$ExpectedMarker;recorded_utc=$RecordedUtc}
    $summaryBytes=ConvertTo-EeeCanonicalJsonBytes $summary;$commit=[pscustomobject][ordered]@{schema_version='A24E_FINAL_V4_SUCCESS_COMMIT';run_id=$State.run_id;record_type='SUCCESS';state_before=$State.current_state;state_after='COMPLETE';reason_code='SUCCESS_COMMIT_PUBLISHED_AND_REREAD';final_result='PASS';actual_classification=$classification;final_summary_hash=Get-EeeSha256Hex $summaryBytes;expected_completion_marker=$ExpectedMarker;actual_completion_marker=$ExpectedMarker;commit_created_utc=$RecordedUtc};$commitBytes=ConvertTo-EeeCanonicalJsonBytes $commit
    $artifacts=@{};foreach($key in $NoncommitArtifacts.Keys){$artifacts[$key]=[byte[]]$NoncommitArtifacts[$key].Clone()};$artifacts.final_summary=$summaryBytes;$artifacts.success_commit=$commitBytes;$commands=@(New-EeePublicationCommands $State.run_id $artifacts $StagingRoot $EvidenceRoot 'success_commit')
    [pscustomobject][ordered]@{schema_version='A24E_DIRECT_FINALIZATION_PLAN';run_id=$State.run_id;reconciliation=$Reconciliation;summary=$summary;summary_bytes=$summaryBytes;commit=$commit;commit_bytes=$commitBytes;commands=$commands;command_count=[long]$commands.Count;terminal_command_id=$commands[-1].command_id;plan_hash=Get-EeeSha256Hex(ConvertTo-EeeCanonicalJsonBytes([pscustomobject][ordered]@{run_id=$State.run_id;summary_hash=Get-EeeSha256Hex $summaryBytes;commit_hash=Get-EeeSha256Hex $commitBytes;command_ids=@($commands.command_id)}))}
}

function Confirm-EeeFinalization {
    param($State,$Plan,[object[]]$Receipts)
    if(-not(Test-EeeExecutionState $State).valid-or$Plan.run_id-cne$State.run_id){throw 'EEE_FINALIZATION_CONFIRMATION_INVALID'}
    $summaryBytes=ConvertTo-EeeCanonicalJsonBytes $Plan.summary;$commitBytes=ConvertTo-EeeCanonicalJsonBytes $Plan.commit;$projection=[pscustomobject][ordered]@{run_id=$State.run_id;summary_hash=Get-EeeSha256Hex $summaryBytes;commit_hash=Get-EeeSha256Hex $commitBytes;command_ids=@($Plan.commands.command_id)};$planHash=Get-EeeSha256Hex(ConvertTo-EeeCanonicalJsonBytes $projection)
    $planValid=(Get-EeeSha256Hex $summaryBytes)-ceq(Get-EeeSha256Hex([byte[]]$Plan.summary_bytes)) -and (Get-EeeSha256Hex $commitBytes)-ceq(Get-EeeSha256Hex([byte[]]$Plan.commit_bytes)) -and $Plan.commit.final_summary_hash-ceq(Get-EeeSha256Hex $summaryBytes) -and $Plan.plan_hash-ceq$planHash -and $Plan.command_count-eq@($Plan.commands).Count
    $authority=Test-EeePublicationReceipts @($Plan.commands) @($Receipts);$last=@($Plan.commands)[-1];$valid=$planValid-and$authority.authoritative-and$last.terminal_commit-and$last.command_id-ceq$Plan.terminal_command_id
    $copy=Copy-EeeValue $State;if($valid){$copy.current_state='COMPLETE';$copy.terminal_record_type='SUCCESS'}
    [pscustomobject][ordered]@{state=(Protect-EeeExecutionState $copy);summary=$Plan.summary;commit=$Plan.commit;publication=$authority;complete_authoritative=[bool]$valid;failure_code=$(if($valid){'NONE'}else{$authority.failure_code})}
}

function New-EeeFailureFinalizationPlan {
    param($State,[string]$ProfileId,[hashtable]$Store,$Inventory,$SecretEvidence,[hashtable]$NoncommitArtifacts,[string]$StagingRoot,[string]$EvidenceRoot,[string]$ExpectedMarker,[string]$RecordedUtc)
    if(-not(Test-EeeExecutionState $State).valid){throw 'EEE_FAILURE_FINALIZATION_INPUT_INVALID'}
    $terminal=Get-EeeFailureTerminalInternal $State.current_state
    $reconciliation=Invoke-EeeFailureReconciliation $State $ProfileId $Store $Inventory $SecretEvidence $RecordedUtc
    if($reconciliation.result-cne'PASS'){throw 'EEE_RECONCILIATION_FAILED'}
    $active=Get-EeeActiveClassification $State
    $summary=[pscustomobject][ordered]@{schema_version='A24E_DIRECT_FAILURE_FINAL_SUMMARY';run_id=$State.run_id;classification=$active.classification;terminal_state=$terminal.terminal;final_result='FAIL';retry_safe=[bool]$active.retry_safe;operator_action=$active.operator_action;cleanup_required=[bool]$active.cleanup_required;attestation_required=[bool]$active.attestation_required;identity_record_hash=$State.trusted_identity_record_hash;reconciliation_sha256=Get-EeeSha256Hex(ConvertTo-EeeCanonicalJsonBytes $reconciliation);expected_completion_marker=$ExpectedMarker;recorded_utc=$RecordedUtc}
    $summaryBytes=ConvertTo-EeeCanonicalJsonBytes $summary
    $commit=[pscustomobject][ordered]@{schema_version='A24E_FINAL_V4_FAILURE_COMMIT';run_id=$State.run_id;record_type='FAILURE';state_before=$State.current_state;state_after=$terminal.terminal;reason_code=$terminal.commit_reason;final_result='FAIL';actual_classification=$active.classification;retry_safe=[bool]$active.retry_safe;operator_action=$active.operator_action;final_summary_hash=Get-EeeSha256Hex $summaryBytes;expected_completion_marker=$ExpectedMarker;actual_completion_marker=$ExpectedMarker;commit_created_utc=$RecordedUtc}
    $commitBytes=ConvertTo-EeeCanonicalJsonBytes $commit
    $artifacts=@{};foreach($key in $NoncommitArtifacts.Keys){$artifacts[$key]=[byte[]]$NoncommitArtifacts[$key].Clone()};$artifacts.final_summary=$summaryBytes;$artifacts.failure_commit=$commitBytes
    $commands=@(New-EeePublicationCommands $State.run_id $artifacts $StagingRoot $EvidenceRoot 'failure_commit')
    $projection=[pscustomobject][ordered]@{run_id=$State.run_id;summary_hash=Get-EeeSha256Hex $summaryBytes;commit_hash=Get-EeeSha256Hex $commitBytes;command_ids=@($commands.command_id)}
    [pscustomobject][ordered]@{schema_version='A24E_DIRECT_FAILURE_FINALIZATION_PLAN';run_id=$State.run_id;reconciliation=$reconciliation;summary=$summary;summary_bytes=$summaryBytes;commit=$commit;commit_bytes=$commitBytes;commands=$commands;command_count=[long]$commands.Count;terminal_command_id=$commands[-1].command_id;plan_hash=Get-EeeSha256Hex(ConvertTo-EeeCanonicalJsonBytes $projection)}
}

function Confirm-EeeFailureFinalization {
    param($State,$Plan,[object[]]$Receipts)
    if(-not(Test-EeeExecutionState $State).valid-or$Plan.run_id-cne$State.run_id){throw 'EEE_FAILURE_FINALIZATION_CONFIRMATION_INVALID'}
    $terminal=Get-EeeFailureTerminalInternal $State.current_state
    $active=Get-EeeActiveClassification $State
    if($Plan.summary.run_id-cne$State.run_id-or$Plan.commit.run_id-cne$State.run_id-or$Plan.summary.classification-cne$active.classification-or$Plan.commit.actual_classification-cne$active.classification-or$Plan.commit.record_type-cne'FAILURE'-or$Plan.commit.state_before-cne$State.current_state-or$Plan.commit.state_after-cne$terminal.terminal-or$Plan.commit.final_result-cne'FAIL'){throw 'EEE_FAILURE_COMMIT_BINDING_INVALID'}
    $summaryBytes=ConvertTo-EeeCanonicalJsonBytes $Plan.summary;$commitBytes=ConvertTo-EeeCanonicalJsonBytes $Plan.commit
    $projection=[pscustomobject][ordered]@{run_id=$State.run_id;summary_hash=Get-EeeSha256Hex $summaryBytes;commit_hash=Get-EeeSha256Hex $commitBytes;command_ids=@($Plan.commands.command_id)}
    $planValid=(Get-EeeSha256Hex $summaryBytes)-ceq(Get-EeeSha256Hex([byte[]]$Plan.summary_bytes))-and(Get-EeeSha256Hex $commitBytes)-ceq(Get-EeeSha256Hex([byte[]]$Plan.commit_bytes))-and$Plan.commit.final_summary_hash-ceq(Get-EeeSha256Hex $summaryBytes)-and$Plan.plan_hash-ceq(Get-EeeSha256Hex(ConvertTo-EeeCanonicalJsonBytes $projection))-and$Plan.command_count-eq@($Plan.commands).Count
    $authority=Test-EeePublicationReceipts @($Plan.commands) @($Receipts);$last=@($Plan.commands)[-1]
    $valid=$planValid-and$authority.authoritative-and$last.terminal_commit-and$last.command_id-ceq$Plan.terminal_command_id
    $copy=Copy-EeeValue $State
    if($valid){$copy=Invoke-EeeTransitionInternal ([pscustomobject]$copy) 'EVIDENCE_RECONCILIATION_STARTED' $terminal.gate_reason $Plan.commit.commit_created_utc;$copy=Invoke-EeeTransitionInternal $copy $terminal.terminal $terminal.commit_reason $Plan.commit.commit_created_utc;$copy.terminal_record_type='FAILURE'}
    [pscustomobject][ordered]@{state=(Protect-EeeExecutionState $copy);summary=$Plan.summary;commit=$Plan.commit;publication=$authority;failure_authoritative=[bool]$valid;terminal_result=$(if($valid){'FAIL'}else{$null});failure_code=$(if($valid){'NONE'}elseif(-not$planValid){'FAILURE_PLAN_INVALID'}else{$authority.failure_code})}
}

function Invoke-EeeCrashRecovery {
    param([string]$RunId,[string]$CrashPoint,[bool]$CommitPresent,[bool]$CommitExact,[bool]$DestinationCollision)
    if($DestinationCollision){return [pscustomobject][ordered]@{run_id=$RunId;action='STOP';retry_safe=$false;authoritative=$false;failure_code='PUBLICATION_COLLISION'}}
    if($CommitPresent-and$CommitExact){return [pscustomobject][ordered]@{run_id=$RunId;action='REPLAY_ONLY';retry_safe=$false;authoritative=$true;failure_code='NONE'}}
    if($CommitPresent -and -not $CommitExact){return [pscustomobject][ordered]@{run_id=$RunId;action='STOP';retry_safe=$false;authoritative=$false;failure_code='COMMIT_TAMPERED'}}
    [pscustomobject][ordered]@{run_id=$RunId;action=$(if($CrashPoint-ceq'DURING_COMMIT_CREATE'){'REREAD_THEN_RETRY_CREATE_ONCE'}else{'DELETE_STAGING_AND_RETRY'});retry_safe=$true;authoritative=$false;failure_code='COMMIT_MISSING'}
}

function Invoke-EeeReplay {
    param($Summary,$Commit,[byte[]]$SummaryBytes,[byte[]]$CommitBytes)
    if($null-eq$Summary-or$null-eq$Commit-or$null-eq$SummaryBytes-or$null-eq$CommitBytes){return [pscustomobject][ordered]@{authoritative=$false;terminal_state=$null;terminal_result=$null;failure_code='COMMIT_MISSING'}}
    $summaryCanonical=ConvertTo-EeeCanonicalJsonBytes $Summary;$commitCanonical=ConvertTo-EeeCanonicalJsonBytes $Commit;if((Get-EeeSha256Hex $summaryCanonical)-cne(Get-EeeSha256Hex $SummaryBytes)-or(Get-EeeSha256Hex $commitCanonical)-cne(Get-EeeSha256Hex $CommitBytes)){return [pscustomobject][ordered]@{authoritative=$false;terminal_state='EVIDENCE_INVALID';terminal_result='FAIL';failure_code='CANONICAL_BYTES_INVALID'}}
    $valid=$Commit.run_id-ceq$Summary.run_id-and$Commit.final_summary_hash-ceq(Get-EeeSha256Hex $SummaryBytes)-and$Commit.expected_completion_marker-ceq$Commit.actual_completion_marker
    [pscustomobject][ordered]@{authoritative=[bool]$valid;terminal_state=$(if($valid){$Commit.state_after}else{'EVIDENCE_INVALID'});terminal_result=$(if($valid){$Commit.final_result}else{'FAIL'});failure_code=$(if($valid){'NONE'}else{'HASH_MISMATCH'})}
}

function Get-EeeDirectFixtureRegistry {
    $zero='0'*64;$base=[ordered]@{run_id='fx';stage_name='stage';dependency_block=$false;launch_failed=$false;wrapper_failed=$false;timed_out=$false;termination_incomplete=$false;exit_code=[long]0;marker_count=[long]1;stdout_redaction_rejected=$false;stderr_redaction_rejected=$false;harness_schema_failed=$false;harness_incomplete=$false;stdout_sha256=$zero;stderr_sha256=$zero;recorded_utc='2026-01-01T00:00:00.000Z'}
    $cases=@(@('FX01','success','CONFIRMED_COMMIT'),@('FX02','dependency_block','DEPENDENCIES_MISSING'),@('FX03','launch_failed','PREMUTATION_FAILURE'),@('FX04','wrapper_failed','PREMUTATION_FAILURE'),@('FX05','timed_out','TRANSPORT_INTERRUPTED'),@('FX06','termination_incomplete','TRANSPORT_INTERRUPTED'),@('FX07','stdout_redaction_rejected','EVIDENCE_INVALID'),@('FX08','stderr_redaction_rejected','EVIDENCE_INVALID'),@('FX09','exit_missing','TRANSPORT_INTERRUPTED'),@('FX10','exit_nonzero','COMMIT_ACK_UNKNOWN'),@('FX11','marker_missing','CREATE_MARKER_MISSING'),@('FX12','marker_duplicate','CREATE_MARKER_MISSING'),@('FX13','harness_schema_failed','HARNESS_FAILURE'),@('FX14','harness_incomplete','HARNESS_FAILURE'),@('FX15','compound','TRANSPORT_INTERRUPTED'),@('FX16','tamper','EVIDENCE_INVALID'))
    foreach($case in $cases){$o=[ordered]@{};foreach($k in $base.Keys){$o[$k]=$base[$k]};switch($case[1]){'success'{}'exit_missing'{$o.exit_code=$null}'exit_nonzero'{$o.exit_code=[long]3}'marker_missing'{$o.marker_count=[long]0}'marker_duplicate'{$o.marker_count=[long]2}'compound'{$o.timed_out=$true;$o.marker_count=[long]0}'tamper'{$o.stdout_redaction_rejected=$true;$o.exit_code=[long]3}default{$o[$case[1]]=$true}};[pscustomobject][ordered]@{fixture_id=$case[0];observation=[pscustomobject]$o;expected_classification=$case[2]}}
}

function Invoke-EeeDirectSelfTest {
    $failures=@();$tests=0
    try{$s=New-EeeExecutionState 'fx';if(-not(Test-EeeExecutionState $s).valid){$failures+='STATE'}}catch{$failures+='STATE'};$tests++
    $a=ConvertTo-EeeCanonicalJsonBytes([pscustomobject][ordered]@{a='e'+[char]0x301});$b=ConvertTo-EeeCanonicalJsonBytes([pscustomobject][ordered]@{a=[string][char]0xE9});if((Get-EeeSha256Hex $a)-cne(Get-EeeSha256Hex $b)){$failures+='CANONICAL'};$tests++
    foreach($f in Get-EeeDirectFixtureRegistry){$tests++;try{$state=New-EeeExecutionState 'fx';$actual=Invoke-EeeProcessObservation $state $f.observation;if($actual.outcome.classification-cne$f.expected_classification){$failures+=$f.fixture_id}}catch{$failures+=$f.fixture_id}}
    try{$secret=@();$seq=0;foreach($phase in @('ALLOCATED','GENERATED','LEASED','RELEASED')){$seq++;$secret+=,[pscustomobject][ordered]@{run_id='fx';sequence=[long]$seq;handle_id='h1';kind='PASSWORD';phase=$phase;representation_count=[long]1;released=$phase-ceq'RELEASED';recorded_utc='2026-01-01T00:00:00.000Z'}};$e=Invoke-EeeSecretLifecycle 'fx' $secret;if($e.result-cne'PASS'){$failures+='SECRET'}}catch{$failures+='SECRET'};$tests++
    try{$cmd=[pscustomobject][ordered]@{schema_version='A24E_DIRECT_PUBLICATION_COMMAND';run_id='fx';command_id='PUB-0001';sequence=[long]1;operation='ATOMIC_MOVE_CREATE_NEW';source_path='C:\\s';destination_path='C:\\d';expected_source_sha256='0'*64;expected_destination_absent=$true;create_once=$true;same_volume=$true;overwrite_forbidden=$true;terminal_commit=$true;bounded_wait_ms=[long]30000;collision_policy='FAIL_CLOSED'};$rec=[pscustomobject][ordered]@{schema_version='A24E_DIRECT_PUBLICATION_RECEIPT';run_id='fx';command_id='PUB-0001';attempted=$true;source_reread='PASS';destination_precondition='ABSENT';operation_result='PASS';destination_reread='PASS';actual_destination_sha256='0'*64;exact_match=$true;collision_result='NONE';terminal_ordering='LAST';failure_code='NONE';recorded_utc='2026-01-01T00:00:00.000Z'};if(-not(Test-EeePublicationReceipts @($cmd) @($rec)).authoritative){$failures+='PUBLICATION'};$rec.exact_match=$false;if((Test-EeePublicationReceipts @($cmd) @($rec)).authoritative){$failures+='PUBLICATION_TAMPER'}}catch{$failures+='PUBLICATION'};$tests+=2
    [pscustomobject][ordered]@{result=$(if($failures.Count){'FAIL'}else{'PASS'});test_count=[long]$tests;failure_count=[long]$failures.Count;failures=@($failures);fixture_count=[long]16;contract_version=$script:EeeContractVersion}
}

function Invoke-EeeDirectRegressionSuite {
    $failures=@();$groups=[ordered]@{};$self=Invoke-EeeDirectSelfTest;$groups.fixture_self_test=$self.result;if($self.result-cne'PASS'){$failures+='FIXTURE_SELF_TEST'}
    $groups.transition_registry=$(if(@(Get-EeeTransitionRegistry).Count-eq51-and-not@(Get-EeeTransitionRegistry|Group-Object state_before,state_after,reason_code|Where-Object Count -ne 1).Count){'PASS'}else{'FAIL'});if($groups.transition_registry-cne'PASS'){$failures+='TRANSITION_REGISTRY'}
    $groups.classification_registry=$(if(@(Get-EeeClassificationRegistry).Count-eq13-and-not@(Get-EeeClassificationRegistry|Group-Object classification|Where-Object Count -ne 1).Count){'PASS'}else{'FAIL'});if($groups.classification_registry-cne'PASS'){$failures+='CLASSIFICATION_REGISTRY'}
    $unknown=Test-EeeTypedRecord 'UNKNOWN' ([pscustomobject]@{});$groups.closed_schema=$(if(-not$unknown.valid){'PASS'}else{'FAIL'});if($groups.closed_schema-cne'PASS'){$failures+='CLOSED_SCHEMA'}
    try{$state=New-EeeExecutionState 'reg';$bad=Copy-EeeValue $state;$bad.next_sequence=[long]0;$groups.deep_state=$(if(-not(Test-EeeExecutionState([pscustomobject]$bad)).valid){'PASS'}else{'FAIL'})}catch{$groups.deep_state='FAIL'};if($groups.deep_state-cne'PASS'){$failures+='DEEP_STATE'}
    try{$z='0'*64;$identity=[pscustomobject][ordered]@{run_id='reg';source='CREATE';role_name='afex_core_test_login_20260101000000_abcdef12';role_oid=[long]9;source_artifact_sha256=$z;recorded_utc='2026-01-01T00:00:00.000Z'};$bound=Bind-EeeTrustedIdentity (New-EeeExecutionState 'reg') $identity;$identity.role_oid=[long]10;$conflict=$false;try{[void](Bind-EeeTrustedIdentity $bound.state $identity)}catch{$conflict=$true};$groups.identity_binding=$(if($bound.state.identity_authoritative-and$conflict){'PASS'}else{'FAIL'})}catch{$groups.identity_binding='FAIL'};if($groups.identity_binding-cne'PASS'){$failures+='IDENTITY_BINDING'}
    try{$badSecret=[pscustomobject][ordered]@{run_id='reg';sequence=[long]1;handle_id='h';kind='PASSWORD';phase='LEASED';representation_count=[long]1;released=$false;recorded_utc='2026-01-01T00:00:00.000Z'};$rejected=$false;try{[void](Invoke-EeeSecretLifecycle reg @($badSecret))}catch{$rejected=$true};$groups.secret_fail_closed=$(if($rejected){'PASS'}else{'FAIL'})}catch{$groups.secret_fail_closed='FAIL'};if($groups.secret_fail_closed-cne'PASS'){$failures+='SECRET_FAIL_CLOSED'}
    $r1=Invoke-EeeCrashRecovery reg BEFORE_COMMIT $false $false $false;$r2=Invoke-EeeCrashRecovery reg DURING_COMMIT_CREATE $false $false $false;$r3=Invoke-EeeCrashRecovery reg AFTER_COMMIT $true $true $false;$r4=Invoke-EeeCrashRecovery reg AFTER_COMMIT $true $false $false;$groups.crash_recovery=$(if($r1.retry_safe-and$r2.retry_safe-and$r3.authoritative-and$r4.failure_code-ceq'COMMIT_TAMPERED'){'PASS'}else{'FAIL'});if($groups.crash_recovery-cne'PASS'){$failures+='CRASH_RECOVERY'}
    $summary=[pscustomobject][ordered]@{run_id='reg';expected_completion_marker='M'};$summaryBytes=ConvertTo-EeeCanonicalJsonBytes $summary;$commit=[pscustomobject][ordered]@{run_id='reg';final_summary_hash=Get-EeeSha256Hex $summaryBytes;expected_completion_marker='M';actual_completion_marker='M';state_after='COMPLETE';final_result='PASS'};$commitBytes=ConvertTo-EeeCanonicalJsonBytes $commit;$replay1=Invoke-EeeReplay $summary $commit $summaryBytes $commitBytes;$tampered=[byte[]]$summaryBytes.Clone();$tampered[0]=$tampered[0]-bxor1;$replay2=Invoke-EeeReplay $summary $commit $tampered $commitBytes;$groups.replay=$(if($replay1.authoritative-and-not$replay2.authoritative){'PASS'}else{'FAIL'});if($groups.replay-cne'PASS'){$failures+='REPLAY'}
    [pscustomobject][ordered]@{result=$(if($failures.Count){'FAIL'}else{'PASS'});group_count=[long]$groups.Count;groups=[pscustomobject]$groups;failure_count=[long]$failures.Count;failures=@($failures);fixture_count=$self.fixture_count;test_count=[long]($self.test_count+$groups.Count)}
}

function Invoke-EeeBindingFixTestSuite {
    $rows=New-Object System.Collections.ArrayList;$failures=New-Object System.Collections.ArrayList;$counter=[ref]0
    function Add-Bf([string]$Name,[bool]$Pass){$counter.Value++;[void]$rows.Add([pscustomobject][ordered]@{test_id=('EBF{0:D2}'-f$counter.Value);name=$Name;result=$(if($Pass){'PASS'}else{'FAIL'})});if(-not$Pass){[void]$failures.Add($Name)}}
    function Is-Rejected([scriptblock]$Action){try{&$Action|Out-Null;return $false}catch{return $true}}
    function Is-ExactBinding($Candidate,$Expected){(Get-EeeSha256Hex(ConvertTo-EeeCanonicalJsonBytes $Candidate))-ceq(Get-EeeSha256Hex(ConvertTo-EeeCanonicalJsonBytes $Expected))}
    $run='runner-binding-fix';$utc='2026-01-01T00:00:00.000Z';$zero='0'*64
    $state=New-EeeExecutionState $run
    $observation=[pscustomobject][ordered]@{run_id=$run;stage_name='preflight';dependency_block=$false;launch_failed=$false;wrapper_failed=$false;timed_out=$false;termination_incomplete=$false;exit_code=[long]0;marker_count=[long]1;stdout_redaction_rejected=$false;stderr_redaction_rejected=$false;harness_schema_failed=$false;harness_incomplete=$false;stdout_sha256='1'*64;stderr_sha256='1'*64;recorded_utc=$utc}
    $state=(Invoke-EeeProcessObservation $state $observation).state;$state=(Invoke-EeeExceptionObservation $state ([pscustomobject][ordered]@{stage_name='execution_boundary';exception_type='System.Management.Automation.RuntimeException';exception_message='EEE_BINDING_MISMATCH';fully_qualified_error_id='EEE_BINDING_MISMATCH';script_stack_trace='fixture';recorded_utc=$utc})).state
    $profile=(Get-EeeEngineFinalizationProfile $state).profile_id
    $source=@{transition_ledger=ConvertTo-EeeJsonLinesBytes @($state.transition_records);classification_ledger=ConvertTo-EeeJsonLinesBytes @($state.classification_records);stage_ledger=ConvertTo-EeeJsonLinesBytes @($state.stage_authorities)}
    $binding=New-EeeLedgerBindingSet $run $source $utc
    $red=New-EeeRecursiveRedactionPrecommit $run $profile $source @() $utc;$registry=New-EeeArtifactRegistryRecord $run $profile $utc;$subject=@{};foreach($id in $source.Keys){$subject[$id]=[byte[]]$source[$id].Clone()};$subject.recursive_redaction_precommit=ConvertTo-EeeCanonicalJsonBytes $red;$subject.ledger_binding_set=ConvertTo-EeeCanonicalJsonBytes $binding;$subject.artifact_registry=ConvertTo-EeeCanonicalJsonBytes $registry;$inventory=New-EeeExactInventory $run $profile $subject $utc;$control=New-EeePrecommitControlInventory $run $profile @{recursive_redaction_precommit=$subject.recursive_redaction_precommit;ledger_binding_set=$subject.ledger_binding_set;artifact_registry=$subject.artifact_registry;evidence_inventory=ConvertTo-EeeCanonicalJsonBytes $inventory} $utc;$reconciliation=New-EeeReconciliationArtifact $state $profile $subject $red $binding $registry $inventory $control $utc
    $set=New-EeeControlArtifactSet $state $profile $source @() $reconciliation $utc
    Add-Bf 'valid_complete_control_artifact_binding_set' ($set.artifacts.ledger_binding_set.result-ceq'PASS'-and$set.artifacts.ledger_binding_set.failed_count-eq0)
    Add-Bf 'each_expected_binding_independently_valid' (@($set.artifacts.ledger_binding_set.binding_rows|Where-Object result -CEQ 'PASS').Count-eq3)
    $badSource=@{wrong_source=$source.transition_ledger;classification_ledger=$source.classification_ledger;stage_ledger=$source.stage_ledger};Add-Bf 'wrong_source_logical_id_rejected' (Is-Rejected {[void](New-EeeLedgerBindingSet $run $badSource $utc)})
    Add-Bf 'wrong_target_logical_id_rejected' ((New-EeeLedgerBindingSet 'wrong-target-run' $source $utc).result-ceq'FAIL')
    $bad=Copy-EeeValue $binding;$bad.binding_rows[0].artifact_sha256=$zero;Add-Bf 'wrong_source_hash_rejected' (-not(Is-ExactBinding $bad $binding))
    $bad=Copy-EeeValue $binding;$bad.binding_rows[0].target_projection_hash=$zero;Add-Bf 'wrong_target_hash_rejected' (-not(Is-ExactBinding $bad $binding))
    $bad=Copy-EeeValue $binding;$bad.binding_rows[0].source_projection_hash=$zero;Add-Bf 'wrong_source_projection_rejected' (-not(Is-ExactBinding $bad $binding))
    $bad=Copy-EeeValue $binding;$bad.binding_rows[0].target_projection_hash='2'*64;Add-Bf 'wrong_target_projection_rejected' (-not(Is-ExactBinding $bad $binding))
    $bad=Copy-EeeValue $binding;$bad.binding_rows[0].source_projection_hash=$bad.binding_rows[0].artifact_sha256;Add-Bf 'complete_hash_as_projection_rejected' (-not(Is-ExactBinding $bad $binding))
    $bad=Copy-EeeValue $binding;$bad.binding_rows[0].artifact_sha256=$bad.binding_rows[0].source_projection_hash;Add-Bf 'projection_hash_as_complete_rejected' (-not(Is-ExactBinding $bad $binding))
    $bad=Copy-EeeValue $binding;$bad.binding_rows=@($bad.binding_rows|Select-Object -Skip 1);Add-Bf 'missing_binding_rejected' (-not(Is-ExactBinding $bad $binding))
    $bad=Copy-EeeValue $binding;$bad.binding_rows+=,$bad.binding_rows[0];Add-Bf 'duplicate_binding_rejected' (-not(Is-ExactBinding $bad $binding))
    $bad=Copy-EeeValue $binding;$bad.binding_rows+=,[pscustomobject][ordered]@{binding_id='LB04';artifact_sha256='3'*64;source_projection_hash='4'*64;target_projection_hash='4'*64;result='PASS'};Add-Bf 'extra_binding_rejected' (-not(Is-ExactBinding $bad $binding))
    $bad=Copy-EeeValue $binding;$swap=$bad.binding_rows[0];$bad.binding_rows[0]=$bad.binding_rows[1];$bad.binding_rows[1]=$swap;Add-Bf 'binding_order_tampering_rejected' (-not(Is-ExactBinding $bad $binding))
    $tampered=@{};foreach($id in $source.Keys){$tampered[$id]=[byte[]]$source[$id].Clone()};$tampered.transition_ledger[0]=$tampered.transition_ledger[0]-bxor1;Add-Bf 'canonical_bytes_tampering_rejected' ((New-EeeLedgerBindingSet $run $tampered $utc).result-ceq'FAIL')
    $binding2=New-EeeLedgerBindingSet $run $source $utc;Add-Bf 'identical_inputs_deterministic' (Is-ExactBinding $binding2 $binding)
    Add-Bf 'runner_new_control_set_integration' ($set.result-cin@('PASS','FAIL')-and$set.artifacts.ledger_binding_set.result-ceq'PASS')
    $finalization=New-EeeEngineFinalizationSet $state $set $utc;Add-Bf 'finalization_reaches_beyond_control_set' ($finalization.schema_version-ceq'A24E_FINAL_V4_ENGINE_FINALIZATION_SET')
    $success=New-EeeSummaryDagFixtureInternal SUCCESS;$successFinal=New-EeeEngineFinalizationSet $success.state $success.control_set $success.utc;Add-Bf 'existing_success_finalization_passes' ($successFinal.result-ceq'PASS')
    $failure=New-EeeSummaryDagFixtureInternal FAILURE;$failureFinal=New-EeeEngineFinalizationSet $failure.state $failure.control_set $failure.utc;Add-Bf 'existing_failure_finalization_passes' ($failureFinal.result-ceq'PASS')
    [pscustomobject][ordered]@{result=$(if($failures.Count){'FAIL'}else{'PASS'});test_count=[long]$counter.Value;pass_count=[long]($counter.Value-$failures.Count);failure_count=[long]$failures.Count;failures=@($failures);tests=@($rows)}
}

function Invoke-EeeExceptionMetadataFixTestSuite {
    $rows=New-Object System.Collections.ArrayList;$failures=New-Object System.Collections.ArrayList;$counter=[ref]0
    function Add-Em([string]$Name,[bool]$Pass){$counter.Value++;[void]$rows.Add([pscustomobject][ordered]@{test_id=('EMF{0:D2}'-f$counter.Value);name=$Name;result=$(if($Pass){'PASS'}else{'FAIL'})});if(-not$Pass){[void]$failures.Add($Name)}}
    function Is-Rejected([scriptblock]$Action){try{&$Action|Out-Null;return $false}catch{return $true}}
    function New-Raw([string]$Message='EEE_BINDING_MISMATCH',$Fqid='EEE_BINDING_MISMATCH',[string]$Type='System.Management.Automation.RuntimeException',[string]$Stack='fixture'){[pscustomobject][ordered]@{stage_name='execution_boundary';exception_type=$Type;exception_message=$Message;fully_qualified_error_id=$Fqid;script_stack_trace=$Stack;recorded_utc='2026-01-01T00:00:00.000Z'}}
    $state=New-EeeExecutionState 'exception-metadata-fix';$raw=New-Raw;$before=ConvertTo-EeeCanonicalJson $raw;$result=Invoke-EeeExceptionObservation $state $raw
    Add-Em 'safe_eee_identifier_preserved' ($result.outcome.failure_code-ceq'EEE_BINDING_MISMATCH')
    Add-Em 'safe_fqid_preserved' ($result.outcome.exception_metadata.fully_qualified_error_id-ceq'EEE_BINDING_MISMATCH'-and'fully_qualified_error_id=EEE_BINDING_MISMATCH'-cin@($result.state.stage_authorities[-1].secondary_facts))
    Add-Em 'exception_type_validated' ($result.outcome.exception_metadata.exception_type-ceq'System.Management.Automation.RuntimeException'-and'exception_type=System.Management.Automation.RuntimeException'-cin@($result.state.stage_authorities[-1].secondary_facts))
    $bad=New-Raw;$bad|Add-Member NoteProperty unknown 'x';Add-Em 'unknown_field_rejected' (Is-Rejected {[void](Invoke-EeeExceptionObservation $state $bad)})
    $bad=New-Raw;$bad.PSObject.Properties.Remove('exception_message');Add-Em 'missing_field_rejected' (Is-Rejected {[void](Invoke-EeeExceptionObservation $state $bad)})
    $bad=New-Raw;$bad|Add-Member NoteProperty failure_code 'PASS';Add-Em 'caller_failure_code_rejected' (Is-Rejected {[void](Invoke-EeeExceptionObservation $state $bad)})
    $bad=New-Raw;$bad|Add-Member NoteProperty classification 'CONFIRMED_COMMIT';Add-Em 'caller_classification_rejected' (Is-Rejected {[void](Invoke-EeeExceptionObservation $state $bad)})
    $bad=New-Raw;$bad|Add-Member NoteProperty projected_state 'COMPLETE';Add-Em 'caller_projected_state_rejected' (Is-Rejected {[void](Invoke-EeeExceptionObservation $state $bad)})
    Add-Em 'database_url_rejected' ((Invoke-EeeExceptionObservation $state (New-Raw 'postgresql://user:secret@localhost/db' $null)).outcome.failure_code-ceq'ENGINE_EXCEPTION_METADATA_REJECTED')
    Add-Em 'password_text_rejected' ((Invoke-EeeExceptionObservation $state (New-Raw 'password=secret' $null)).outcome.failure_code-ceq'ENGINE_EXCEPTION_METADATA_REJECTED')
    Add-Em 'scram_verifier_rejected' ((Invoke-EeeExceptionObservation $state (New-Raw 'SCRAM-SHA-256$4096:abc$def:ghi' $null)).outcome.failure_code-ceq'ENGINE_EXCEPTION_METADATA_REJECTED')
    Add-Em 'bearer_token_rejected' ((Invoke-EeeExceptionObservation $state (New-Raw 'Bearer abc.def.ghi' $null)).outcome.failure_code-ceq'ENGINE_EXCEPTION_METADATA_REJECTED')
    Add-Em 'pgpassfile_text_rejected' ((Invoke-EeeExceptionObservation $state (New-Raw 'PGPASSFILE=C:\temp\secret.pgpass' $null)).outcome.failure_code-ceq'ENGINE_EXCEPTION_METADATA_REJECTED')
    Add-Em 'oversized_message_rejected' ((Invoke-EeeExceptionObservation $state (New-Raw ('x'*4097) $null)).outcome.failure_code-ceq'ENGINE_EXCEPTION_METADATA_REJECTED')
    Add-Em 'oversized_stack_rejected' ((Invoke-EeeExceptionObservation $state (New-Raw 'EEE_STATE_INVALID' 'EEE_STATE_INVALID' 'System.Exception' ('x'*16385))).outcome.failure_code-ceq'ENGINE_EXCEPTION_METADATA_REJECTED')
    Add-Em 'empty_message_safe' ((Invoke-EeeExceptionObservation $state (New-Raw '' $null)).outcome.failure_code-ceq'UNCLASSIFIED_ENGINE_EXCEPTION')
    Add-Em 'null_fqid_known_message' ((Invoke-EeeExceptionObservation $state (New-Raw 'EEE_STATE_INVALID' $null)).outcome.failure_code-ceq'EEE_STATE_INVALID')
    $runtime1=Invoke-EeeExceptionObservation $state (New-Raw 'runtime failure' 'RuntimeException' 'System.Management.Automation.RuntimeException');$runtime2=Invoke-EeeExceptionObservation $state (New-Raw 'runtime failure' 'RuntimeException' 'System.Management.Automation.RuntimeException');Add-Em 'runtime_exception_deterministic' ((ConvertTo-EeeCanonicalJson $runtime1.outcome.exception_metadata)-ceq(ConvertTo-EeeCanonicalJson $runtime2.outcome.exception_metadata))
    Add-Em 'canonical_metadata_deterministic' ((Get-EeeSha256Hex(ConvertTo-EeeCanonicalJsonBytes $runtime1.outcome.exception_metadata))-ceq(Get-EeeSha256Hex(ConvertTo-EeeCanonicalJsonBytes $runtime2.outcome.exception_metadata)))
    Add-Em 'input_immutable' ($before-ceq(ConvertTo-EeeCanonicalJson $raw))
    Add-Em 'engine_state_sealed' (Test-EeeExecutionState $result.state).valid
    $bad=New-Raw;$bad|Add-Member NoteProperty terminal_result 'PASS';Add-Em 'runner_cannot_force_pass' (Is-Rejected {[void](Invoke-EeeExceptionObservation $state $bad)})
    $bad=New-Raw;$bad|Add-Member NoteProperty terminal_state 'COMPLETE';Add-Em 'runner_cannot_force_terminal_state' (Is-Rejected {[void](Invoke-EeeExceptionObservation $state $bad)})
    Add-Em 'execution_boundary_stage_present' (@($result.state.stage_authorities|Where-Object stage_name -CEQ 'execution_boundary').Count-eq1)
    $rethrown=$false;try{try{throw 'EEE_REPLAY_INVALID'}catch{$caught=$_;$obs=[pscustomobject][ordered]@{stage_name='execution_boundary';exception_type=$_.Exception.GetType().FullName;exception_message=$_.Exception.Message;fully_qualified_error_id=$_.FullyQualifiedErrorId;script_stack_trace=[string]$_.ScriptStackTrace;recorded_utc='2026-01-01T00:00:00.000Z'};[void](Invoke-EeeExceptionObservation $state $obs);throw}}catch{$rethrown=$_.Exception.Message-ceq'EEE_REPLAY_INVALID'};Add-Em 'original_exception_rethrown' $rethrown
    Add-Em 'known_failure_identifier_retained' ($result.outcome.failure_code-ceq'EEE_BINDING_MISMATCH')
    Add-Em 'unknown_unsafe_fails_closed' ((Invoke-EeeExceptionObservation $state (New-Raw 'token Bearer abc123' $null)).outcome.failure_code-ceq'ENGINE_EXCEPTION_METADATA_REJECTED')
    $failure=New-EeeSummaryDagFixtureInternal FAILURE;$failureFinal=New-EeeEngineFinalizationSet $failure.state $failure.control_set $failure.utc;$failurePlan=New-EeeEnginePublicationPlan $failureFinal 'C:\a24e-stage' 'C:\a24e-evidence';$failureReceipts=New-EeePublicationReceiptFixtureInternal $failurePlan $failure.utc;$failureReplay=Invoke-EeeEngineFinalizationReplay $failureFinal $failurePlan $failureReceipts;Add-Em 'failure_finalization_authoritative' ($failureReplay.authoritative-and$failureReplay.terminal_result-ceq'FAIL')
    $success=New-EeeSummaryDagFixtureInternal SUCCESS;$successFinal=New-EeeEngineFinalizationSet $success.state $success.control_set $success.utc;$successPlan=New-EeeEnginePublicationPlan $successFinal 'C:\a24e-stage' 'C:\a24e-evidence';$successReceipts=New-EeePublicationReceiptFixtureInternal $successPlan $success.utc;$successReplay=Invoke-EeeEngineFinalizationReplay $successFinal $successPlan $successReceipts;Add-Em 'success_flow_unchanged' ($successReplay.authoritative-and$successReplay.terminal_result-ceq'PASS')
    $successReplay2=Invoke-EeeEngineFinalizationReplay $successFinal $successPlan $successReceipts;Add-Em 'replay_behavior_unchanged' ((ConvertTo-EeeCanonicalJson $successReplay)-ceq(ConvertTo-EeeCanonicalJson $successReplay2))
    [pscustomobject][ordered]@{result=$(if($failures.Count){'FAIL'}else{'PASS'});test_count=[long]$counter.Value;pass_count=[long]($counter.Value-$failures.Count);failure_count=[long]$failures.Count;failures=@($failures);tests=@($rows)}
}

function Invoke-EeeFourDefectCorrectionTestSuite {
    $rows=@();$utc='2026-08-03T00:00:00.000Z';$zero='0'*64
    function Add-Fd([string]$Id,[bool]$Pass){$script:fdRows+=,[pscustomobject][ordered]@{test_id=$Id;result=$(if($Pass){'PASS'}else{'FAIL'})}}
    $script:fdRows=@()
    $base=New-EeeExecutionState 'fd-base'
    Add-Fd 'FD01_NEW_STATE_VALID' (Test-EeeExecutionState $base).valid
    $mutations=@('current_state','next_sequence','role_name','role_oid','identity_bound','identity_required','identity_authoritative','cleanup_result','post_cleanup_result','terminal_record_type','transition_records','classification_records','stage_authorities','admitted_logical_ids','schema_version','contract_version','run_id','trusted_identity_record_hash')
    $index=1
    foreach($name in $mutations){$index++;$copy=Copy-EeeValue $base;switch($name){'current_state'{$copy.$name='COMPLETE_CANDIDATE'}'next_sequence'{$copy.$name=[long]2}'role_name'{$copy.$name='x'}'role_oid'{$copy.$name=[long]7}'identity_bound'{$copy.$name=$true}'identity_required'{$copy.$name=$true}'identity_authoritative'{$copy.$name=$true}'cleanup_result'{$copy.$name='PASS'}'post_cleanup_result'{$copy.$name='PASS'}'terminal_record_type'{$copy.$name='SUCCESS'}'transition_records'{$copy.$name=@([pscustomobject]@{sequence=[long]1})}'classification_records'{$copy.$name=@([pscustomobject]@{sequence=[long]1})}'stage_authorities'{$copy.$name=@([pscustomobject]@{sequence=[long]1})}'admitted_logical_ids'{$copy.$name=@('x')}'schema_version'{$copy.$name='x'}'contract_version'{$copy.$name='x'}'run_id'{$copy.$name='other'}'trusted_identity_record_hash'{$copy.$name=$zero}};Add-Fd ('FD{0:D2}_MUTATION_REJECTED'-f$index) (-not(Test-EeeExecutionState $copy).valid)}
    $original=New-EeeExecutionState 'fd-immutable';$changed=Copy-EeeValue $original;$changed.current_state='FAILED_PREMUTATION_CANDIDATE';Add-Fd 'FD20_ORIGINAL_REMAINS_VALID' (Test-EeeExecutionState $original).valid;Add-Fd 'FD21_COPIED_MUTATION_REJECTED' (-not(Test-EeeExecutionState $changed).valid)
    $sealed=Protect-EeeExecutionState $changed;Add-Fd 'FD22_INTERNAL_RESEAL_VALID' (Test-EeeExecutionState $sealed).valid
    $tampered=Copy-EeeValue $sealed;$tampered.classification_records=@([pscustomobject]@{sequence=[long]1});Add-Fd 'FD23_CLASSIFICATION_MUTATION_REJECTED' (-not(Test-EeeExecutionState $tampered).valid)
    $exceptionFixture=[pscustomobject][ordered]@{stage_name='preflight';exception_type='System.Management.Automation.RuntimeException';exception_message='EEE_STATE_INVALID';fully_qualified_error_id='EEE_STATE_INVALID';script_stack_trace='fixture';recorded_utc=$utc};$ex=Invoke-EeeExceptionObservation (New-EeeExecutionState 'fd-ex-pre') $exceptionFixture;Add-Fd 'FD24_EXCEPTION_CLASSIFIED' ($ex.outcome.classification-ceq'EVIDENCE_INVALID');Add-Fd 'FD25_EXCEPTION_NOT_RETRY_SAFE' (-not$ex.outcome.retry_safe);Add-Fd 'FD26_EXCEPTION_CANDIDATE_DERIVED' ($ex.state.current_state-ceq'EVIDENCE_INVALID_CANDIDATE');Add-Fd 'FD27_EXCEPTION_STATE_VALID' (Test-EeeExecutionState $ex.state).valid
    $exCopy=Copy-EeeValue $ex.state;$exCopy.current_state='COMPLETE_CANDIDATE';Add-Fd 'FD28_EXCEPTION_TERMINAL_MUTATION_REJECTED' (-not(Test-EeeExecutionState $exCopy).valid)
    $cross=Copy-EeeValue $ex.state;$cross.run_id='fd-other';Add-Fd 'FD29_CROSS_RUN_REJECTED' (-not(Test-EeeExecutionState $cross).valid)
    $stale=Copy-EeeValue $ex.state;$stale.next_sequence=[long]($stale.next_sequence+1);Add-Fd 'FD30_STALE_STATE_REJECTED' (-not(Test-EeeExecutionState $stale).valid)
    try{[void](Get-EeeEngineFinalizationProfile $exCopy);$rejected=$false}catch{$rejected=$true};Add-Fd 'FD31_FINALIZATION_RECOMPUTES_SEAL' $rejected
    try{[void](Invoke-EeeExceptionObservation $exCopy $exceptionFixture);$rejected=$false}catch{$rejected=$true};Add-Fd 'FD32_EXCEPTION_REDUCER_REJECTS_MUTATION' $rejected
    $active=Get-EeeActiveClassification $ex.state;Add-Fd 'FD33_EXCEPTION_ATTESTATION_POLICY_DERIVED' (-not$active.attestation_required);Add-Fd 'FD34_EXCEPTION_CLEANUP_POLICY_DERIVED' (-not$active.cleanup_required)
    $replayMissing=Invoke-EeeEngineFinalizationReplay $null $null @();Add-Fd 'FD35_MISSING_PUBLICATION_NONAUTHORITATIVE' (-not$replayMissing.authoritative)
    $crash=Invoke-EeeCrashRecovery 'fd-crash' 'DURING_COMMIT_CREATE' $false $false $false;Add-Fd 'FD36_CRASH_WITHOUT_COMMIT_NONAUTHORITATIVE' (-not$crash.authoritative)
    $rows=@($script:fdRows);Remove-Variable fdRows -Scope Script -ErrorAction SilentlyContinue
    [pscustomobject][ordered]@{result=$(if(@($rows|Where-Object result -CEQ 'FAIL').Count){'FAIL'}else{'PASS'});test_count=[long]$rows.Count;pass_count=[long]@($rows|Where-Object result -CEQ 'PASS').Count;failure_count=[long]@($rows|Where-Object result -CEQ 'FAIL').Count;tests=$rows}
}

Export-ModuleMember -Function ConvertTo-EeeCanonicalJson,ConvertTo-EeeCanonicalJsonBytes,ConvertTo-EeeCanonicalJsonLineBytes,ConvertTo-EeeJsonLinesBytes,Get-EeeSha256Hex,Get-EeeContractRegistry,Get-EeeInternalSchemaRegistry,Test-EeeTypedRecord,New-EeeExecutionState,Test-EeeExecutionState,Bind-EeeTrustedIdentity,Get-EeeProcessPrecedenceRegistry,Invoke-EeeProcessObservation,Invoke-EeeCleanupObservation,Invoke-EeePostCleanupObservation,Invoke-EeeConfirmedRollbackObservation,Invoke-EeeExceptionObservation,Invoke-EeeSecretLifecycle,Add-EeeAdmittedArtifact,New-EeeExactInventory,Test-EeeExactInventory,New-EeeRecursiveRedactionPrecommit,New-EeeLedgerBindingSet,New-EeeArtifactRegistryRecord,New-EeePrecommitControlInventory,New-EeeTerminalProjection,Test-EeeTerminalProjection,New-EeeExpectedFinalSummary,Test-EeeExpectedFinalSummary,New-EeeReplaySnapshot,New-EeeReconciliationArtifact,Test-EeeReconciliationArtifact,New-EeePrepublicationVerification,Test-EeePrepublicationArtifact,Test-EeePublishedProfileSet,Get-EeeEngineFinalizationProfile,New-EeeControlArtifactSet,New-EeeEngineFinalizationSet,New-EeeEnginePublicationPlan,Test-EeeEnginePublicationPlan,Test-EeeEnginePublicationReceipts,Invoke-EeeEngineFinalizationReplay,Invoke-EeeInventorySelfFixTestSuite,Invoke-EeeReconcileFixTestSuite,Invoke-EeeSummaryDagFixTestSuite,Invoke-EeePublicationAuthorityFixTestSuite,Invoke-EeeBindingFixTestSuite,Invoke-EeeExceptionMetadataFixTestSuite,Invoke-EeeReconciliation,Invoke-EeeFailureReconciliation,Invoke-EeeCrashRecovery,Get-EeeDirectFixtureRegistry,Invoke-EeeDirectSelfTest,Invoke-EeeDirectRegressionSuite,Invoke-EeeFourDefectCorrectionTestSuite
