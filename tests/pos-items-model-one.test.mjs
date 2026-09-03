import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import test from 'node:test'

const [component, styles, shell, page] = await Promise.all([
  readFile(resolve('components/invoice-items-step.tsx'), 'utf8'),
  readFile(resolve('components/pos-items-model-one.module.css'), 'utf8'),
  readFile(resolve('components/pos-shell/pos-responsive-shell.tsx'), 'utf8'),
  readFile(resolve('app/pos/sale/items/page.tsx'), 'utf8'),
])

const posBranch = component.slice(
  component.indexOf("if (variant === 'pos')"),
  component.indexOf('const renderLegacyPosItemsLayout')
)

test('Model 1 uses the authoritative catalog categories instead of invented labels', () => {
  assert.match(posBranch, /const posCategoryLabels = invoiceFilters\.filter/)
  assert.match(posBranch, /posCategoryLabels\.map/)
  assert.doesNotMatch(posBranch, /squarePosCategoryLabels|\['الخدمات',\s*'المنتجات'/)
})

test('product cards render one full-bleed cover image without a separate white frame', () => {
  assert.match(posBranch, /presentation="model-one"/)
  assert.match(styles, /\.productImageFrame\s*\{[\s\S]*?position:\s*absolute !important;[\s\S]*?inset:\s*0;/)
  assert.match(component, /presentation === 'model-one'[\s\S]*?object-cover object-center/)
  assert.doesNotMatch(posBranch, /afex-sale-product-media|afex-sale-product-copy/)
})

test('every Model 1 card overlays a translucent black name strip with white text', () => {
  assert.match(posBranch, /className=\{modelOneStyles\.productNameStrip\}/)
  assert.match(styles, /\.productNameStrip\s*\{[\s\S]*?inset-inline:\s*0;[\s\S]*?bottom:\s*0;[\s\S]*?color:\s*#fff;[\s\S]*?background:\s*rgb\(10 8 6 \/ 0\.73\);/)
  assert.match(styles, /-webkit-line-clamp:\s*2/)
})

test('catalog grid reserves a complete implicit row for every aspect-ratio card', () => {
  const gridRule = styles.match(/\.productGrid\s*\{([\s\S]*?)\n\}/)?.[1] ?? ''
  const cardRule = styles.match(/\.productCard\s*\{([\s\S]*?)\n\}/)?.[1] ?? ''

  assert.doesNotMatch(gridRule, /(?:^|\n)\s*height:\s*100%;/)
  assert.match(gridRule, /height:\s*auto;/)
  assert.match(gridRule, /max-height:\s*100%;/)
  assert.match(gridRule, /grid-auto-rows:\s*max-content;/)
  assert.match(gridRule, /align-items:\s*start;/)
  assert.match(gridRule, /overflow-y:\s*auto;/)
  assert.match(cardRule, /width:\s*100%;/)
  assert.match(cardRule, /aspect-ratio:\s*0\.93;/)
  assert.match(cardRule, /align-self:\s*start;/)
  assert.doesNotMatch(cardRule, /position:\s*absolute|margin(?:-block|-top|-bottom)?:\s*-/)
})

test('Model 1 active source and styles contain zero forbidden cyan or green-family tokens', () => {
  const forbidden = /cyan|emerald|green/giu
  assert.deepEqual(posBranch.match(forbidden), null)
  assert.deepEqual(styles.match(forbidden), null)
})

test('cards show factual price, selected quantity and out-of-stock state from current data', () => {
  for (const contract of [
    'formatCurrency(product.price)',
    'productCartQuantity > 0',
    'aria-pressed={productCartQuantity > 0}',
    'productOutOfStock',
    'reachedStockLimit',
  ]) assert.ok(posBranch.includes(contract), `missing product-state contract: ${contract}`)
})

test('missing images use the dedicated factual Model 1 fallback', () => {
  assert.match(component, /data-catalog-image-fallback="model-one"/)
  assert.match(component, /لا توجد صورة متاحة/)
  assert.match(styles, /\.placeholder\s*\{/)
  assert.match(posBranch, /<PosCatalogItemImage[\s\S]*?<span className=\{modelOneStyles\.productNameStrip\}>[\s\S]*?\{product\.name\}/)
})

test('search, category filtering, refresh and stale-request protections remain wired', () => {
  for (const contract of [
    'setSearch(event.target.value)',
    'setActiveFilter(filter)',
    'forceReloadCatalog({ showRefreshing: true })',
    'catalogGenerationRef.current',
    'isCurrentCatalogGeneration',
    'cancelled = true',
  ]) assert.ok(component.includes(contract), `missing catalog behavior: ${contract}`)
})

test('loading, empty and error states remain explicit and actionable', () => {
  for (const contract of [
    'جارٍ تحميل العناصر',
    'لا توجد نتائج مطابقة للبحث',
    'لا توجد منتجات أو خدمات متاحة لهذا الفرع',
    'تعذر تحميل العناصر',
    'إعادة المحاولة',
  ]) assert.ok(posBranch.includes(contract), `missing catalog state: ${contract}`)
})

test('cart keeps exactly one internal scroll body with fixed totals and actions', () => {
  for (const marker of [
    'data-mobile-cart-header',
    'data-mobile-cart-scroll-body',
    'data-mobile-cart-footer',
    'data-mobile-cart-totals',
    'data-mobile-cart-actions',
  ]) assert.ok(posBranch.includes(marker), `missing semantic cart marker: ${marker}`)
  assert.match(styles, /\.cart\s*\{[\s\S]*?grid-template-rows:\s*auto minmax\(0, 1fr\) auto !important;/)
  assert.match(styles, /\.cartBody\s*\{[\s\S]*?overflow-y:\s*auto !important;/)
  assert.match(styles, /\.cartFooter\s*\{[\s\S]*?align-self:\s*end;/)
})

test('cart lines retain actual quantity, delete, subtotal, tax, discount and final total behavior', () => {
  for (const contract of [
    'invoiceItems.map',
    'decreaseOrRemoveItem',
    'increaseQty(item)',
    'removeItem(item.item_name)',
    'formatCurrency(subtotal)',
    'checkout.discountAmount',
    'checkout.taxAmount',
    'checkout.finalTotal',
    'router.push(checkoutHref)',
  ]) assert.ok(posBranch.includes(contract), `missing cart behavior: ${contract}`)
})

test('responsive geometry uses dense five-column catalog and existing mobile cart sheet pattern', () => {
  assert.match(styles, /grid-template-columns:\s*repeat\(5, minmax\(0, 1fr\)\)/)
  assert.match(styles, /@media \(max-width: 1180px\) and \(min-width: 768px\)[\s\S]*?repeat\(4, minmax\(0, 1fr\)\)/)
  assert.match(styles, /@media \(max-width: 767px\)[\s\S]*?repeat\(2, minmax\(0, 1fr\)\)/)
  assert.match(styles, /\.cartOpen\s*\{[\s\S]*?display:\s*grid !important;/)
  assert.match(styles, /overflow-x:\s*hidden/)
})

test('categories remain an internal 44px scroll strip and item controls keep tablet hit areas', () => {
  const categoriesRule = styles.match(/\.categories\s*\{([\s\S]*?)\n\}/)?.[1] ?? ''
  const categoryButtonRule = styles.match(/\.categoryButton\s*\{([\s\S]*?)\n\}/)?.[1] ?? ''
  const clearSearchRule = styles.match(/\.clearSearch\s*\{([\s\S]*?)\n\}/)?.[1] ?? ''

  assert.match(categoriesRule, /width:\s*100%;/)
  assert.match(categoriesRule, /max-width:\s*100%;/)
  assert.match(categoriesRule, /overflow-x:\s*auto;/)
  assert.match(categoriesRule, /overflow-y:\s*hidden;/)
  assert.match(categoriesRule, /overscroll-behavior-inline:\s*contain;/)
  assert.match(categoriesRule, /contain:\s*inline-size;/)
  assert.match(categoryButtonRule, /min-height:\s*44px;/)
  assert.match(clearSearchRule, /width:\s*44px;/)
  assert.match(clearSearchRule, /height:\s*44px;/)
})

test('the generic sale header is replaced only on the items route and page styles stay scoped', () => {
  assert.match(shell, /const isItemsRoute = pathname === '\/pos\/sale\/items'/)
  assert.match(shell, /isSaleRoute && !isItemsRoute/)
  assert.match(posBranch, /data-testid="pos-sale-operational-header"/)
  assert.match(page, /styles\.page/)
  assert.doesNotMatch(page, /style jsx global/)
})
