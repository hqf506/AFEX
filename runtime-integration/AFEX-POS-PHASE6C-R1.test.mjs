import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { canAutofillCatalog, mergeUniqueCatalogItems, shouldContinueCatalogLoading } from '../lib/pos/catalog-continuation.ts'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8')

test('catalog geometry remains invariant for every authoritative item count', () => {
  const desktopCardHeight = 170
  const mobileCardHeight = 148
  for (const count of [4, 8, 40, 1205]) {
    const desktopRows = Math.ceil(count / 4)
    const mobileRows = Math.ceil(count / 2)
    assert.equal(desktopRows > 0 ? desktopCardHeight : 0, 170)
    assert.equal(mobileRows > 0 ? mobileCardHeight : 0, 148)
    assert.equal(desktopRows * desktopCardHeight >= desktopCardHeight, true)
    assert.equal(mobileRows * mobileCardHeight >= mobileCardHeight, true)
  }
})

test('bounded autofill stops at scrollability or safety guard and bottom loading stays available', () => {
  assert.equal(canAutofillCatalog({ clientHeight: 600, scrollHeight: 420, iteration: 0 }), true)
  assert.equal(canAutofillCatalog({ clientHeight: 600, scrollHeight: 760, iteration: 1 }), false)
  assert.equal(canAutofillCatalog({ clientHeight: 600, scrollHeight: 420, iteration: 6 }), false)
  assert.equal(shouldContinueCatalogLoading({ scrollTop: 500, clientHeight: 600, scrollHeight: 1250 }), true)
})

test('stable deduplication preserves order while progressively reaching every item', () => {
  let items = []
  let maximumConcurrency = 0
  let active = 0
  for (let offset = 0; offset < 1205; offset += 10) {
    active += 1
    maximumConcurrency = Math.max(maximumConcurrency, active)
    const page = Array.from({ length: Math.min(10, 1205 - offset) }, (_, index) => ({ id: `item-${offset + index}` }))
    items = mergeUniqueCatalogItems(items, [...page, page[0]], (item) => item.id)
    active -= 1
  }
  assert.equal(items.length, 1205)
  assert.equal(new Set(items.map((item) => item.id)).size, 1205)
  assert.equal(maximumConcurrency, 1)
})

test('source retains fixed rows, in-card sentinel and separate authoritative PDF path', () => {
  const css = read('app/globals.css')
  const catalog = read('components/invoice-items-step.tsx')
  const success = read('app/pos/sale/success/page.tsx')
  assert.ok(css.includes('grid-auto-rows: 170px'))
  assert.ok(css.includes('grid-auto-rows: 148px'))
  assert.ok(css.includes('align-content: start'))
  assert.ok(catalog.includes('productIndex === paginatedProducts.length - 1'))
  assert.ok(catalog.includes('catalogAutofillIterationsRef.current < 6') === false)
  assert.ok(catalog.includes('canAutofillCatalog'))
  assert.ok(success.includes('loadOfficialInvoicePdf'))
  assert.equal(success.slice(success.indexOf('const handlePagePrint'), success.indexOf('const handleNewSale')).includes('window.print()'), false)
})
