import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import {
  mergeUniqueCatalogItems,
  shouldContinueCatalogLoading,
} from '../lib/pos/catalog-continuation.ts'
import { classifyPosDevice } from '../lib/pos/device-label.ts'
import { getPinIndicatorState } from '../lib/pos/pin-indicators.ts'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8')

test('PIN indicators cover empty, entry, deletion and completed states', () => {
  assert.deepEqual(getPinIndicatorState(0), [false, false, false, false])
  assert.deepEqual(getPinIndicatorState(3), [true, true, true, false])
  assert.deepEqual(getPinIndicatorState(2), [true, true, false, false])
  assert.deepEqual(getPinIndicatorState(4), [true, true, true, true])
})

test('device label is coarse and avoids fingerprint-like detail', () => {
  assert.equal(
    classifyPosDevice('Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/141.0.0.0 Safari/537.36'),
    'كمبيوتر • Chrome'
  )
  assert.equal(
    classifyPosDevice('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Version/18.0 Mobile/15E148 Safari/604.1', 5),
    'جوال • Safari'
  )
  assert.equal(classifyPosDevice('custom-agent'), 'جهاز غير معروف')
})

test('large progressive catalog is stable and duplicate free', () => {
  let catalog = []
  for (let page = 0; page < 60; page += 1) {
    const items = Array.from({ length: 25 }, (_, index) => ({
      id: `item-${page * 20 + index}`,
    }))
    catalog = mergeUniqueCatalogItems(catalog, items, (item) => item.id)
  }
  assert.equal(catalog.length, 1205)
  assert.equal(new Set(catalog.map((item) => item.id)).size, catalog.length)
  assert.equal(shouldContinueCatalogLoading({ scrollTop: 600, clientHeight: 400, scrollHeight: 1200 }), true)
  assert.equal(shouldContinueCatalogLoading({ scrollTop: 100, clientHeight: 400, scrollHeight: 1200 }), false)
})

test('Phase 6B visual and privacy contracts are present', () => {
  const pin = read('app/pos/employee-pin/page.tsx')
  const customer = read('components/pos-customer-workspace.tsx')
  const items = read('components/invoice-items-step.tsx')
  const checkout = read('components/pos-checkout-workspace.tsx')
  const success = read('components/pos-invoice-success-workspace.tsx')
  const styles = read('app/globals.css')
  const activePosItems = items.slice(
    items.indexOf("if (variant === 'pos')"),
    items.indexOf('const renderLegacyPosItemsLayout')
  )

  assert.ok(pin.includes('getCurrentPosDeviceLabel') && pin.includes('getPinIndicatorState'))
  assert.ok(!customer.includes('maskPhone'))
  assert.ok(activePosItems.includes('onScroll={handleCatalogScroll}'))
  assert.ok(items.includes('catalogAdvancePendingRef.current'))
  assert.ok(activePosItems.includes('تحميل المزيد') && !activePosItems.includes('السابق'))
  assert.ok(checkout.includes('afex-checkout-summary-note'))
  assert.ok(checkout.includes('function PaymentIcon') && !checkout.includes('paymentMark'))
  assert.ok(success.includes('afex-success-new-sale'))
  assert.ok(styles.includes('animation: afex-new-sale-attention .65s ease-out 2'))
  assert.ok(styles.includes('::selection') && styles.includes('.afex-sale-complete-button'))
})
