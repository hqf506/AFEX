import fs from 'node:fs'
import path from 'node:path'

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

const routeSource = fs.readFileSync(
  path.join(process.cwd(), 'app', 'api', 'orders', 'route.ts'),
  'utf8'
)
const pageSource = fs.readFileSync(
  path.join(process.cwd(), 'app', 'admin', 'orders', 'page.tsx'),
  'utf8'
)

assert(
  routeSource.includes(".select('id', { count: 'exact', head: true })"),
  'Orders status summary must use count-only queries.'
)
assert(
  !routeSource.includes("from('orders').select('status')"),
  'Orders status summary must not transfer every matching status row.'
)
assert(
  routeSource.includes('ordersPagePromise') &&
    routeSource.includes('summaryPromise') &&
    routeSource.includes('await Promise.all(['),
  'Orders page and status summary must be loaded in parallel.'
)
assert(
  pageSource.includes(".in('metadata->>order_id', [...orderIds])"),
  'WhatsApp audit lookup must be scoped to visible order UUIDs.'
)
assert(
  pageSource.includes('if (!allowed || !tenantId || orders.length === 0) return'),
  'WhatsApp audit lookup must be skipped when no orders are visible.'
)
assert(
  pageSource.includes('document.hidden ||') &&
    pageSource.includes('orders.length === 0 ||'),
  'Orders polling must stop while hidden or when no orders are visible.'
)

console.log('Orders performance regression checks passed.')
