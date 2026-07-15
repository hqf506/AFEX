import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'
import ts from 'typescript'

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

const source = fs.readFileSync(
  path.join(process.cwd(), 'lib', 'orders', 'effective-status.ts'),
  'utf8'
)
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
})

const { resolveEffectiveOrderStatus } = moduleValue.exports

assert(
  resolveEffectiveOrderStatus('in_progress', 'cancelled') === 'cancelled',
  'A cancelled invoice must override a non-cancelled raw order status.'
)
assert(
  resolveEffectiveOrderStatus('in_progress', 'paid') === 'in_progress',
  'A paid active order must remain in progress.'
)
assert(
  resolveEffectiveOrderStatus('ready', 'paid') === 'ready',
  'A ready order must remain ready.'
)
assert(
  resolveEffectiveOrderStatus('completed', 'paid') === 'delivered',
  'Completed aliases must remain delivered.'
)

console.log('Orders effective-status correctness checks passed.')
