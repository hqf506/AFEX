import { AuthorityFailure, canonicalize, digestCanonical } from './A2.5-DCA-AUTHORITY-FOUNDATION.mjs';

export const OPERATION_DISABLED_VERDICT = 'VERIFIED_NON_EXECUTABLE_INTENT';
export const GENERIC_EXECUTOR_STATUS = 'PROHIBITED';
const fail = (code, path, detail = '') => { throw new AuthorityFailure(code, path, detail); };

export const OPERATION_CATALOG = Object.freeze([
  { operationID: 'PD6G-OBSERVE-GATE', exactDockerAction: 'READ_ONLY_IDENTITY_AND_STATE_INSPECTION', targetType: 'PD6G_RESOURCE_SET', disposition: 'READ_ONLY', idempotency: 'READ_ONLY_REPEATABLE', reversible: true, crashAmbiguity: 'OBSERVATION_MAY_BECOME_STALE', proofFeasibility: 'READ_ONLY' },
  { operationID: 'PD6G-STOP-CONTAINER', exactDockerAction: 'STOP_VERIFIED_CONTAINER_ID', targetType: 'CONTAINER', disposition: 'VERIFICATION_ONLY_INTENT_TEMPLATE', idempotency: 'CONDITIONAL_ON_SAME_ID_AND_PRESTATE', reversible: true, crashAmbiguity: 'RUNNING_OR_STOPPED_UNKNOWN', proofFeasibility: 'OUTSIDE_ENGINE_AUTHORITY' },
  { operationID: 'PD6G-REMOVE-CONTAINER', exactDockerAction: 'REMOVE_VERIFIED_STOPPED_CONTAINER_ID_WITHOUT_FORCE', targetType: 'CONTAINER', disposition: 'VERIFICATION_ONLY_INTENT_TEMPLATE', idempotency: 'CONDITIONAL_ON_SAME_ID_AND_ABSENCE_PROOF', reversible: false, crashAmbiguity: 'PRESENT_OR_ABSENT_UNKNOWN', proofFeasibility: 'OUTSIDE_ENGINE_AUTHORITY' },
  { operationID: 'PD6G-DISCONNECT-POSTGRES', exactDockerAction: 'DISCONNECT_VERIFIED_CONTAINER_ID_FROM_VERIFIED_NETWORK_ID', targetType: 'NETWORK_ATTACHMENT', disposition: 'VERIFICATION_ONLY_INTENT_TEMPLATE', idempotency: 'CONDITIONAL_ON_EXACT_ATTACHMENT_AND_POSTGRES_INVARIANTS', reversible: true, crashAmbiguity: 'ATTACHED_OR_DETACHED_UNKNOWN', proofFeasibility: 'OUTSIDE_ENGINE_AUTHORITY' },
  { operationID: 'PD6G-REMOVE-NETWORK', exactDockerAction: 'REMOVE_VERIFIED_ZERO_CONSUMER_NETWORK_ID', targetType: 'NETWORK', disposition: 'VERIFICATION_ONLY_INTENT_TEMPLATE', idempotency: 'CONDITIONAL_ON_SAME_ID_AND_ABSENCE_PROOF', reversible: false, crashAmbiguity: 'PRESENT_OR_ABSENT_UNKNOWN', proofFeasibility: 'OUTSIDE_ENGINE_AUTHORITY' },
  { operationID: 'PD6G-PROHIBIT-COMPOSE-DOWN', exactDockerAction: 'DOCKER_COMPOSE_DOWN', targetType: 'COMPOSE_PROJECT', disposition: 'PROHIBITED', idempotency: 'NOT_APPLICABLE', reversible: false, crashAmbiguity: 'MULTI_RESOURCE_PARTIAL_EFFECT', proofFeasibility: 'PROHIBITED_BY_AUTHORITY' },
  { operationID: 'PD6G-PROHIBIT-FORCE-REMOVE', exactDockerAction: 'FORCE_REMOVE_CONTAINER', targetType: 'CONTAINER', disposition: 'PROHIBITED', idempotency: 'NOT_APPLICABLE', reversible: false, crashAmbiguity: 'FORCED_PARTIAL_EFFECT', proofFeasibility: 'PROHIBITED_BY_AUTHORITY' },
  { operationID: 'PD6G-PROHIBIT-PRUNE', exactDockerAction: 'ANY_DOCKER_PRUNE', targetType: 'MULTIPLE_RESOURCES', disposition: 'PROHIBITED', idempotency: 'NOT_APPLICABLE', reversible: false, crashAmbiguity: 'UNBOUNDED_PARTIAL_EFFECT', proofFeasibility: 'PROHIBITED_BY_AUTHORITY' },
  { operationID: 'PD6G-PROHIBIT-IMAGE-REMOVE', exactDockerAction: 'REMOVE_OR_RETAG_IMAGE', targetType: 'IMAGE', disposition: 'PROHIBITED', idempotency: 'NOT_APPLICABLE', reversible: false, crashAmbiguity: 'IMAGE_DISPOSITION_UNKNOWN', proofFeasibility: 'PROHIBITED_BY_AUTHORITY' },
  { operationID: 'PD6G-PROHIBIT-VOLUME-REMOVE', exactDockerAction: 'REMOVE_ANY_VOLUME', targetType: 'VOLUME', disposition: 'PROHIBITED', idempotency: 'NOT_APPLICABLE', reversible: false, crashAmbiguity: 'DATA_LOSS_UNKNOWN', proofFeasibility: 'PROHIBITED_BY_AUTHORITY' }
]);

