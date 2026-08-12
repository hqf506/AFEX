import { AuthorityFailure, canonicalize, digestCanonical, validateObject, verifyTerminal } from './A2.5-DCA-AUTHORITY-FOUNDATION.mjs';

export const MUTATION_DISABLED_VERDICT = 'VERIFIED_NON_EXECUTABLE_INTENT';
const fail = (code, path, detail = '') => { throw new AuthorityFailure(code, path, detail); };
const exactKeys = (value, keys, path) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('MALFORMED', path);
  for (const key of Object.keys(value)) if (!keys.includes(key)) fail('UNKNOWN', `${path}.${key}`);
  for (const key of keys) if (!Object.hasOwn(value, key)) fail('MISSING', `${path}.${key}`);
};
const same = (a, b) => canonicalize(a) === canonicalize(b);

export async function coordinateNonMutatingIntent(options) {
  exactKeys(options, ['terminal', 'request', 'expectedRuntime', 'now', 'providers'], '$');
  const { terminal, request, expectedRuntime, now, providers } = options;
  exactKeys(request, ['actor', 'action', 'target', 'scope'], '$.request');
  exactKeys(expectedRuntime, ['repository', 'baseCommit', 'daemonID', 'contextID', 'orchestratorState', 'serverVersion'], '$.expectedRuntime');
  exactKeys(providers, ['currentAuthority', 'hostProvenance', 'runtimeObservation', 'executionAuthorization', 'durableAudit'], '$.providers');
  verifyTerminal(terminal);
  if (!Number.isSafeInteger(now)) fail('MALFORMED', '$.now');

  const current = await providers.currentAuthority.verify({ terminalFinalDigest: terminal.finalDigest, now });
  validateObject('CurrentAuthorityEvidence', current.evidence);
  if (current.verified !== true || current.fresh !== true) fail(current.fresh === false ? 'STALE' : 'UNVERIFIABLE_EVIDENCE', '$.currentAuthority');
  if (current.evidence.revocationStatus === 'REVOKED') fail('REVOKED', '$.currentAuthority');
  if (current.evidence.revocationStatus === 'SUPERSEDED') fail('SUPERSEDED', '$.currentAuthority');
  if (current.evidence.currentFinalDigest !== terminal.finalDigest) fail('SUPERSEDED', '$.currentAuthority.currentFinalDigest');

  const host = await providers.hostProvenance.verify({ terminalFinalDigest: terminal.finalDigest, now });
  if (host?.verified !== true || host.localBindingVerified !== true) fail('UNVERIFIABLE_EVIDENCE', '$.hostProvenance');

  const observed = await providers.runtimeObservation.observe({ now });
  exactKeys(observed, ['complete', 'repository', 'baseCommit', 'daemonID', 'contextID', 'orchestratorState', 'serverVersion', 'observedAt', 'expiresAt'], '$.runtimeObservation');
  if (observed.complete !== true) fail('UNVERIFIABLE_EVIDENCE', '$.runtimeObservation.complete');
  if (observed.expiresAt <= now || observed.observedAt > now) fail('STALE', '$.runtimeObservation');
  if (observed.orchestratorState === 'UNKNOWN') fail('AMBIGUOUS', '$.runtimeObservation.orchestratorState');
  for (const key of ['repository', 'baseCommit', 'daemonID', 'contextID', 'orchestratorState', 'serverVersion']) {
    if (observed[key] !== expectedRuntime[key]) fail('CONFLICTING', `$.runtimeObservation.${key}`);
  }

  const observation = { schemaVersion: terminal.schemaVersion, canonicalizationVersion: terminal.canonicalizationVersion, digestAlgorithm: terminal.digestAlgorithm, observationID: `OBS:${digestCanonical(observed).toUpperCase()}`, terminalFinalDigest: terminal.finalDigest, observedHostProvenance: host.evidence, observedContext: observed, issuedAt: new Date(observed.observedAt).toISOString(), expiresAt: new Date(observed.expiresAt).toISOString(), state: 'ISSUED' };
  validateObject('RuntimeObservation', observation);
  const authorization = await providers.executionAuthorization.issue({ request, observation, currentAuthorityEvidenceDigest: digestCanonical(current.evidence), now });
  validateObject('ExecutionAuthorization', authorization);
  if (authorization.actor !== request.actor || authorization.exactAction !== request.action || authorization.exactTarget !== request.target) fail('OVER_SCOPED', '$.executionAuthorization');
  if (!same(authorization.exactScope, request.scope) || authorization.observationID !== observation.observationID) fail('OVER_SCOPED', '$.executionAuthorization');

  const reservation = await providers.durableAudit.reserve({ authorizationID: authorization.authorizationID, expectedState: 'ISSUED' });
  if (reservation?.reserved !== true || typeof reservation.reservationID !== 'string') fail('ALREADY_CONSUMED', '$.reservation');
  const intent = Object.freeze({ executionDisposition: 'VERIFICATION_ONLY_NON_EXECUTABLE', realMutationAuthorized: false, request: structuredClone(request), terminalFinalDigest: terminal.finalDigest, currentAuthorityEvidenceDigest: digestCanonical(current.evidence), observationDigest: digestCanonical(observation), authorizationDigest: digestCanonical(authorization), reservationID: reservation.reservationID });
  const recorded = await providers.durableAudit.recordProposed({ intent, verdict: MUTATION_DISABLED_VERDICT });
  if (recorded?.recorded !== true) fail('UNVERIFIABLE_EVIDENCE', '$.durableAudit');
  return Object.freeze({ verdict: MUTATION_DISABLED_VERDICT, intent, mutationInvoked: false });
}
