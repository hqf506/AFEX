import { createHash } from 'node:crypto';

export const FOUNDATION_PINS = Object.freeze({
  schemaVersion: 'A2.5-DCA-SCHEMA-1',
  canonicalizationVersion: 'A2.5-DCA-C14N-1',
  digestAlgorithm: 'sha256',
  approvalContextVersion: 'A2.5-DCA-APPROVAL-CONTEXT-1',
  proofEncodingVersion: 'A2.5-DCA-PROOF-1',
  serverVersionPolicy: 'EXACT_PIN_REQUIRED'
});

export const FAILURE_CODES = Object.freeze([
  'MISSING', 'MALFORMED', 'DUPLICATE', 'UNKNOWN', 'UNSUPPORTED', 'AMBIGUOUS',
  'CONFLICTING', 'STALE', 'REVOKED', 'SUPERSEDED', 'REPLAYED',
  'ALREADY_CONSUMED', 'OVER_SCOPED', 'UNVERIFIABLE_EVIDENCE',
  'ILLEGAL_TRANSITION', 'PROVIDER_UNAVAILABLE', 'DIGEST_MISMATCH'
]);

export class AuthorityFailure extends Error {
  constructor(code, path, detail = '') {
    if (!FAILURE_CODES.includes(code)) throw new TypeError(`unknown failure code: ${code}`);
    super(`${code}:${path}${detail ? `:${detail}` : ''}`);
    this.name = 'AuthorityFailure';
    this.code = code;
    this.path = path;
  }
}

const fail = (code, path, detail) => { throw new AuthorityFailure(code, path, detail); };
const hex64 = /^[0-9a-f]{64}$/;
const id = /^[A-Z0-9][A-Z0-9._:-]{0,127}$/;
const timestamp = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

export function parseAuthorityJson(text) {
  if (typeof text !== 'string') fail('MALFORMED', '$', 'JSON input must be text');
  let index = 0;
  const ws = () => { while (/\s/u.test(text[index] ?? '')) index += 1; };
  const value = (path) => {
    ws();
    const c = text[index];
    if (c === '{') return object(path);
    if (c === '[') return array(path);
    if (c === '"') return string(path);
    if (text.startsWith('true', index)) { index += 4; return true; }
    if (text.startsWith('false', index)) { index += 5; return false; }
    if (text.startsWith('null', index)) { index += 4; return null; }
    const match = text.slice(index).match(/^-?(?:0|[1-9]\d*)/);
    if (!match) fail('MALFORMED', path, `unexpected token at ${index}`);
    index += match[0].length;
    if (match[0] === '-0') fail('UNSUPPORTED', path, 'negative zero is not canonical');
    const number = Number(match[0]);
    if (!Number.isSafeInteger(number)) fail('UNSUPPORTED', path, 'canonical integers must be safe integers');
    return number;
  };
  const string = (path) => {
    const start = index;
    index += 1;
    let escaped = false;
    while (index < text.length) {
      const c = text[index++];
      if (!escaped && c === '"') {
        let parsed;
        try { parsed = JSON.parse(text.slice(start, index)); } catch { fail('MALFORMED', path, 'invalid string'); }
        if (/[\uD800-\uDFFF]/u.test(parsed)) fail('UNSUPPORTED', path, 'surrogate code units are forbidden');
        if (parsed.normalize('NFC') !== parsed) fail('UNSUPPORTED', path, 'strings must be NFC');
        if (/\p{Cc}/u.test(parsed)) fail('UNSUPPORTED', path, 'control characters are forbidden');
        return parsed;
      }
      if (!escaped && c === '\\') escaped = true;
      else escaped = false;
    }
    fail('MALFORMED', path, 'unterminated string');
  };
  const object = (path) => {
    index += 1; ws();
    const out = Object.create(null);
    const seen = new Set();
    if (text[index] === '}') { index += 1; return out; }
    while (true) {
      ws(); if (text[index] !== '"') fail('MALFORMED', path, 'object key expected');
      const key = string(`${path}.[key]`);
      if (seen.has(key)) fail('DUPLICATE', `${path}.${key}`);
      seen.add(key); ws(); if (text[index++] !== ':') fail('MALFORMED', path, 'colon expected');
      out[key] = value(`${path}.${key}`); ws();
      const c = text[index++];
      if (c === '}') return out;
      if (c !== ',') fail('MALFORMED', path, 'comma expected');
    }
  };
  const array = (path) => {
    index += 1; ws();
    const out = [];
    if (text[index] === ']') { index += 1; return out; }
    while (true) {
      out.push(value(`${path}[${out.length}]`)); ws();
      const c = text[index++];
      if (c === ']') return out;
      if (c !== ',') fail('MALFORMED', path, 'comma expected');
    }
  };
  const result = value('$'); ws();
  if (index !== text.length) fail('MALFORMED', '$', 'trailing input');
  return result;
}

