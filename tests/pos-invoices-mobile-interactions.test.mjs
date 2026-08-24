import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const page = readFileSync('app/pos/invoices/page.tsx', 'utf8')
const shell = readFileSync('components/pos-shell/pos-responsive-shell.tsx', 'utf8')
const mobileCss = readFileSync('app/pos/invoices/invoice-mobile-interactions.module.css', 'utf8')
const sharedMobileCss = readFileSync('app/pos-mobile-defects.css', 'utf8')

test('mobile navigation is no longer restricted to the POS home route', () => {
  assert.match(shell, /const mobileNavigationOpen = drawerOpen && \(isPosHome \|\| mobileSubrouteNavigationEnabled\)/)
  assert.match(shell, /\{mobileNavigationOpen \? <div className="afex-pos-drawer-backdrop"/)
  assert.doesNotMatch(shell, /\{isPosHome && drawerOpen \?/)
})

test('hamburger is one real named button wired only to navigation state', () => {
  assert.equal((shell.match(/data-pos-mobile-menu-trigger/g) || []).length, 1)
  assert.match(shell, /<button type="button" data-pos-mobile-menu-trigger aria-label="فتح القائمة"/)
  assert.match(shell, /setDrawerOpen\(true\)/)
  assert.doesNotMatch(shell.match(/<button type="button" data-pos-mobile-menu-trigger[^>]+>/)?.[0] || '', /router\.|setMobileDetails|setSelectedId/)
})

test('existing drawer has one close control plus backdrop and Escape cleanup', () => {
  assert.equal((shell.match(/className="afex-pos-drawer"/g) || []).length, 1)
  assert.equal((shell.match(/className="afex-pos-drawer-close"/g) || []).length, 1)
  assert.match(shell, /data-pos-mobile-navigation-backdrop[\s\S]*?event\.target === event\.currentTarget/)
  assert.match(shell, /event\.key === 'Escape'\) setDrawerOpen\(false\)/)
  assert.match(shell, /removeEventListener\('keydown', closeNavigationOnEscape\)/)
})

test('page close is a distinct button with an explicit POS destination', () => {
  assert.match(page, /const closeInvoicePage = useCallback\(\(\) => router\.push\('\/pos'\)/)
  assert.match(page, /<button type="button" className="is-close" data-pos-invoices-page-close onClick=\{closeInvoicePage\}>إغلاق<\/button>/)
  assert.doesNotMatch(page.match(/data-pos-invoices-page-close[^>]+/)?.[0] || '', /setDrawerOpen|setMobileDetails|setSelectedId/)
})

test('hamburger and page close have separate DOM identities and handlers', () => {
  assert.match(shell, /data-pos-mobile-menu-trigger/)
  assert.match(page, /data-pos-invoices-page-close/)
  assert.doesNotMatch(page, /data-pos-mobile-menu-trigger/)
  assert.doesNotMatch(shell, /data-pos-invoices-page-close/)
})

test('mobile invoice card is a passive article without selection state or click handler', () => {
  const mobileCard = page.match(/<article className=\{`pos-invoice-ledger-row \$\{styles\.mobileRow\}`\}[^>]+>/)?.[0] || ''
  assert.match(mobileCard, /data-mobile-invoice-row/)
  assert.doesNotMatch(mobileCard, /onClick|tabIndex|aria-selected|data-selected|role="button"/)
})

test('desktop invoice row retains master-detail selection unchanged', () => {
  const desktopRow = page.slice(page.indexOf('data-desktop-invoice-row'), page.indexOf('</button>', page.indexOf('data-desktop-invoice-row')))
  assert.match(desktopRow, /data-desktop-invoice-row/)
  assert.match(desktopRow, /setSelectedId\(order\.id\)/)
  assert.match(desktopRow, /setDetailOpen\(true\)/)
  assert.match(desktopRow, /aria-selected=\{order\.id === selectedSummary\?\.id\}/)
})

test('each mobile card exposes exactly one explicit details button', () => {
  assert.equal((page.match(/data-mobile-invoice-details-trigger/g) || []).length, 1)
  assert.match(page, /<button type="button" className=\{styles\.mobileDetailsButton\} data-mobile-invoice-details-trigger/)
  assert.match(page, />عرض التفاصيل<\/button>/)
  assert.doesNotMatch(page, /data-mobile-action=|\.pos-invoice-ledger-row::after/)
})

test('details trigger opens the exact represented invoice without desktop selection', () => {
  assert.match(page, /onClick=\{\(event\) => openMobileDetails\(order, event\.currentTarget\)\}/)
  assert.match(page, /setMobileDetailsSummary\(order\)/)
  const openFunction = page.slice(page.indexOf('const openMobileDetails'), page.indexOf('const openPreviewFor'))
  assert.doesNotMatch(openFunction, /setSelectedId|setDetailOpen|setDrawerOpen/)
})

test('mobile and desktop detail states are independent', () => {
  assert.match(page, /const \[selectedId, setSelectedId\]/)
  assert.match(page, /const \[mobileDetailsSummary, setMobileDetailsSummary\]/)
  assert.match(shell, /const \[drawerOpen, setDrawerOpen\]/)
  assert.doesNotMatch(page, /drawerOpen|setDrawerOpen/)
})

test('only one mobile details sheet and one X close control can mount', () => {
  assert.equal((page.match(/data-mobile-invoice-sheet/g) || []).length, 1)
  assert.equal((page.match(/aria-label="إغلاق تفاصيل الفاتورة"/g) || []).length, 1)
  assert.match(page, /role="dialog" aria-modal="true"/)
  assert.match(page, /if \(mobileDetailsSummary\) return/)
})

test('mobile sheet uses the authoritative shared invoice detail content', () => {
  assert.equal((page.match(/function InvoiceDetailsContent/g) || []).length, 1)
  assert.equal((page.match(/<InvoiceDetailsContent/g) || []).length, 2)
  assert.match(page, /mode: 'details', id: requestedInvoiceId/)
  assert.match(page, /if \(detailed\.id !== requestedInvoiceId\) throw new Error/)
})

test('sheet close only clears mobile detail state and never navigates or toggles menu', () => {
  const closeFunctions = page.slice(page.indexOf('const finishMobileDetailsClose'), page.indexOf('useEffect(() => {\n    if (!mobileDetailsSummary) return', page.indexOf('const finishMobileDetailsClose')))
  assert.match(closeFunctions, /setMobileDetailsSummary\(null\)/)
  assert.doesNotMatch(closeFunctions, /router\.|setDrawerOpen|setSelectedId/)
})

test('sheet focus trap Escape and exact trigger restoration are implemented with cleanup', () => {
  assert.match(page, /event\.key === 'Escape'/)
  assert.match(page, /event\.key !== 'Tab'/)
  assert.match(page, /mobileSheetCloseRef\.current\?\.focus\(\)/)
  assert.match(page, /returnFocusTarget\?\.isConnected\) returnFocusTarget\.focus\(\)/)
  assert.match(page, /removeEventListener\('keydown', handleSheetKeyDown\)/)
})

test('background and sole ledger scroll are locked and restored exactly', () => {
  assert.match(page, /document\.body\.style\.overflow = 'hidden'/)
  assert.match(page, /document\.documentElement\.style\.overflow = 'hidden'/)
  assert.match(page, /if \(ledger\) ledger\.style\.overflow = 'hidden'/)
  assert.match(page, /document\.body\.style\.overflow = previousBodyOverflow/)
  assert.match(page, /if \(ledger\) ledger\.style\.overflow = previousLedgerOverflow/)
  assert.match(page, /pageMain\.inert = previousMainInert/)
})

test('sheet is full-viewport top-animated with one internal scroll owner', () => {
  assert.match(mobileCss, /\.mobileSheet\s*\{[^}]*height:\s*100dvh;[^}]*grid-template-rows:\s*auto minmax\(0, 1fr\) auto;[^}]*overflow:\s*hidden;/s)
  assert.match(mobileCss, /padding:\s*env\(safe-area-inset-top\).*env\(safe-area-inset-bottom\)/s)
  assert.match(mobileCss, /@keyframes invoice-mobile-sheet-enter\s*\{\s*from \{ transform: translateY\(-100%\); \}\s*to \{ transform: translateY\(0\); \}/s)
  assert.match(mobileCss, /\.mobileSheetBody\s*\{[^}]*overflow-y:\s*auto;/s)
})

