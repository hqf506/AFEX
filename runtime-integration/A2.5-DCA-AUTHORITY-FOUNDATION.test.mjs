import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  AuthorityFailure, FOUNDATION_PINS, approvalSubject, canonicalize, digestCanonical,
  generateReviewMarkdown, parseAuthorityJson, payloadCommitment, renderFinalAuthorityReview, terminalCommitment,
  validateFinalAuthorityRecord, validateObject, verifyFinalAuthorityReview, verifyGeneratedReviewMarkdown, verifyTerminal
} from './A2.5-DCA-AUTHORITY-FOUNDATION.mjs';
import { O10A_STATUS, createUnavailableProviders, protectedMutationPathStatus } from './A2.5-DCA-AUTHORITY-PROVIDERS.mjs';
import { LocalAtomicOneUseStore, reserveOneUse, transitionApproval, transitionLineage, transitionOneUse } from './A2.5-DCA-AUTHORITY-STATE.mjs';

const pins = { schemaVersion: FOUNDATION_PINS.schemaVersion, canonicalizationVersion: FOUNDATION_PINS.canonicalizationVersion, digestAlgorithm: 'sha256' };
const payload = () => ({ ...pins, payloadID: 'PAYLOAD-1', repository: 'hqf506/AFEX', baseCommit: 'a'.repeat(64), policyClaims: { destructiveDocker: false }, serverVersion: 'PINNED-BY-POLICY', expectedParticipantIDs: ['APPROVER:A', 'APPROVER:B'], threshold: 2, supportingDescription: 'review context only' });
const terminal = () => {
  const approvedPayload = payload();
  const value = { ...pins, approvedPayload, approvedPayloadDigest: payloadCommitment(approvedPayload), terminalMetadata: { policyID: 'POLICY-1', threshold: 2 }, lineageGenesisOrReference: { lineageID: 'LINEAGE-1', genesis: true }, finalDigest: '0'.repeat(64) };
  value.finalDigest = terminalCommitment(value);
  return value;
};
const metadata = (finalDigest) => ({ ...pins, sourceFinalDigest: finalDigest, rendererVersion: 'A2.5-DCA-MARKDOWN-1', generatedAt: '2026-08-12T00:00:00.000Z', authority: 'NON_AUTHORITATIVE' });
const rejectsCode = (code) => (error) => error instanceof AuthorityFailure && error.code === code;