const field = (type, options = {}) => ({ type, ...options });
const commonPins = {
  schemaVersion: field('pin', { value: FOUNDATION_PINS.schemaVersion }),
  canonicalizationVersion: field('pin', { value: FOUNDATION_PINS.canonicalizationVersion }),
  digestAlgorithm: field('pin', { value: FOUNDATION_PINS.digestAlgorithm })
};

export const OBJECT_SCHEMAS = Object.freeze({
  AuthorityPayload: { fields: { ...commonPins, payloadID: field('id'), repository: field('string'), baseCommit: field('digest'), policyClaims: field('object'), serverVersion: field('string'), expectedParticipantIDs: field('orderedIds'), threshold: field('integer', { min: 1 }), supportingDescription: field('string', { nonNormative: true }) } },
  TerminalAuthorityObject: { fields: { ...commonPins, approvedPayload: field('schema', { schema: 'AuthorityPayload' }), approvedPayloadDigest: field('digest'), terminalMetadata: field('object'), lineageGenesisOrReference: field('object'), finalDigest: field('digest') } },
  LineageEvent: { fields: { ...commonPins, lineageID: field('id'), eventID: field('id'), predecessorFinalDigest: field('nullableDigest'), subjectFinalDigest: field('digest'), eventType: field('enum', { values: ['GENESIS', 'SUPERSEDE', 'REVOKE'] }), eventSequence: field('integer', { min: 0 }), eventAuthorityProof: field('object') } },
  CurrentAuthorityEvidence: { fields: { ...commonPins, lineageID: field('id'), currentFinalDigest: field('digest'), currentPointerProof: field('object'), revocationStatus: field('enum', { values: ['CURRENT', 'REVOKED', 'SUPERSEDED'] }), revocationStatusProof: field('object'), freshnessProof: field('object') } },
  RuntimeObservation: { fields: { ...commonPins, observationID: field('id'), terminalFinalDigest: field('digest'), observedHostProvenance: field('object'), observedContext: field('object'), issuedAt: field('timestamp'), expiresAt: field('timestamp'), state: field('enum', { values: ['ISSUED', 'RESERVED', 'CONSUMED', 'CANCELLED'] }) } },
  ExecutionAuthorization: { fields: { ...commonPins, authorizationID: field('id'), observationID: field('id'), actor: field('id'), exactAction: field('enum', { values: ['DOCKER_DESTRUCTIVE_MUTATION'] }), exactTarget: field('string'), exactScope: field('orderedIds'), currentAuthorityEvidenceDigest: field('digest'), executionAuthorityProof: field('object'), consumptionState: field('enum', { values: ['ISSUED', 'RESERVED', 'CONSUMED', 'CANCELLED'] }) } },
  ConsumptionActionResult: { fields: { ...commonPins, authorizationID: field('id'), reservationID: field('id'), outcome: field('enum', { values: ['SUCCEEDED', 'FAILED', 'CANCELLED', 'CRASHED', 'PARTIAL', 'UNKNOWN'] }), consumedAt: field('timestamp'), actionEvidence: field('object') } },
  GeneratedViewMetadata: { fields: { ...commonPins, sourceFinalDigest: field('digest'), rendererVersion: field('pin', { value: 'A2.5-DCA-MARKDOWN-1' }), generatedAt: field('timestamp'), authority: field('pin', { value: 'NON_AUTHORITATIVE' }) } }
});

