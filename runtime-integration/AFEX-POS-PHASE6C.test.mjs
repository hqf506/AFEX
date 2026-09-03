import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import {
  isCatalogScrollContainerUnderfilled,
  isCurrentCatalogGeneration,
  mergeUniqueCatalogItems,
  shouldContinueCatalogLoading,
} from '../lib/pos/catalog-continuation.ts'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8')

async function loadSequentialCatalog({ total, pageSize, failPage, switchAfterPage }) {
  let items = []
  let page = 1
  let active = 0
  let maxActive = 0
  let generation = 1
  const requested = []
  let failed = false

  while (items.length < total) {
    const requestGeneration = generation
    active += 1
    maxActive = Math.max(maxActive, active)
    requested.push(page)
    await Promise.resolve()
    active -= 1
    if (switchAfterPage === page) generation += 1
    if (!isCurrentCatalogGeneration(requestGeneration, generation)) break
    if (failPage === page && !failed) { failed = true; continue }
    const incoming = Array.from({ length: Math.min(pageSize, total - items.length) }, (_, index) => ({ id: `item-${items.length + index}` }))
    items = mergeUniqueCatalogItems(items, incoming, (item) => item.id)
    page += 1
  }
  return { items, maxActive, requested }
}

test('catalog continuation covers empty, one, two, underfilled and 1,205-item sets sequentially', async () => {
  for (const total of [0, 10, 20, 25, 1205]) {
    const result = await loadSequentialCatalog({ total, pageSize: 10 })
    assert.equal(result.items.length, total)
    assert.equal(new Set(result.items.map((item) => item.id)).size, total)
    assert.equal(result.maxActive <= 1, true)
    assert.deepEqual(result.requested, Array.from({ length: Math.ceil(total / 10) }, (_, index) => index + 1))
  }
  assert.equal(isCatalogScrollContainerUnderfilled({ clientHeight: 600, scrollHeight: 420 }), true)
  assert.equal(isCatalogScrollContainerUnderfilled({ clientHeight: 600, scrollHeight: 900 }), false)
  assert.equal(shouldContinueCatalogLoading({ scrollTop: 250, clientHeight: 500, scrollHeight: 900 }), true)
})

test('failed intermediate page retries the same page and stale query generation is ignored', async () => {
  const retried = await loadSequentialCatalog({ total: 25, pageSize: 10, failPage: 2 })
  assert.deepEqual(retried.requested, [1, 2, 2, 3])
  assert.equal(retried.items.length, 25)
  const stale = await loadSequentialCatalog({ total: 25, pageSize: 10, switchAfterPage: 1 })
  assert.equal(stale.items.length, 0)
})

test('success PDF uses official authority and remains separate from thermal printing', () => {
  const page = read('app/pos/sale/success/page.tsx')
  const workspace = read('components/pos-invoice-success-workspace.tsx')
  const pdfClient = read('lib/invoices/official-pdf-client.ts')
  const catalog = read('components/invoice-items-step.tsx')
  const htmlPrint = page.slice(page.indexOf('const handlePagePrint'), page.indexOf('const handleNewSale'))

  assert.equal(htmlPrint.includes('window.print()'), false)
  assert.ok(htmlPrint.includes('loadOfficialInvoicePdf'))
  assert.ok(pdfClient.includes("fetch('/api/invoices/pdf'") && pdfClient.includes("application/pdf"))
  assert.ok(pdfClient.includes('snapshot.invoiceId') && pdfClient.includes('snapshot.orderId'))
  assert.ok(workspace.includes('طباعة الفاتورة PDF'))
  assert.ok(workspace.includes('طباعة الإيصال الحراري'))
  assert.ok(workspace.includes('disabled={!props.printingEnabled || props.printing}'))
  assert.ok(catalog.includes('IntersectionObserver') && catalog.includes('catalogScrollRootRef'))
  assert.ok(catalog.includes('isCatalogScrollContainerUnderfilled'))
})
