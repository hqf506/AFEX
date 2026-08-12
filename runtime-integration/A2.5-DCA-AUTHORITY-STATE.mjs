import { AuthorityFailure } from './A2.5-DCA-AUTHORITY-FOUNDATION.mjs';

const transition = (table, state, event, path) => {
  const next = table[state]?.[event];
  if (!next) throw new AuthorityFailure('ILLEGAL_TRANSITION', path, `${state}->${event}`);
  return next;
};

const approval = Object.freeze({
  DRAFT: { RECORD_PARTIAL_APPROVAL: 'PARTIALLY_APPROVED', FINALIZE_THRESHOLD: 'TERMINAL_APPROVED', INVALIDATE: 'INVALIDATED' },
  PARTIALLY_APPROVED: { RECORD_PARTIAL_APPROVAL: 'PARTIALLY_APPROVED', FINALIZE_THRESHOLD: 'TERMINAL_APPROVED', INVALIDATE: 'INVALIDATED' },
  TERMINAL_APPROVED: { INVALIDATE: 'INVALIDATED', SUPERSEDE: 'SUPERSEDED', REVOKE: 'REVOKED' },
  INVALIDATED: {}, SUPERSEDED: {}, REVOKED: {}
});
const lineage = Object.freeze({ GENESIS: { ADVANCE: 'CURRENT', REVOKE: 'REVOKED' }, CURRENT: { SUPERSEDE: 'SUPERSEDED', REVOKE: 'REVOKED' }, SUPERSEDED: {}, REVOKED: {} });
const oneUse = Object.freeze({ ISSUED: { RESERVE: 'RESERVED', CANCEL: 'CANCELLED' }, RESERVED: { SUCCEED: 'CONSUMED', FAIL: 'CONSUMED', CRASH: 'UNKNOWN', PARTIAL: 'UNKNOWN', CANCEL: 'CANCELLED' }, CONSUMED: {}, CANCELLED: {}, UNKNOWN: { RECONCILE_CONSUMED: 'CONSUMED', RECONCILE_CANCELLED: 'CANCELLED' } });

export const transitionApproval = (state, event) => transition(approval, state, event, '$.approvalState');
export const transitionLineage = (state, event) => transition(lineage, state, event, '$.lineageState');
export const transitionOneUse = (state, event) => transition(oneUse, state, event, '$.oneUseState');

export function reserveOneUse(snapshot, expectedVersion) {
  if (!Number.isSafeInteger(expectedVersion) || snapshot.version !== expectedVersion) throw new AuthorityFailure('CONFLICTING', '$.version');
  if (snapshot.state !== 'ISSUED') throw new AuthorityFailure(snapshot.state === 'CONSUMED' ? 'ALREADY_CONSUMED' : 'REPLAYED', '$.state');
  return Object.freeze({ ...snapshot, state: 'RESERVED', version: snapshot.version + 1 });
}

export class LocalAtomicOneUseStore {
  #records = new Map();
  issue(record) {
    if (this.#records.has(record.authorizationID)) throw new AuthorityFailure('DUPLICATE', '$.authorizationID');
    const issued = Object.freeze({ ...record, state: 'ISSUED', version: 0 });
    this.#records.set(record.authorizationID, issued);
    return issued;
  }
  reserve(authorizationID, expectedVersion) {
    const current = this.#records.get(authorizationID);
    if (!current) throw new AuthorityFailure('MISSING', '$.authorizationID');
    const reserved = reserveOneUse(current, expectedVersion);
    this.#records.set(authorizationID, reserved);
    return reserved;
  }
  read(authorizationID) { return this.#records.get(authorizationID) ?? null; }
}