function validateValue(spec, value, path) {
  if (spec.type === 'string' && typeof value !== 'string') fail('MALFORMED', path);
  if (spec.type === 'id' && (typeof value !== 'string' || !id.test(value))) fail('MALFORMED', path);
  if (spec.type === 'digest' && (typeof value !== 'string' || !hex64.test(value))) fail('MALFORMED', path);
  if (spec.type === 'nullableDigest' && value !== null && (typeof value !== 'string' || !hex64.test(value))) fail('MALFORMED', path);
  if (spec.type === 'timestamp' && (typeof value !== 'string' || !timestamp.test(value))) fail('MALFORMED', path);
  if (spec.type === 'pin' && value !== spec.value) fail('UNSUPPORTED', path);
  if (spec.type === 'integer' && (!Number.isSafeInteger(value) || value < spec.min)) fail('MALFORMED', path);
  if (spec.type === 'enum' && !spec.values.includes(value)) fail('UNSUPPORTED', path);
  if (spec.type === 'object' && (!value || typeof value !== 'object' || Array.isArray(value))) fail('MALFORMED', path);
  if (spec.type === 'orderedIds') {
    if (!Array.isArray(value) || value.some((v) => typeof v !== 'string' || !id.test(v))) fail('MALFORMED', path);
    if (new Set(value).size !== value.length) fail('DUPLICATE', path);
    if (value.some((v, i) => i && value[i - 1].localeCompare(v, 'en') >= 0)) fail('AMBIGUOUS', path, 'array must be strictly sorted');
  }
  if (spec.type === 'schema') validateObject(spec.schema, value, path);
}

export function validateObject(schemaName, input, path = '$') {
  const schema = OBJECT_SCHEMAS[schemaName];
  if (!schema) fail('UNSUPPORTED', path, `unknown schema ${schemaName}`);
  if (!input || typeof input !== 'object' || Array.isArray(input)) fail('MALFORMED', path);
  const keys = Object.keys(input);
  for (const key of keys) if (!Object.hasOwn(schema.fields, key)) fail('UNKNOWN', `${path}.${key}`);
  for (const [key, spec] of Object.entries(schema.fields)) {
    if (!Object.hasOwn(input, key)) fail('MISSING', `${path}.${key}`);
    validateValue(spec, input[key], `${path}.${key}`);
  }
  return input;
}

function assertCanonicalValue(value, path = '$') {
  if (typeof value === 'number' && !Number.isSafeInteger(value)) fail('UNSUPPORTED', path, 'only safe integers are canonical');
  if (typeof value === 'string') {
    if (value.normalize('NFC') !== value) fail('UNSUPPORTED', path, 'strings must be NFC');
    if (/\p{Cc}/u.test(value)) fail('UNSUPPORTED', path, 'control characters are forbidden');
  }
  if (value && typeof value === 'object') {
    if (Array.isArray(value)) value.forEach((v, i) => assertCanonicalValue(v, `${path}[${i}]`));
    else Object.entries(value).forEach(([k, v]) => { assertCanonicalValue(k, `${path}.[key]`); assertCanonicalValue(v, `${path}.${k}`); });
  }
}

export function canonicalize(value) {
  assertCanonicalValue(value);
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(',')}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalize(value[key])}`).join(',')}}`;
}

export const digestCanonical = (value) => createHash('sha256').update(canonicalize(value), 'utf8').digest('hex');
export const payloadCommitment = (payload) => { validateObject('AuthorityPayload', payload); return digestCanonical(payload); };

