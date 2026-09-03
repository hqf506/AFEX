import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import test from 'node:test'

const pagePath = resolve('app/pos/order-history/page.tsx')
const stylesPath = resolve('app/pos/order-history/operations-history.module.css')
const page = await readFile(pagePath, 'utf8')
const styles = await readFile(stylesPath, 'utf8')
const mobileStart = styles.indexOf('@media (max-width: 767.98px)')
const landscapeStart = styles.indexOf('@media (max-height: 500px)', mobileStart)
const mobileStyles = styles.slice(mobileStart, landscapeStart)

test('mobile header exposes visible Arabic refresh and close labels', () => {
  assert.match(page, /<RefreshIcon \/><span>تحديث<\/span>/u)
  assert.match(page, /aria-label="إغلاق سجل العمليات"[^>]*><span aria-hidden="true">×<\/span><span>إغلاق<\/span>/u)
  assert.equal(mobileStyles.includes('span:not(:first-child)'), false)
  assert.match(mobileStyles, /\.actions button,[\s\S]*?height: 44px;/u)
})

test('the former icon-only close control cannot return on mobile', () => {
  assert.equal((page.match(/<span>إغلاق<\/span>/gu) || []).length >= 1, true)
  assert.equal(mobileStyles.includes('display: none;\n  }\n\n  .summary'), false)
})

test('mobile removes the operation selector without reserving a toolbar row', () => {
  assert.match(page, /className=\{styles\.filterField\}[\s\S]*?<select/u)
  assert.match(mobileStyles, /\.toolbar \{\s*grid-template-columns: minmax\(0, 1fr\);/u)
  assert.match(mobileStyles, /\.filterField \{\s*display: none;/u)
  assert.equal(mobileStyles.includes('min-height: 44px;\n  }\n\n  .filterField'), false)
})

test('every mapped operation exposes one labeled details button using the existing handler', () => {
  assert.equal((page.match(/<span>عرض التفاصيل<\/span>/gu) || []).length, 1)
  assert.equal((page.match(/className=\{styles\.detailsAction\}/gu) || []).length, 1)
  assert.match(page, /className=\{styles\.detailsAction\}[\s\S]*?event\.stopPropagation\(\); void openDetails\(operation\.order, event\.currentTarget\)/u)
})

test('the mobile details control is labeled, AFEX-toned and at least 44px tall', () => {
  assert.match(mobileStyles, /\.card \.detailsAction \{[\s\S]*?height: 44px;/u)
  assert.match(mobileStyles, /min-width: 112px;/u)
  assert.match(mobileStyles, /background: #fbf5e9;/u)
  assert.match(mobileStyles, /color: #79571d;/u)
  assert.match(mobileStyles, /\.detailsAction > span \{\s*display: inline;/u)
})

test('mobile cards use the required three-row semantic layout', () => {
  assert.match(page, /styles\.operation[\s\S]*?styles\.status/u)
  assert.match(page, /styles\.customer[\s\S]*?styles\.mobileTime/u)
  assert.match(page, /styles\.reference[\s\S]*?styles\.detailsAction/u)
  assert.match(mobileStyles, /grid-template-areas: 'operation status' 'customer time' 'reference action';/u)
})

test('mobile cards remain content-sized and cannot clip wrapped Arabic text', () => {
  const cardBlock = mobileStyles.match(/\.card \{([\s\S]*?)\n  \}/u)?.[1] || ''
  assert.match(cardBlock, /min-height: 112px;/u)
  assert.match(cardBlock, /padding: 12px;/u)
  assert.match(cardBlock, /gap: 6px 8px;/u)
  assert.match(cardBlock, /border-radius: 15px;/u)
  assert.doesNotMatch(cardBlock, /(^|\s)height:/u)
  assert.match(mobileStyles, /overflow-wrap: anywhere;/u)
})

test('mobile compacts the event wrapper instead of stacking marker and time above the card', () => {
  assert.match(mobileStyles, /grid-template-areas: 'marker card';/u)
  assert.match(mobileStyles, /margin-bottom: 10px;/u)
  assert.match(mobileStyles, /\.desktopTime \{\s*display: none;/u)
  assert.match(mobileStyles, /\.mobileTime \{\s*display: block;/u)
})

test('mobile references and timestamps preserve bidi isolation', () => {
  assert.match(page, /className=\{styles\.reference\} dir="ltr"/u)
  assert.match(mobileStyles, /\.mobileTime \{[\s\S]*?unicode-bidi: isolate;/u)
  assert.match(mobileStyles, /\.reference \{[\s\S]*?unicode-bidi: isolate;/u)
})

test('search and supported filtering behavior remain wired without query changes', () => {
  assert.match(page, /value=\{search\} onChange=\{\(event\) => setSearch\(event\.target\.value\)\}/u)
  assert.match(page, /filterPosOperations\(todayOperations, search, operationKind\)/u)
  assert.match(page, /todayRiyadh: '1'/u)
  assert.match(page, /loadRequestRef/u)
})

test('tablet and desktop keep the existing selector and icon-sized details action', () => {
  assert.match(page, /<option value="all">كل العمليات<\/option><option value="invoice">فواتير<\/option>/u)
  assert.match(styles, /\.toolbar \{ display: grid; grid-template-columns: minmax\(0, 1fr\) 235px;/u)
  assert.match(styles, /\.card button \{ display: grid; width: 34px; height: 44px;/u)
  assert.match(styles, /\.detailsAction > span \{ display: none; \}/u)
  assert.match(styles, /@media \(min-width: 768px\)[\s\S]*?\.card \{ height: 74px; \}/u)
})

test('short coarse-pointer landscape uses only the existing mobile contract', () => {
  assert.match(styles, /@media \(max-height: 500px\) and \(hover: none\) and \(pointer: coarse\)/u)
  assert.equal(styles.includes('@media (min-width: 768px) and (max-height: 500px)'), false)
})

test('the focused correction introduces no alternate business or data path', () => {
  for (const forbidden of ['/api/', 'supabase', 'rpc(', 'insert(', 'update(', 'delete(']) assert.equal(mobileStyles.toLowerCase().includes(forbidden), false)
  assert.equal(page.includes('router.push(\'/pos\')'), true)
})
