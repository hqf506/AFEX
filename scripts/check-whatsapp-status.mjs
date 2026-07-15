import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'
import ts from 'typescript'

const sourcePath = path.join(
  process.cwd(),
  'lib',
  'orders',
  'whatsapp-status.ts'
)
const source = fs.readFileSync(sourcePath, 'utf8')
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2020,
  },
}).outputText
const moduleValue = { exports: {} }

vm.runInNewContext(compiled, {
  exports: moduleValue.exports,
  module: moduleValue,
  Set,
  String,
})

const {
  buildWhatsAppStatusByOrderId,
  mergePersistentWhatsAppStatuses,
} = moduleValue.exports

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

const currentOrderId = '11111111-1111-4111-8111-111111111111'
const oldMonthlyOrderId = '22222222-2222-4222-8222-222222222222'
const sharedOrderNumber = '02-0026'
const logs = [
  {
    action: 'whatsapp.message_sent',
    created_at: '2026-07-15T15:47:00.000Z',
    metadata: {
      order_id: currentOrderId,
      order_number: sharedOrderNumber,
      provider_status: 'delivered',
    },
  },
  {
    action: 'whatsapp.message_failed',
    created_at: '2026-05-18T21:10:00.000Z',
    metadata: {
      order_id: oldMonthlyOrderId,
      order_number: sharedOrderNumber,
      status: 'failed',
    },
  },
]

const persistent = buildWhatsAppStatusByOrderId(logs, [
  currentOrderId,
  oldMonthlyOrderId,
])
assert(persistent[currentOrderId] === 'sent', 'delivered must map to sent')
assert(persistent[oldMonthlyOrderId] === 'failed', 'UUIDs must remain isolated')

const merged = mergePersistentWhatsAppStatuses(
  { [currentOrderId]: 'not_sent' },
  persistent
)
assert(
  merged[currentOrderId] === 'sent',
  'persistent status must override the default state after reload'
)

console.log('WhatsApp status persistence checks passed.')