export function terminalCommitment(terminal) {
  validateObject('TerminalAuthorityObject', terminal);
  const { finalDigest: ignored, ...withoutSelfReference } = terminal;
  return digestCanonical({ domain: 'A2.5-DCA-TERMINAL-OBJECT-1', terminal: withoutSelfReference });
}

export function verifyTerminal(terminal) {
  validateObject('TerminalAuthorityObject', terminal);
  if (payloadCommitment(terminal.approvedPayload) !== terminal.approvedPayloadDigest) fail('DIGEST_MISMATCH', '$.approvedPayloadDigest');
  if (terminalCommitment(terminal) !== terminal.finalDigest) fail('DIGEST_MISMATCH', '$.finalDigest');
  return true;
}

export function approvalSubject(terminal, policyID, participantIDs, threshold, lineageID) {
  verifyTerminal(terminal);
  const metadata = terminal.terminalMetadata;
  const lineage = terminal.lineageGenesisOrReference;
  if (metadata.policyID !== policyID) fail('CONFLICTING', '$.policyID');
  if (metadata.threshold !== threshold || terminal.approvedPayload.threshold !== threshold) fail('CONFLICTING', '$.threshold');
  if (canonicalize(terminal.approvedPayload.expectedParticipantIDs) !== canonicalize(participantIDs)) fail('CONFLICTING', '$.participantIDs');
  if (lineage.lineageID !== lineageID) fail('CONFLICTING', '$.lineageID');
  return canonicalize({ domain: FOUNDATION_PINS.approvalContextVersion, finalDigest: terminal.finalDigest, schemaVersion: FOUNDATION_PINS.schemaVersion, policyID, participantIDs, threshold, lineageID });
}

export function generateReviewMarkdown(terminal, metadata) {
  verifyTerminal(terminal); validateObject('GeneratedViewMetadata', metadata);
  if (metadata.sourceFinalDigest !== terminal.finalDigest) fail('STALE', '$.sourceFinalDigest');
  return [
    '# A2.5 DCA Generated Review View', '',
    '> NON-AUTHORITATIVE GENERATED VIEW', '',
    `- Source final digest: \`${terminal.finalDigest}\``,
    `- Payload ID: \`${terminal.approvedPayload.payloadID}\``,
    `- Repository: \`${terminal.approvedPayload.repository}\``,
    `- Base commit: \`${terminal.approvedPayload.baseCommit}\``,
    `- Generated at: \`${metadata.generatedAt}\``, ''
  ].join('\n');
}

export function verifyGeneratedReviewMarkdown(markdown, terminal, metadata) {
  if (markdown !== generateReviewMarkdown(terminal, metadata)) fail('STALE', '$.generatedView');
  return true;
}

