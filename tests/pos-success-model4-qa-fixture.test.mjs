import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'

const pagePath = new URL('../app/qa/pos-success-model4/page.tsx', import.meta.url)
const fixturePath = new URL('../app/qa/pos-success-model4/pos-success-model4-qa-fixture.tsx', import.meta.url)
const productionPagePath = new URL('../app/pos/sale/success/page.tsx', import.meta.url)
const page = fs.readFileSync(pagePath, 'utf8')
const fixture = fs.readFileSync(fixturePath, 'utf8')
const productionPage = fs.readFileSync(productionPagePath, 'utf8')

test('Production is rejected by the server route with notFound', () => {
  assert.match(page, /process\.env\.VERCEL_ENV !== 'production'/)
  assert.match(page, /if \(!fixtureEnabled\) \{\s*notFound\(\)/)
  assert.match(page, /await connection\(\)/)
})

test('the component gate fails closed when the server gate is false', () => {
  assert.match(fixture, /if \(!fixtureEnabled\) \{\s*return null/)
  assert.match(fixture, /data-fixture-business-actions="disabled"/)
})

test('fixture reuses the production workspace and its real CSS Module', () => {
  assert.match(fixture, /PosInvoiceSuccessWorkspace/)
  assert.match(fixture, /components\/pos-invoice-success-workspace\.module\.css/)
  assert.doesNotMatch(fixture, /function SuccessIcon|تم إنشاء الفاتورة/)
})

test('fixture uses only the approved deterministic synthetic identity', () => {
  for (const value of ['QA-00-0000', '276', 'عميل اختبار', "customerPhone: ''", "paymentMethod: 'mada'"]) {
    assert.ok(fixture.includes(value), `missing synthetic value: ${value}`)
  }
  assert.match(fixture, /بيانات اصطناعية لاختبار العرض فقط/)
  assert.match(fixture, /PREVIEW QA FIXTURE/)
})

test('fixture cannot invoke API, persistence, WhatsApp, PDF, or printing code', () => {
  assert.doesNotMatch(fixture, /fetch\(|supabase|\.rpc\(|sessionStorage|localStorage|window\.print|wa\.me|loadOfficialInvoicePdf/i)
  assert.match(fixture, /printingEnabled=\{false\}/)
  assert.match(fixture, /whatsappEnabled=\{false\}/)
  assert.equal((fixture.match(/disabledFixtureAction/g) || []).length, 5)
})

test('fixture countdown is deterministic and cannot redirect', () => {
  assert.match(fixture, /redirectCountdown=\{30\}/)
  assert.doesNotMatch(fixture, /setTimeout|setInterval|router\.|location\./)
})

test('production success code does not read fixture data', () => {
  for (const forbidden of ['QA-00-0000', 'PREVIEW QA FIXTURE', 'SYNTHETIC_SUCCESS_SNAPSHOT', 'pos-success-model4-qa-fixture']) {
    assert.doesNotMatch(productionPage, new RegExp(forbidden))
  }
})
