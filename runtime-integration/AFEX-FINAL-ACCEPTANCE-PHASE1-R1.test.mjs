import assert from 'node:assert/strict'
import test from 'node:test'
import { normalizeSaudiCustomerPhone } from '../lib/customers.ts'
import {
  acquirePosCheckoutIdentity,
  clearPosCheckoutIdentity,
  getPosCheckoutIdentityTestMarker,
  markPosCheckoutIdentitySucceeded,
  readPosCheckoutIdentity,
} from '../lib/pos-checkout-identity.ts'

class MemoryStorage {
  #values = new Map()
  getItem(key) { return this.#values.get(key) ?? null }
  setItem(key, value) { this.#values.set(key, String(value)) }
  removeItem(key) { this.#values.delete(key) }
}

globalThis.window = { sessionStorage: new MemoryStorage() }

test('Saudi phone formats normalize to one provider identity', () => {
  const expected = '966566118082'
  for (const input of [
    '0566118082',
    '566118082',
    '966566118082',
    '+966566118082',
    '05 6611-8082',
  ]) {
    assert.equal(normalizeSaudiCustomerPhone(input), expected)
  }
})

test('malformed, foreign, truncated and duplicate-prefix phones fail closed', () => {
  for (const input of [
    '',
    '056611808',
    '00966566118082',
    '+971566118082',
    '966966566118082',
    '0566118082ext1',
  ]) {
    assert.equal(normalizeSaudiCustomerPhone(input), null)
  }
})

test('checkout identity survives remount and exact replay', async () => {
  clearPosCheckoutIdentity()
  const draft = { branchId: 'b', customerId: 'c', items: [{ id: 'i', q: 1 }] }
  const first = await acquirePosCheckoutIdentity(draft)
  const replay = await acquirePosCheckoutIdentity({
    items: [{ q: 1, id: 'i' }],
    customerId: 'c',
    branchId: 'b',
  })
  assert.equal(replay.requestId, first.requestId)
  assert.equal(markPosCheckoutIdentitySucceeded(first.requestId), true)
  assert.equal(readPosCheckoutIdentity()?.state, 'succeeded')
  assert.match(
    getPosCheckoutIdentityTestMarker(),
    new RegExp(`^${first.requestId}:[0-9a-f]{16}:succeeded$`)
  )
  assert.equal((await acquirePosCheckoutIdentity(draft)).requestId, first.requestId)
})

test('changed checkout cannot reuse an unresolved or succeeded identity', async () => {
  clearPosCheckoutIdentity()
  await acquirePosCheckoutIdentity({ cart: ['a'], payment: 'mada' })
  await assert.rejects(
    acquirePosCheckoutIdentity({ cart: ['a', 'b'], payment: 'mada' }),
    /POS_CHECKOUT_IDENTITY_FINGERPRINT_CONFLICT/
  )
})

test('session-scoped storage isolates browser tabs', async () => {
  clearPosCheckoutIdentity()
  const firstTab = await acquirePosCheckoutIdentity({ cart: ['a'] })
  globalThis.window = { sessionStorage: new MemoryStorage() }
  const secondTab = await acquirePosCheckoutIdentity({ cart: ['a'] })
  assert.notEqual(secondTab.requestId, firstTab.requestId)
})
