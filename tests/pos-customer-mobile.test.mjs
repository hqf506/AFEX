import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import {
  getCustomerPhoneSearchInput,
  isCurrentCustomerSearchResponse,
  resolveCustomerCreateResponse,
  validateSaudiCustomerPhone,
} from '../lib/customers.ts'

const routeSource = readFileSync('app/api/customers/route.ts', 'utf8')
const customerStepSource = readFileSync('components/invoice-customer-step.tsx', 'utf8')
const modalSource = readFileSync('components/pos-add-customer-modal.tsx', 'utf8')
const workspaceSource = readFileSync('components/pos-customer-workspace.tsx', 'utf8')

test('all supported Saudi phone representations normalize to one identity', () => {
  for (const value of [
    '0512345678',
    '512345678',
    '966512345678',
    '+966512345678',
    '05 123-45678',
    '٠٥١٢٣٤٥٦٧٨',
  ]) {
    assert.equal(getCustomerPhoneSearchInput(value).normalizedPhone, '966512345678')
  }
})

test('phone search strips separators and Arabic digits before applying its minimum length', () => {
  const search = getCustomerPhoneSearchInput('٠٥ ١٢-٣')
  assert.equal(search.digits, '05123')
  assert.equal(search.digits.length >= 3, true)
  assert.equal(getCustomerPhoneSearchInput('٠٥').digits.length >= 3, false)
})

test('valid customer phone inputs remain valid after normalization', () => {
  assert.equal(validateSaudiCustomerPhone('+966 512-345-678').valid, true)
  assert.equal(validateSaudiCustomerPhone('٠٥١٢٣٤٥٦٧٨').valid, true)
  assert.equal(validateSaudiCustomerPhone('441234').valid, false)
})

test('only the newest search request may update mobile results', () => {
  assert.equal(isCurrentCustomerSearchResponse(5, 5), true)
  assert.equal(isCurrentCustomerSearchResponse(4, 5), false)
})

test('a successful customer response is the sole path that carries a selected customer', () => {
  const result = resolveCustomerCreateResponse({
    httpStatus: 201,
    payload: { success: true, customer: { id: 'customer-1' } },
  })
  assert.equal(result.ok, true)
  if (result.ok) assert.equal(result.customer.id, 'customer-1')
})

test('duplicate phone responses remain field-specific and never select a customer', () => {
  const result = resolveCustomerCreateResponse({
    httpStatus: 409,
    payload: { success: false, code: 'CUSTOMER_PHONE_CONFLICT' },
  })
  assert.equal(result.ok, false)
  if (!result.ok) {
    assert.equal(result.failure.code, 'CUSTOMER_PHONE_CONFLICT')
    assert.equal(result.failure.phoneField, true)
  }
})

test('validation failures are safely classified without exposing upstream diagnostics', () => {
  const result = resolveCustomerCreateResponse({
    httpStatus: 400,
    payload: { success: false, code: 'CUSTOMER_VALIDATION_FAILED' },
  })
  assert.equal(result.ok, false)
  if (!result.ok) assert.equal(result.failure.code, 'CUSTOMER_VALIDATION_FAILED')
})

test('API and network failures do not yield a created customer', () => {
  for (const input of [
    { httpStatus: 500, payload: { success: false, code: 'CUSTOMER_PERSISTENCE_FAILED' } },
    { httpStatus: 0, payload: null },
  ]) {
    const result = resolveCustomerCreateResponse(input)
    assert.equal(result.ok, false)
  }
})

test('server customer lookup preserves tenant filtering for normalized and legacy phone paths', () => {
  assert.match(routeSource, /normalizedQuery = applyTenantFilter\(normalizedQuery, tenantId\)/)
  assert.match(routeSource, /legacyQuery = applyTenantFilter\(legacyQuery, tenantId\)/)
  assert.match(routeSource, /query = applyTenantFilter\(query, auth\.profile\.tenant_id\)/)
})

test('phone lookup uses the authenticated server route rather than a browser RPC', () => {
  assert.doesNotMatch(customerStepSource, /lookup_customer_phone_identity_v1/)
  assert.match(customerStepSource, /fetch\(\s*`\/api\/customers\?\$\{searchParams\.toString\(\)\}`/)
})

test('modal blocks duplicate submission and calls onCreated only after an accepted response', () => {
  assert.match(modalSource, /if \(saving\) return/)
  assert.match(modalSource, /if \(!creation\.ok\)/)
  assert.match(modalSource, /onCreated\(creation\.customer\)/)
  assert.doesNotMatch(modalSource, /onCreated\(result\.customer/)
})

test('mobile customer controls retain telephone keyboard behavior and explicit empty results', () => {
  assert.match(workspaceSource, /type="tel"/)
  assert.match(workspaceSource, /inputMode="tel"/)
  assert.match(workspaceSource, /لا توجد نتائج مطابقة/)
})