const candidates = new Map(OPERATION_CATALOG.filter((x) => x.disposition === 'VERIFICATION_ONLY_INTENT_TEMPLATE').map((x) => [x.operationID, x]));
const exactKeys = (value, keys, path) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('MALFORMED', path);
  for (const key of Object.keys(value)) if (!keys.includes(key)) fail('UNKNOWN', `${path}.${key}`);
  for (const key of keys) if (!Object.hasOwn(value, key)) fail('MISSING', `${path}.${key}`);
};

export function buildDisabledOperationProtocol(input) {
  exactKeys(input, ['operationID', 'actor', 'action', 'target', 'scope', 'immutableTargetIdentity', 'runtimeIdentity', 'repositoryBase', 'requiredPreState', 'desiredPostState', 'authorizationID', 'durableIntentID', 'currentAuthorityDigest', 'trustedTimeDigest'], '$');
  const operation = candidates.get(input.operationID);
  if (!operation) fail('UNSUPPORTED', '$.operationID');
  if (input.action !== operation.exactDockerAction) fail('CONFLICTING', '$.action');
  if (!Array.isArray(input.scope) || input.scope.length === 0) fail('OVER_SCOPED', '$.scope');
  if (!input.immutableTargetIdentity || !input.runtimeIdentity || !input.requiredPreState || !input.desiredPostState) fail('UNVERIFIABLE_EVIDENCE', '$');
  const intent = Object.freeze(structuredClone(input));
  return Object.freeze({ protocolVersion: 'A2.5-DCA-O10A-OPERATION-1', executionDisposition: 'VERIFICATION_ONLY_NON_EXECUTABLE', realMutationAuthorized: false, intent, intentDigest: digestCanonical(intent), decisionPoint: OPERATION_DISABLED_VERDICT, mutationInvoked: false, replayAllowed: false, recoveryRequiresNewAuthorization: true });
}

export function verifyOperationPrecondition(protocol, observed) {
  if (canonicalize(protocol.intent.requiredPreState) !== canonicalize(observed)) fail('CONFLICTING', '$.requiredPreState');
  return true;
}
export function verifyOperationPostcondition(protocol, observed) {
  if (canonicalize(protocol.intent.desiredPostState) !== canonicalize(observed)) fail('UNVERIFIABLE_EVIDENCE', '$.desiredPostState');
  return true;
}
export function classifyInterruptedOperation(stage) {
  if (stage === 'BEFORE_MUTATION') return Object.freeze({ state: 'CANCELLED', replayAllowed: false, recoveryRequiresNewAuthorization: true });
  if (stage === 'AFTER_REQUEST' || stage === 'LOST_RESPONSE') return Object.freeze({ state: 'UNKNOWN', replayAllowed: false, recoveryRequiresNewAuthorization: true });
  fail('UNSUPPORTED', '$.stage');
}
export function rejectGenericExecutor() { fail('UNSUPPORTED', '$.genericDockerMutationExecutor', GENERIC_EXECUTOR_STATUS); }
