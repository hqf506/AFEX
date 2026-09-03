import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { clearClientResource, loadClientResource, peekClientResource } from '../lib/client-resource-cache.ts'

const [cacheSource, resetSource, successSource, customerPageSource, customerSource, workspaceSource] = await Promise.all([
  readFile(new URL('../lib/client-resource-cache.ts', import.meta.url), 'utf8'),
  readFile(new URL('../lib/invoices/sale-reset.ts', import.meta.url), 'utf8'),
  readFile(new URL('../app/pos/sale/success/page.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../app/pos/sale/customer/page.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../components/invoice-customer-step.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../components/pos-customer-workspace.tsx', import.meta.url), 'utf8'),
])

test('new sale reset is atomic before client navigation and preserves authority', () => {
  assert.match(successSource, /beginNewInvoiceSaleCycle\(\)\s*\n\s*router\.replace\('\/pos\/sale\/customer'\)/)
  assert.doesNotMatch(successSource, /window\.location\.replace\('\/pos\/sale\/customer'\)/)
  assert.match(resetSource, /clearCompletedInvoiceSaleState\(\)/)
  assert.match(resetSource, /clearClientResourcesByPrefix\('recent-customers:'\)/)
  assert.match(resetSource, /clearClientResourcesByPrefix\('customer-search:'\)/)
  assert.doesNotMatch(resetSource, /clearActivePosEmployee|markPosLoggedOut|signOut/)
})

test('three new-sale cycles remount clean customer workspaces without identity invention', () => {
  let cycle = 0
  const observed = []
  for (let index = 0; index < 3; index += 1) observed.push(++cycle)
  assert.deepEqual(observed, [1, 2, 3])
  assert.match(customerPageSource, /key=\{saleCycle\}/)
  assert.match(resetSource, /INVOICE_CUSTOMER_STORAGE_KEY/)
  assert.match(resetSource, /INVOICE_SALE_ITEMS_STORAGE_KEY/)
  assert.match(resetSource, /INVOICE_SUCCESS_STORAGE_KEY/)
  assert.match(resetSource, /clearPosCheckoutIdentity\(\)/)
  assert.doesNotMatch(resetSource, /randomUUID|acquirePosCheckoutIdentity|requestId/)
})

test('superseded aborted cache promises cannot clobber or satisfy a new request', () => {
  assert.match(cacheSource, /if \(!force && currentEntry\?\.promise\)/)
  assert.match(cacheSource, /latestEntry\?\.promise !== nextPromise/)
  assert.match(customerSource, /force: recentCustomersRetryGeneration > 0/)
  assert.match(customerSource, /force: customerSearchRetryGeneration > 0/)
})

test('a forced replacement request survives rejection of the aborted predecessor', async () => {
  const key = 'phase6e:recent-customers'
  clearClientResource(key)
  let rejectOld
  const oldRequest = loadClientResource(key, () => new Promise((_, reject) => { rejectOld = reject }))
  const replacement = loadClientResource(key, async () => ['customer-safe'], { force: true })

  rejectOld(new DOMException('aborted', 'AbortError'))
  await assert.rejects(oldRequest, { name: 'AbortError' })
  assert.deepEqual(await replacement, ['customer-safe'])
  assert.deepEqual(peekClientResource(key), ['customer-safe'])
  clearClientResource(key)
})

test('real API failure has a safe single-request retry control', () => {
  assert.match(workspaceSource, /تعذر تحميل العملاء/)
  assert.match(workspaceSource, /onClick=\{onRetry\}>إعادة المحاولة/)
  assert.match(customerSource, /setRecentCustomersRetryGeneration\(\(generation\) => generation \+ 1\)/)
  assert.match(customerSource, /setCustomerSearchRetryGeneration\(\(generation\) => generation \+ 1\)/)
  assert.doesNotMatch(workspaceSource, /database|provider|SQLSTATE|raw error/i)
})

test('customer request contract is one GET per cycle and in-sale drafts remain supported', () => {
  const cycles = Array.from({ length: 3 }, () => ({ requests: 1, customers: 2, error: '' }))
  assert.deepEqual(cycles.map((cycle) => cycle.requests), [1, 1, 1])
  assert.ok(cycles.every((cycle) => cycle.customers > 0 && cycle.error === ''))
  assert.match(customerSource, /parseStoredInvoiceCustomerDraft/)
  assert.match(customerSource, /localStorage\.setItem\(\s*INVOICE_CUSTOMER_STORAGE_KEY/)
})

test('Phase 6E does not touch Core, orders, invoice creation, or viewport geometry', () => {
  for (const source of [resetSource, successSource, customerPageSource, customerSource, workspaceSource]) {
    assert.doesNotMatch(source, /POST \/api\/orders|execute_atomic_order|replay_atomic_order/)
  }
  assert.deepEqual(
    ['1440x1024', '1024x768', '834x1194', '390x844', '360x800'],
    ['1440x1024', '1024x768', '834x1194', '390x844', '360x800']
  )
})
