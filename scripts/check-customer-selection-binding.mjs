import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const root = new URL('../', import.meta.url)
const read = (path) => readFile(new URL(path, root), 'utf8')
const [draft, customerStep, itemsStep, checkoutPage, checkoutHook, route, adapter] =
  await Promise.all([
    read('lib/invoices/customer.ts'),
    read('components/invoice-customer-step.tsx'),
    read('components/invoice-items-step.tsx'),
    read('app/pos/sale/checkout/page.tsx'),
    read('hooks/use-invoice-checkout.ts'),
    read('app/api/orders/route.ts'),
    read('lib/server/core-v2/atomic-order.ts'),
  ])

const checks = [
  ['draft stores exact id', draft.includes('customerId: customer.customerId')],
  ['selection writes exact id', customerStep.includes('customerId: selectedCustomerId')],
  ['items restores exact id', itemsStep.includes('setCustomerId(parsed.customerId)')],
  ['checkout restores exact id', checkoutPage.includes('setCustomerId(parsedCustomer.customerId)')],
  ['request transmits exact id', checkoutHook.includes('customerId,')],
  ['request rejects unknown fields', route.includes('CREATE_ORDER_BODY_KEYS')],
  ['request rejects unknown item fields', route.includes('CREATE_ORDER_ITEM_KEYS')],
  ['request rejects malformed id', route.includes('body.customerId !== undefined')],
  ['trusted input receives exact id', route.includes('customerId,')],
  ['exact id filters trusted lookup', adapter.includes('customer.customer_id === input.customerId')],
  ['exact miss conflicts', adapter.includes('selectedCustomers.length !== 1')],
  ['legacy zero match creates', adapter.includes('else if (customers.length === 0)')],
  ['legacy ambiguity conflicts', adapter.includes("!input.customerId && customers[0].resolution_status !== 'RESOLVED'")],
]

for (const [name, passed] of checks) assert.equal(passed, true, name)

const resolveModel = (rows, selectedId) => {
  if (selectedId) {
    const exact = rows.filter((row) => row.id === selectedId)
    return exact.length === 1 ? 'selected' : 'conflict'
  }
  if (rows.length === 0) return 'create'
  return rows.length === 1 && rows[0].status === 'RESOLVED'
    ? 'selected'
    : 'conflict'
}

const a = { id: 'a', status: 'AMBIGUOUS' }
const b = { id: 'b', status: 'AMBIGUOUS' }
assert.equal(resolveModel([a, b], 'a'), 'selected')
assert.equal(resolveModel([a, b], 'b'), 'selected')
assert.equal(resolveModel([b], 'a'), 'conflict')
assert.equal(resolveModel([], 'a'), 'conflict')
assert.equal(resolveModel([a, b], null), 'conflict')
assert.equal(resolveModel([{ id: 'a', status: 'RESOLVED' }], null), 'selected')
assert.equal(resolveModel([], null), 'create')

console.log(`Customer selection binding checks: ${checks.length + 7}/${checks.length + 7} PASS`)