const FINAL_KEYS = ['recordType','normativeRepresentation','authorityState','schemaVersion','canonicalizationVersion','digestAlgorithm','serverVersionPolicy','repositoryRule','baseRule','decisions','executionPolicy','providerStatus','evidenceStatus','operations','failClosedConditions','legacyArtifactDisposition','blockerRegister','invariantRegister'];
export function validateFinalAuthorityRecord(record) {
  if (!record || typeof record !== 'object' || Array.isArray(record)) fail('MALFORMED', '$');
  for (const key of Object.keys(record)) if (!FINAL_KEYS.includes(key)) fail('UNKNOWN', `$.${key}`);
  for (const key of FINAL_KEYS) if (!Object.hasOwn(record, key)) fail('MISSING', `$.${key}`);
  if (record.recordType !== 'A2.5_DCA_FINAL_AUTHORITY' || record.normativeRepresentation !== 'SOLE_NORMATIVE_MACHINE_RECORD' || record.authorityState !== 'DESIGN_APPROVED_NON_EXECUTABLE_DRAFT') fail('CONFLICTING', '$.identity');
  if (record.schemaVersion !== FOUNDATION_PINS.schemaVersion || record.canonicalizationVersion !== FOUNDATION_PINS.canonicalizationVersion || record.digestAlgorithm !== FOUNDATION_PINS.digestAlgorithm) fail('UNSUPPORTED', '$.pins');
  const policy = record.executionPolicy;
  if (policy.executionDisposition !== 'VERIFICATION_AND_INTENT_ONLY' || policy.engineDockerMutationAuthority !== 'PROHIBITED' || policy.realDockerMutationAuthorized !== false || policy.mutationCallbacksAccepted !== false) fail('CONFLICTING', '$.executionPolicy');
  if (record.blockerRegister.length !== 25 || new Set(record.blockerRegister.map((x) => x.id)).size !== 25) fail('CONFLICTING', '$.blockerRegister');
  if (record.invariantRegister.length !== 46 || new Set(record.invariantRegister.map((x) => x.id)).size !== 46) fail('CONFLICTING', '$.invariantRegister');
  if (record.blockerRegister.some((x) => !/^BL-\d{2}$/.test(x.id) || typeof x.previousCategory !== 'string' || typeof x.previousStatus !== 'string' || typeof x.semanticDisposition !== 'string')) fail('CONFLICTING', '$.blockerRegister.authority');
  if (record.invariantRegister.some((x) => !/^INV-[A-Z0-9-]+$/.test(x.id) || !['SATISFIED','PARTIAL','UNSATISFIED','CONTRADICTORY'].includes(x.previousStatus) || typeof x.semanticDisposition !== 'string')) fail('CONFLICTING', '$.invariantRegister.authority');
  const previousCounts = Object.fromEntries(['SATISFIED','PARTIAL','UNSATISFIED','CONTRADICTORY'].map((status) => [status, record.invariantRegister.filter((x) => x.previousStatus === status).length]));
  if (canonicalize(previousCounts) !== canonicalize({ SATISFIED: 0, PARTIAL: 18, UNSATISFIED: 25, CONTRADICTORY: 3 })) fail('CONFLICTING', '$.invariantRegister.previousStatus');
  if ([...record.blockerRegister, ...record.invariantRegister].some((x) => x.semanticDisposition === 'CLOSED')) fail('CONFLICTING', '$.registers.closed');
  if (record.operations.readOnly.length !== 1 || record.operations.intentTemplates.length !== 4 || record.operations.prohibited.length !== 5) fail('CONFLICTING', '$.operations');
  return record;
}

export function renderFinalAuthorityReview(record) {
  validateFinalAuthorityRecord(record);
  const p = record.executionPolicy;
  return ['# A2.5 DCA Final Authority Review View','', '> **NON-AUTHORITATIVE — GENERATED FROM THE SOLE NORMATIVE JSON RECORD**','',`- Normative source digest: \`${digestCanonical(record)}\``,`- Authority state: \`${record.authorityState}\``,`- Execution disposition: \`${p.executionDisposition}\``,`- Engine Docker mutation authority: \`${p.engineDockerMutationAuthority}\``,`- Real Docker mutation authorized: \`${p.realDockerMutationAuthorized ? 'YES' : 'NO'}\``,`- Generic executor: \`${p.genericDockerMutationExecutor}\``,`- Operation-specific executor: \`${p.operationSpecificDockerMutationExecutor}\``,`- Manual execution authority from intent: \`${p.manualExecutionAuthorityFromIntent}\``,`- External providers: \`${record.providerStatus.selection}\``,`- Terminal approval: \`${record.evidenceStatus.terminalApproval}\``,`- Read-only operations: \`${record.operations.readOnly.length}\``,`- Non-executable intent templates: \`${record.operations.intentTemplates.length}\``,`- Prohibited operations: \`${record.operations.prohibited.length}\``,`- Legacy artifact status: \`${record.legacyArtifactDisposition.legacyArtifactStatus}\``, '', 'This view has no approval or execution authority. It must never be parsed as authority or permission.', ''].join('\n');
}
export function verifyFinalAuthorityReview(markdown, record) {
  if (markdown !== renderFinalAuthorityReview(record)) fail('STALE', '$.generatedFinalView');
  return true;
}
