import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'

import {
  PAYMENT_METHODS,
  canonicalPaymentMethodIdentity,
  getCanonicalPosPaymentConfiguration,
  getPaymentMethodLabel,
  migrateLegacyPosPaymentConfiguration,
  parsePosPaymentConfiguration,
} from '../lib/invoices/payment-method.ts'

const root = path.resolve('.')
const read = (relative) => readFile(path.join(root, relative), 'utf8')

const expectedMethods = [
  { id: 'mada', label: 'مدى', enabled: true, displayOrder: 1 },
  { id: 'cash', label: 'نقدي', enabled: true, displayOrder: 2 },
  { id: 'visa', label: 'فيزا', enabled: true, displayOrder: 3 },
  {
    id: 'cod',
    label: 'الدفع عند الاستلام',
    enabled: true,
    displayOrder: 4,
  },
]

const legacyMethods = [
  { id: 'mada', label: 'مدى' },
  { id: 'cash', label: 'نقدي' },
  { id: 'visa', label: 'فيزا' },
  { id: 'cod', label: 'الدفع عند الاستلام' },
  { id: 'card', label: 'بطاقة' },
  { id: 'bank_transfer', label: 'تحويل بنكي' },
  { id: 'transfer', label: 'تحويل' },
  { id: 'on_delivery', label: 'عند الاستلام' },
]

test('canonical authority exposes the exact approved Online and Offline methods', () => {
  const configuration = getCanonicalPosPaymentConfiguration()
  assert.deepEqual([...PAYMENT_METHODS], expectedMethods)
  assert.deepEqual([...configuration.methods], expectedMethods)
  assert.equal(parsePosPaymentConfiguration(configuration), configuration)
  assert.equal(new Set(configuration.methods.map((method) => method.id)).size, 4)
  assert.deepEqual(
    configuration.methods.map((method) => method.label),
    ['مدى', 'نقدي', 'فيزا', 'الدفع عند الاستلام']
  )
})

test('legacy snapshot migration removes disabled identities and deduplicates COD by canonical identity', () => {
  const migrated = migrateLegacyPosPaymentConfiguration(legacyMethods)
  assert.ok(migrated)
  assert.deepEqual([...migrated.methods], expectedMethods)
  assert.equal(canonicalPaymentMethodIdentity('on_delivery'), 'cod')
  assert.equal(canonicalPaymentMethodIdentity('card'), null)
  assert.equal(canonicalPaymentMethodIdentity('transfer'), null)
  assert.equal(canonicalPaymentMethodIdentity('bank_transfer'), null)
})

test('missing, malformed, duplicate, stale and near-match configurations fail closed', () => {
  const canonical = getCanonicalPosPaymentConfiguration()
  assert.equal(parsePosPaymentConfiguration(null), null)
  assert.equal(
    parsePosPaymentConfiguration({
      ...canonical,
      methods: [...canonical.methods, canonical.methods[0]],
    }),
    null
  )
  assert.equal(
    parsePosPaymentConfiguration({ ...canonical, legacyFallback: true }),
    null
  )
  assert.equal(
    parsePosPaymentConfiguration({
      ...canonical,
      methods: canonical.methods.map((method) =>
        method.id === 'visa' ? { ...method, enabled: false } : method
      ),
    }),
    null
  )
  assert.equal(
    migrateLegacyPosPaymentConfiguration(
      legacyMethods.map((method) =>
        method.id === 'transfer' ? { ...method, label: 'تحويل قديم' } : method
      )
    ),
    null
  )
})

test('historical labels remain readable without becoming enabled checkout choices', () => {
  assert.equal(getPaymentMethodLabel('card'), 'بطاقة')
  assert.equal(getPaymentMethodLabel('bank_transfer'), 'تحويل بنكي')
  assert.equal(getPaymentMethodLabel('transfer'), 'تحويل')
  assert.equal(getPaymentMethodLabel('on_delivery'), 'عند الاستلام')
  assert.deepEqual(
    PAYMENT_METHODS.map((method) => method.id),
    ['mada', 'cash', 'visa', 'cod']
  )
})

test('Online API and encrypted Offline snapshot publish the same canonical configuration', async () => {
  const [runtimeRoute, snapshotRoute, runtime] = await Promise.all([
    read('app/api/pos/runtime/route.ts'),
    read('app/api/pos/offline-read-snapshot/route.ts'),
    read('lib/offline/complete-runtime.ts'),
  ])
  assert.match(runtimeRoute, /paymentConfiguration: getCanonicalPosPaymentConfiguration\(\)/u)
  assert.match(snapshotRoute, /paymentConfiguration: getCanonicalPosPaymentConfiguration\(\)/u)
  assert.match(runtime, /parsePosPaymentConfiguration\(\s*runtime\.runtime\.paymentConfiguration/u)
  assert.match(runtime, /parsePosPaymentConfiguration\(\s*readSnapshot\.paymentConfiguration/u)
  assert.match(runtime, /OFFLINE_REQUIRED_DATASET_INVALID:paymentConfiguration/u)
  assert.match(runtime, /recordKey: PAYMENT_CONFIGURATION_RECORD_KEY,[\s\S]{0,100}value: paymentConfiguration/u)
})

test('installed legacy snapshots migrate atomically without clearing storage or reprovisioning a device', async () => {
  const runtime = await read('lib/offline/complete-runtime.ts')
  const migrationStart = runtime.indexOf('async function migrateLegacyOfflinePaymentSnapshot')
  const migrationEnd = runtime.indexOf('async function readOfflineReadCompleteness', migrationStart)
  const migration = runtime.slice(migrationStart, migrationEnd)
  for (const dataset of ['catalog', 'customers', 'orders', 'runtimeSettings']) {
    assert.match(migration, new RegExp(`'${dataset}'`, 'u'))
  }
  assert.match(migration, /retainedSnapshotVersions/u)
  assert.match(migration, /READ_COMPLETENESS_RECORD_KEY/u)
  assert.ok(
    migration.lastIndexOf('READ_COMPLETENESS_RECORD_KEY') >
      migration.lastIndexOf("'runtimeSettings'")
  )
  assert.doesNotMatch(migration, /device\.provision|register|replace|revoke|deleteDatabase/u)
  assert.match(runtime, /migrateLegacyPosPaymentConfiguration/u)
  assert.match(runtime, /OFFLINE_PAYMENT_CONFIGURATION_INVALID/u)
})

test('checkout resolves verified methods across reload/fallback and remains mutation-disabled Offline', async () => {
  const [page, workspace] = await Promise.all([
    read('app/pos/sale/checkout/page.tsx'),
    read('components/pos-checkout-workspace.tsx'),
  ])
  assert.match(page, /readOfflinePaymentConfiguration/u)
  assert.match(page, /parsePosPaymentConfiguration/u)
  assert.match(page, /availablePaymentMethods\.map/u)
  assert.match(page, /paymentConfigurationError/u)
  assert.match(page, /if \(isOffline\) \{\s*return false/u)
  assert.doesNotMatch(page, /PAYMENT_METHODS\.map/u)
  assert.match(workspace, /props\.paymentMethods\.map/u)
  assert.doesNotMatch(workspace, /PAYMENT_METHODS/u)
})
