import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'
import ts from 'typescript'

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

const helperPath = path.join(
  process.cwd(),
  'lib',
  'performance',
  'server-timing.ts'
)
const helperSource = fs.readFileSync(helperPath, 'utf8')
const compiled = ts.transpileModule(helperSource, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText

function loadHelper(env) {
  const moduleValue = { exports: {} }
  const context = {
    exports: moduleValue.exports,
    module: moduleValue,
    process: { env },
    performance,
    Response,
    Set,
  }
  vm.runInNewContext(compiled, context)
  return moduleValue.exports
}

for (const env of [
  { NODE_ENV: 'development' },
  { NODE_ENV: 'production', VERCEL_ENV: 'preview' },
]) {
  const { createServerTiming } = loadHelper(env)
  const timing = createServerTiming()
  const value = await timing.measure('orders', async () => 42)
  assert(value === 42, 'Async measure must preserve its result.')
  const response = timing.finish(new Response('{}'))
  const header = response.headers.get('Server-Timing') || ''
  assert(header.includes('orders;dur='), 'Detailed timing must be enabled.')
  assert(header.includes('total;dur='), 'Server-Timing must contain total.')
  for (const duration of header.matchAll(/;dur=([0-9.]+)/g)) {
    assert(Number.isFinite(Number(duration[1])), 'Durations must be numeric.')
    assert(Number(duration[1]) >= 0, 'Durations must be non-negative.')
  }
}

{
  const { createServerTiming } = loadHelper({
    NODE_ENV: 'production',
    VERCEL_ENV: 'production',
  })
  const response = createServerTiming().finish(new Response('{}'))
  assert(
    !response.headers.has('Server-Timing'),
    'Detailed timing must be disabled in production.'
  )
}

{
  const { createServerTiming } = loadHelper({ NODE_ENV: 'development' })
  const originalError = new Error('original')
  let receivedError
  try {
    await createServerTiming().measure('orders', async () => {
      throw originalError
    })
  } catch (error) {
    receivedError = error
  }
  assert(receivedError === originalError, 'Async measure must preserve errors.')
}

{
  const { createServerTiming } = loadHelper({ NODE_ENV: 'development' })
  let active = 0
  let maxActive = 0
  await Promise.all(
    ['orders', 'catalog'].map((name) =>
      createServerTiming().measure(name, async () => {
        active += 1
        maxActive = Math.max(maxActive, active)
        await new Promise((resolve) => setTimeout(resolve, 10))
        active -= 1
      })
    )
  )
  assert(maxActive === 2, 'Measured Promise.all work must remain parallel.')
}

const routePaths = [
  'app/api/orders/route.ts',
  'app/api/admin/inventory/route.ts',
  'app/api/admin/reports/summary/route.ts',
  'app/api/admin/reports/sales-performance/route.ts',
  'app/api/pos/runtime/route.ts',
  'app/api/invoice/catalog/route.ts',
  'app/api/customers/route.ts',
  'app/api/admin/inventory-movements/route.ts',
  'app/api/admin/receipts/[id]/cancel/route.ts',
]

for (const routePath of routePaths) {
  const source = fs.readFileSync(path.join(process.cwd(), routePath), 'utf8')
  assert(
    source.includes('createServerTiming') ||
      source.includes('createReportServerTiming'),
    `${routePath} must use the shared timing helper.`
  )
}

assert(
  !helperSource.includes('console.'),
  'The timing helper must not write detailed console logs.'
)
const timingNames = [...helperSource.matchAll(/'([a-z]+)'/g)]
  .map((match) => match[1])
  .join(',')
assert(
  !['token', 'secret', 'cookie', 'tenant_id', 'branch_id', 'user_id', 'http']
    .some((unsafeValue) => timingNames.includes(unsafeValue)),
  'Timing names must not contain IDs, tokens, cookies, or URLs.'
)

console.log('Server timing regression checks passed.')