test('all new mobile controls meet the 44px touch contract', () => {
  assert.match(mobileCss, /\.mobileDetailsButton\s*\{[^}]*min-height:\s*44px;/s)
  assert.match(mobileCss, /\.mobileSheetClose\s*\{[^}]*width:\s*44px;[^}]*height:\s*44px;/s)
  assert.match(sharedMobileCss, /\.afex-pos-drawer-close\s*\{[^}]*width:\s*44px;[^}]*height:\s*44px;/s)
})

test('mobile presentation is bounded below the protected tablet breakpoint', () => {
  assert.match(mobileCss, /@media \(max-width: 767\.98px\)/)
  assert.match(shell, /window\.matchMedia\('\(max-width: 767\.98px\)'\)/)
  assert.doesNotMatch(mobileCss, /max-height|pointer:\s*coarse|orientation:/)
  assert.match(mobileCss, /\.desktopRow,[\s\S]*?\.desktopPane\s*\{\s*display:\s*none !important;/)
  assert.equal(mobileCss.indexOf('@media (min-width:'), -1)
})

test('search filter pagination and read-only data contract remain intact', () => {
  assert.match(page, /normalizeInvoiceLedgerSearch/)
  assert.match(page, /mergeInvoiceLedgerPage/)
  assert.match(page, /activeMeta\.hasMore/)
  assert.equal((page.match(/setFilter\('(all|paid|refunded)'\)/g) || []).length, 3)
  assert.doesNotMatch(page, /method:\s*['"](?:POST|PUT|PATCH|DELETE)['"]|supabase|\.insert\(|\.update\(|\.delete\(|rpc\(/i)
})
