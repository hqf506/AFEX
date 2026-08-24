import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import test from 'node:test'

const read = (path) => readFile(resolve(path), 'utf8')

const [
  toggle,
  toggleStyles,
  globals,
  shell,
  items,
  itemsStyles,
  settings,
  history,
  invoices,
  orderStatus,
  checkoutStyles,
  checkoutWorkspace,
  successStyles,
  successWorkspace,
  successPage,
] = await Promise.all([
  read('components/pos-theme-toggle.tsx'),
  read('components/pos-theme-toggle.module.css'),
  read('app/globals.css'),
  read('components/pos-shell/pos-responsive-shell.tsx'),
  read('components/invoice-items-step.tsx'),
  read('components/pos-items-model-one.module.css'),
  read('app/pos/settings/page.tsx'),
  read('app/pos/order-history/page.tsx'),
  read('app/pos/invoices/page.tsx'),
  read('app/pos/order-status/page.tsx'),
  read('components/pos-checkout-workspace.module.css'),
  read('components/pos-checkout-workspace.tsx'),
  read('components/pos-invoice-success-workspace.module.css'),
  read('components/pos-invoice-success-workspace.tsx'),
  read('app/pos/sale/success/page.tsx'),
])

test('the Model 1 component is one all-device 48px control with no visible legacy label', () => {
  assert.equal((toggle.match(/data-pos-theme-toggle="model-one"/g) ?? []).length, 1)
  assert.doesNotMatch(toggle, /المظهر|legacyIcon|◐/u)
  assert.match(toggleStyles, /width:\s*48px !important/)
  assert.match(toggleStyles, /height:\s*48px !important/)
  assert.match(toggleStyles, /border-radius:\s*50% !important/)
  assert.match(toggleStyles, /\.actionIcon svg\s*\{[^}]*width:\s*24px;[^}]*height:\s*24px;/s)
  assert.doesNotMatch(toggleStyles, /max-width:\s*767|pointer:\s*coarse/)
})

test('the authoritative theme state and persistence mechanism remain singular', () => {
  assert.equal((toggle.match(/window\.localStorage\.setItem\(STORAGE_KEY, nextTheme\)/g) ?? []).length, 1)
  assert.equal((toggle.match(/document\.documentElement\.dataset\.posTheme = nextTheme/g) ?? []).length, 1)
  assert.match(toggle, /useSyncExternalStore\(subscribeToTheme, currentTheme, serverTheme\)/)
  assert.doesNotMatch(toggle, /useState|router\.|location\.reload/)
})

test('items integrates the shared control into its semantic catalog header rather than its cart', () => {
  const header = items.slice(items.indexOf('className={modelOneStyles.catalogHeader}'), items.indexOf('</header>', items.indexOf('className={modelOneStyles.catalogHeader}')))
  const cartHeader = items.slice(items.indexOf('data-mobile-cart-header'), items.indexOf('</header>', items.indexOf('data-mobile-cart-header')))
  assert.equal((header.match(/<PosThemeToggle \/>/g) ?? []).length, 1)
  assert.equal((cartHeader.match(/<PosThemeToggle \/>/g) ?? []).length, 0)
  assert.doesNotMatch(itemsStyles, /cartHeader[^\n]*afex-pos-theme-toggle/)
  assert.match(itemsStyles, /\.headerActions\s*\{[^}]*gap:\s*10px;/s)
})

