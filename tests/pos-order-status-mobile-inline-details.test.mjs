import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const page = readFileSync(new URL('../app/pos/order-status/page.tsx', import.meta.url), 'utf8')
const css = readFileSync(new URL('../app/pos/order-status/order-status.module.css', import.meta.url), 'utf8')

test('mobile details are adjacent to their authoritative order row inside the mapping', () => {
  const mapStart = page.indexOf('filteredOrders.map((order) =>')
  const loadMore = page.indexOf("hasMore && filteredOrders.length > 0", mapStart)
  const inlineDetails = page.indexOf('<OrderDetailsPanel id={detailsId} inline', mapStart)
  const desktopDetails = page.indexOf('<OrderDetailsPanel order={selectedOrder}', mapStart)
  assert.ok(mapStart >= 0 && inlineDetails > mapStart && inlineDetails < loadMore)
  assert.ok(desktopDetails > loadMore)
  assert.match(page.slice(mapStart, loadMore), /<Fragment key=\{order\.id\}>[\s\S]*?<button[\s\S]*?<OrderDetailsPanel id=\{detailsId\} inline/)
})

test('one selectedId drives one inline panel and same-card taps collapse only on phones', () => {
  assert.match(page, /const expanded = order\.id === selectedId/)
  assert.match(page, /phoneLayout && current === orderId \? null : orderId/)
  assert.match(page, /\{expanded \? <OrderDetailsPanel[^>]+inline/)
  assert.doesNotMatch(page, /window\.scrollTo|document\.body\.scrollHeight/)
})

test('mobile disclosure accessibility is bound to a stable details id', () => {
  assert.match(page, /const detailsId = `pos-order-status-details-\$\{order\.id\}`/)
  assert.match(page, /aria-expanded=\{expanded\}/)
  assert.match(page, /aria-controls=\{detailsId\}/)
  assert.match(page, /aria-label=\{`عرض تفاصيل الطلب \$\{order\.order_number\}`\}/)
})

test('search and refresh cannot leave an orphaned mobile details panel', () => {
  assert.match(page, /!selectedId \|\| filteredOrders\.some\(\(order\) => order\.id === selectedId\)\) return/)
  assert.match(page, /setSelectedId\(\(current\) => current === selectedId \? null : current\)/)
  assert.match(page, /current && nextOrders\.some\(\(order\) => order\.id === current\) \? current : phoneLayout \? null/)
  assert.match(page, /new Map\(\(requestedPage === 1 \? \[\] : current\)/)
})

test('opening details is state-only and status mutation remains behind the deliberate action', () => {
  const selectOrder = page.slice(page.indexOf('const selectOrder'), page.indexOf('const advance'))
  assert.doesNotMatch(selectOrder, /fetch\(|supabase|\.update\(/)
  assert.match(page, /onClick=\{\(\) => onAdvance\(order\)\}/)
  assert.match(page, /disabled=\{updatingId !== null\}/)
  assert.match(page, /supabase\.from\('orders'\)\.update\(\{ status: nextStatus \}\)/)
  assert.match(page, /\.eq\('tenant_id', access\.tenantId\)\.eq\('branch_id', access\.branchId\)/)
})

test('phone breakpoint is SSR-safe and leaves protected widths on desktop details', () => {
  assert.match(page, /const PHONE_LAYOUT_QUERY = '\(max-width: 767\.98px\)'/)
  assert.match(page, /SHORT_PHONE_LANDSCAPE_QUERY = '\(max-height: 500px\) and \(hover: none\) and \(pointer: coarse\)'/)
  assert.match(css, /\.inlineDetails \{\s*display: none !important;/)
  assert.match(css, /@media \(max-width: 767\.98px\), \(max-height: 500px\) and \(hover: none\) and \(pointer: coarse\)/)
  assert.match(css, /\.desktopDetails \{\s*display: none !important;/)
  assert.doesNotMatch(page, /navigator\.userAgent|userAgentData/)
})

test('mobile cards provide immediate pressed, selected, focus, and reduced-motion feedback', () => {
  assert.match(css, /\.mobileOrderRow:active \{[\s\S]*?transform: scale\(\.99\)/)
  assert.match(css, /\.mobileOrderRow\[data-mobile-expanded='true'\] \{[\s\S]*?var\(--afex-pos-bronze\)/)
  assert.match(css, /\.mobileOrderRow:focus-visible \{[\s\S]*?var\(--afex-pos-bronze\)/)
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)[\s\S]*?transition: none/)
  assert.doesNotMatch(css, /emerald|cyan|green/i)
})

test('inline panel is content-driven, connected, overflow-safe, and keeps a 48px action', () => {
  assert.match(css, /\.inlineDetails \{[\s\S]*?max-height: none;[\s\S]*?margin: -1px 0 0;[\s\S]*?overflow: visible;/)
  assert.match(css, /:global\(\.pos-status-workspace\) \{\s*grid-template-columns: minmax\(0, 1fr\)/)
  assert.match(css, /\.inlineDetails :global\(\.pos-status-details-body\) \{[\s\S]*?max-height: none;[\s\S]*?overflow: visible;/)
  assert.match(css, /border-radius: 0 0 14px 14px/)
  assert.match(css, /\[data-order-status-action\] button \{[\s\S]*?min-height: 48px/)
  assert.doesNotMatch(css, /position:\s*(fixed|sticky)|(?:^|\n)\s*height:\s*\d+px/m)
})

test('nearest scrolling respects reduced motion and never targets the page bottom', () => {
  assert.match(page, /if \(phoneLayout && reducedMotion\) row\.scrollIntoView\(\{ block: 'nearest', inline: 'nearest', behavior: 'auto' \}\)/)
  assert.match(page, /else row\.scrollIntoView\(\{ block: 'nearest', inline: 'nearest', behavior: 'smooth' \}\)/)
  assert.match(page, /prefers-reduced-motion: reduce/)
  assert.doesNotMatch(page, /scrollHeight|scrollTo\(/)
})

test('no broad global CSS file is changed by the focused mobile module contract', () => {
  assert.match(page, /import styles from '\.\/order-status\.module\.css'/)
  assert.match(css, /\.orderStatusPage \.inlineDetails/)
  assert.doesNotMatch(css, /(^|\n)\s*(html|body|button|aside|main|section)\s*\{/)
})