test('strict JSON parser rejects duplicate keys before interpretation', () => assert.throws(() => parseAuthorityJson('{"a":1,"a":2}'), rejectsCode('DUPLICATE')));
test('strict JSON parser rejects fractions, unsafe integers, controls, and non-NFC', () => {
  assert.throws(() => parseAuthorityJson('{"a":1.5}'), rejectsCode('MALFORMED'));
  assert.throws(() => parseAuthorityJson('{"a":9007199254740992}'), rejectsCode('UNSUPPORTED'));
  assert.throws(() => parseAuthorityJson('{"a":"\\u0001"}'), rejectsCode('UNSUPPORTED'));
  assert.throws(() => parseAuthorityJson('{"a":"e\\u0301"}'), rejectsCode('UNSUPPORTED'));
  assert.throws(() => parseAuthorityJson('{"a":-0}'), rejectsCode('UNSUPPORTED'));
  assert.throws(() => parseAuthorityJson('{"a":"\\ud800"}'), rejectsCode('UNSUPPORTED'));
});
test('closed schemas reject unknown, missing, unordered and duplicate array fields', () => {
  const valid = payload(); assert.equal(validateObject('AuthorityPayload', valid), valid);
  assert.throws(() => validateObject('AuthorityPayload', { ...payload(), surprise: true }), rejectsCode('UNKNOWN'));
  const { threshold, ...missing } = payload(); assert.throws(() => validateObject('AuthorityPayload', missing), rejectsCode('MISSING'));
  assert.throws(() => validateObject('AuthorityPayload', { ...payload(), expectedParticipantIDs: ['B', 'A'] }), rejectsCode('AMBIGUOUS'));
  assert.throws(() => validateObject('AuthorityPayload', { ...payload(), expectedParticipantIDs: ['A', 'A'] }), rejectsCode('DUPLICATE'));
});
test('canonicalization known answers are pinned and input field order is irrelevant', () => {
  assert.equal(canonicalize({ z: 1, a: ['x', true, null] }), '{"a":["x",true,null],"z":1}');
  assert.equal(digestCanonical({ z: 1, a: ['x', true, null] }), '2dbf0cc51429fdd00bf311a9833eb83f1426ee02317a9629d054c5b1c8d1a241');
  assert.equal(digestCanonical({ a: ['x', true, null], z: 1 }), digestCanonical({ z: 1, a: ['x', true, null] }));
});
test('payload and non-self-referential terminal commitments detect every mutation', () => {
  const value = terminal(); assert.equal(verifyTerminal(value), true);
  assert.equal(terminalCommitment({ ...value, finalDigest: 'f'.repeat(64) }), value.finalDigest);
  assert.throws(() => verifyTerminal({ ...value, approvedPayload: { ...value.approvedPayload, repository: 'copy/AFEX' } }), rejectsCode('DIGEST_MISMATCH'));
  assert.throws(() => verifyTerminal({ ...value, finalDigest: 'f'.repeat(64) }), rejectsCode('DIGEST_MISMATCH'));
});
test('approval subject binds final object but does not become execution authorization', () => {
  const value = terminal();
  const subject = approvalSubject(value, 'POLICY-1', ['APPROVER:A', 'APPROVER:B'], 2, 'LINEAGE-1');
  assert.match(subject, new RegExp(value.finalDigest));
  assert.doesNotMatch(subject, /exactAction|executionAuthorityProof/);
  assert.throws(() => approvalSubject(value, 'OTHER', ['APPROVER:A', 'APPROVER:B'], 2, 'LINEAGE-1'), rejectsCode('CONFLICTING'));
  assert.throws(() => approvalSubject(value, 'POLICY-1', ['APPROVER:A'], 2, 'LINEAGE-1'), rejectsCode('CONFLICTING'));
});
test('generated view is deterministic, non-authoritative, digest-bound and stale-safe', () => {
  const value = terminal(); const meta = metadata(value.finalDigest);
  const first = generateReviewMarkdown(value, meta);
  assert.equal(first, generateReviewMarkdown(value, meta));
  assert.match(first, /NON-AUTHORITATIVE/);
  assert.equal(verifyGeneratedReviewMarkdown(first, value, meta), true);
  assert.throws(() => verifyGeneratedReviewMarkdown(`${first}changed`, value, meta), rejectsCode('STALE'));
  assert.throws(() => generateReviewMarkdown(value, { ...meta, sourceFinalDigest: 'f'.repeat(64) }), rejectsCode('STALE'));
});
test('provider-neutral unavailable adapters can never return success', async () => {
  for (const provider of Object.values(createUnavailableProviders())) {
    for (const method of ['evaluate', 'issue', 'verify', 'consume']) await assert.rejects(provider[method](), rejectsCode('PROVIDER_UNAVAILABLE'));
  }
});
test('pure state machines accept defined transitions and reject illegal ones', () => {
  assert.equal(transitionApproval('DRAFT', 'RECORD_PARTIAL_APPROVAL'), 'PARTIALLY_APPROVED');
  assert.equal(transitionApproval('PARTIALLY_APPROVED', 'FINALIZE_THRESHOLD'), 'TERMINAL_APPROVED');
  assert.equal(transitionLineage('CURRENT', 'SUPERSEDE'), 'SUPERSEDED');
  assert.equal(transitionOneUse('RESERVED', 'CRASH'), 'UNKNOWN');
  assert.equal(transitionOneUse('UNKNOWN', 'RECONCILE_CONSUMED'), 'CONSUMED');
  assert.throws(() => transitionApproval('TERMINAL_APPROVED', 'FINALIZE_THRESHOLD'), rejectsCode('ILLEGAL_TRANSITION'));
});
test('one-use optimistic reservation permits exactly one concurrent snapshot winner', () => {
  const snapshot = Object.freeze({ authorizationID: 'AUTH-1', state: 'ISSUED', version: 7 });
  const winner = reserveOneUse(snapshot, 7);
  assert.deepEqual(winner, { authorizationID: 'AUTH-1', state: 'RESERVED', version: 8 });
  assert.throws(() => reserveOneUse(winner, 7), rejectsCode('CONFLICTING'));
  assert.throws(() => reserveOneUse({ ...snapshot, state: 'CONSUMED' }, 7), rejectsCode('ALREADY_CONSUMED'));
});
test('local atomic store makes competing reservations admit exactly one winner', () => {
  const store = new LocalAtomicOneUseStore(); store.issue({ authorizationID: 'AUTH-2' });
  assert.equal(store.reserve('AUTH-2', 0).state, 'RESERVED');
  assert.throws(() => store.reserve('AUTH-2', 0), rejectsCode('CONFLICTING'));
});
test('Docker mutation authority is structurally absent from provider interfaces', () => {
  assert.equal(O10A_STATUS, 'ENGINE_DOCKER_MUTATION_PROHIBITED');
  assert.deepEqual(protectedMutationPathStatus().enabled, false);
  assert.equal('executeAtomic' in Object.values(createUnavailableProviders())[0], false);
});
test('final JSON is closed and its non-authoritative view is deterministic', async () => {
  const record = validateFinalAuthorityRecord(parseAuthorityJson(await readFile(new URL('./A2.5-DCA-FINAL-AUTHORITY.json', import.meta.url), 'utf8')));
  const view = await readFile(new URL('./A2.5-DCA-FINAL-AUTHORITY.generated.md', import.meta.url), 'utf8');
  assert.equal(record.executionPolicy.realDockerMutationAuthorized, false);
  assert.deepEqual(record.blockerRegister.map((x) => x.id), Array.from({ length: 25 }, (_, index) => `BL-${String(index + 1).padStart(2, '0')}`));
  assert.equal(record.blockerRegister.some((x) => x.id.startsWith('SEM-')), false);
  assert.equal(record.invariantRegister.some((x) => x.id.startsWith('SEM-')), false);
  assert.deepEqual(Object.fromEntries(['SATISFIED','PARTIAL','UNSATISFIED','CONTRADICTORY'].map((status) => [status, record.invariantRegister.filter((x) => x.previousStatus === status).length])), { SATISFIED: 0, PARTIAL: 18, UNSATISFIED: 25, CONTRADICTORY: 3 });
  assert.equal([...record.blockerRegister, ...record.invariantRegister].some((x) => x.semanticDisposition === 'CLOSED'), false);
  assert.equal(renderFinalAuthorityReview(record), view);
  assert.equal(verifyFinalAuthorityReview(view, record), true);
  assert.throws(() => verifyFinalAuthorityReview(`${view}changed`, record), rejectsCode('STALE'));
});