test('specialized desktop headers consume the same component while responsive copies are non-focusable when hidden', () => {
  for (const source of [history, invoices, orderStatus]) {
    assert.equal((source.match(/<PosThemeToggle \/>/g) ?? []).length, 1)
    assert.match(source, /className="afex-pos-desktop-theme-control"/)
  }
  assert.match(globals, /@media \(max-width: 1199px\)[^{]*\{[\s\S]*?\.afex-pos-desktop-theme-control\s*\{\s*display:\s*none;/)
  assert.match(globals, /\.afex-pos-responsive-header,[\s\S]*?\{\s*display:\s*none;/)
})

test('all mandatory route families use the shared control without private icons or handlers', () => {
  assert.equal((shell.match(/<PosThemeToggle \/>/g) ?? []).length, 4)
  assert.equal((settings.match(/<PosThemeToggle \/>/g) ?? []).length, 1)
  assert.equal((items.match(/<PosThemeToggle \/>/g) ?? []).length, 1)
  const consumers = shell + settings + items + history + invoices + orderStatus
  assert.doesNotMatch(consumers, /data-pos-theme-icon=|localStorage\.setItem\('afex-pos-theme/)
})

test('checkout defines an explicit layered Dark palette and inherits native color scheme', () => {
  const dark = checkoutStyles.slice(checkoutStyles.indexOf(":global(html[data-pos-theme='dark']) .workspace"), checkoutStyles.indexOf('}', checkoutStyles.indexOf(":global(html[data-pos-theme='dark']) .workspace")))
  for (const token of ['--ivory: var(--afex-pos-base)', '--paper: var(--afex-pos-panel)', '--paper-muted: var(--afex-pos-card)', '--ink: var(--afex-pos-text)', '--muted: var(--afex-pos-text-secondary)', 'color-scheme: dark']) {
    assert.ok(dark.includes(token), `missing checkout dark token: ${token}`)
  }
  assert.doesNotMatch(checkoutStyles, /color-scheme:\s*light/)
})

test('checkout header, cards, inputs, action dock and drawer resolve through theme tokens', () => {
  assert.match(checkoutStyles, /afex-pos-app-shell[^}]*background:\s*var\(--afex-pos-base\)/s)
  assert.match(checkoutStyles, /afex-pos-sale-header[^}]*background:\s*var\(--afex-pos-raised\)/s)
  for (const selector of ['summary', 'customerCard', 'items', 'methods > button', 'paymentContext', 'options', 'actionDock', 'drawer']) {
    assert.match(checkoutStyles, new RegExp(`\\.${selector.replaceAll(' ', '\\s*')}[\\s\\S]*?background:\\s*var\\(--paper`))
  }
  assert.match(checkoutStyles, /\.cashFields input[^}]*background:\s*transparent/s)
  assert.match(checkoutStyles, /\.noteField textarea[^}]*background:\s*var\(--paper-muted\)/s)
})

test('checkout selected, unselected, focus and disabled states remain distinguishable in both themes', () => {
  assert.match(checkoutStyles, /\.methods > button\.selectedMethod[^}]*border-color:\s*var\(--gold\)/s)
  assert.match(checkoutStyles, /\.methods > button:hover[^}]*background:\s*var\(--paper-hover\)/s)
  assert.match(checkoutStyles, /\.submit:disabled[^}]*background:\s*var\(--disabled-surface\)/s)
  assert.match(checkoutStyles, /focus-visible[^}]*outline:\s*3px solid var\(--focus-ring\)/s)
})

test('success Model 4 defines complete Dark tokens without changing the simple hierarchy', () => {
  const dark = successStyles.slice(successStyles.indexOf(":global(html[data-pos-theme='dark']) .workspace"), successStyles.indexOf('}', successStyles.indexOf(":global(html[data-pos-theme='dark']) .workspace")))
  for (const token of ['--success-ivory: var(--afex-pos-base)', '--success-ivory-deep: var(--afex-pos-hover)', '--success-brown: #9a7540', '--success-gold: #c7aa72', '--success-ink: var(--afex-pos-text)', '--success-muted: var(--afex-pos-text-secondary)', '--success-line: var(--afex-pos-border)', 'color-scheme: dark']) {
    assert.ok(dark.includes(token), `missing success dark token: ${token}`)
  }
  assert.equal((successWorkspace.match(/data-success-primary-action/g) ?? []).length, 1)
  assert.equal((successWorkspace.match(/data-success-secondary-action=/g) ?? []).length, 3)
  assert.doesNotMatch(successStyles, /color-scheme:\s*light/)
})

test('success dialog and invalid surfaces resolve to Dark-compatible shared tokens', () => {
  assert.match(successStyles, /\.invoiceDialog\s*\{[^}]*background:\s*var\(--success-ivory\)/s)
  assert.match(successStyles, /\.invoiceDialog header button[^}]*background:\s*var\(--success-danger-soft\)/s)
  assert.match(successStyles, /\.invalidPage\s*\{[^}]*background:\s*var\(--afex-pos-base\)/s)
  assert.match(successStyles, /\.invalidState\s*\{[^}]*background:\s*var\(--afex-pos-panel\)/s)
})

test('checkout and success business contracts are unchanged by theme-only source edits', () => {
  assert.match(checkoutWorkspace, /onClick=\{props\.onSubmit\}/)
  assert.match(successPage, /parseStoredInvoiceSuccessSnapshot/)
  assert.match(successPage, /beginNewInvoiceSaleCycle/)
  assert.match(successPage, /normalizeWhatsAppDestination/)
  assert.doesNotMatch(checkoutStyles + successStyles, /fetch\(|supabase|\.from\(|rpc\(|\b(?:INSERT|UPDATE|DELETE)\b/i)
})

test('the shared muted alias is defined and active page styles contain no undefined local variables', () => {
  assert.match(globals, /--afex-pos-muted:\s*var\(--afex-pos-text-secondary\)/)
  const used = new Set([...`${checkoutStyles}\n${successStyles}`.matchAll(/var\((--[\w-]+)/g)].map((match) => match[1]))
  const defined = new Set([...`${checkoutStyles}\n${successStyles}\n${globals}`.matchAll(/(--[\w-]+)\s*:/g)].map((match) => match[1]))
  assert.deepEqual([...used].filter((token) => !defined.has(token)), [])
})
