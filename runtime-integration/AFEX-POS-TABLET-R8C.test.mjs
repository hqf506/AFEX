import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const globalCss = readFileSync('app/globals.css', 'utf8')
const tabletCss = readFileSync('app/pos-tablet.css', 'utf8')

test('R8F replaces stacked R8C/R8D/R8E contracts with one tablet stylesheet', () => {
  assert.doesNotMatch(globalCss, /AFEX POS R8[CD E]:/)
  assert.match(tabletCss, /AFEX POS R8F/)
  assert.match(tabletCss, /min-width:\s*768px/)
  assert.match(tabletCss, /max-width:\s*1366px/)
  assert.match(tabletCss, /orientation:\s*landscape/)
  assert.doesNotMatch(tabletCss, /pointer:|hover:/)
  assert.doesNotMatch(tabletCss, /@media[^\n]*max-width:\s*(?:767|430|390|375|360|320)px/)
})

test('short-height phone rules no longer leak into geometric tablet landscape', () => {
  assert.doesNotMatch(globalCss, /max-height:\s*500px\)\s*and\s*\(pointer:\s*coarse/)
})

test('tablet entry surfaces use the dynamic viewport without a device frame', () => {
  assert.match(tabletCss, /\.pos-entry-login,\s*\.pos-entry-pin\s*\{[^}]*width:\s*100dvw[^}]*height:\s*100dvh/s)
  assert.match(tabletCss, /aspect-ratio:\s*auto\s*!important/)
  assert.match(tabletCss, /env\(safe-area-inset-top\)[^}]*env\(safe-area-inset-right\)[^}]*env\(safe-area-inset-bottom\)[^}]*env\(safe-area-inset-left\)/s)
  assert.match(tabletCss, /\.pos-entry-pin button,[^}]*min-width:\s*44px;[^}]*min-height:\s*44px;/s)
  assert.doesNotMatch(tabletCss, /100vh/)
})

test('history and status consume complete tablet width with an explicit scroll contract', () => {
  assert.match(tabletCss, /\.afex-pos-app-shell\.is-pos-subroute:not\(\.is-sale-route\)\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\)/s)
  assert.match(tabletCss, /\.afex-pos-app-shell\.is-pos-subroute:not\(\.is-sale-route\)\s*>\s*\.afex-pos-shell-content\s*\{[^}]*grid-column:\s*1;[^}]*width:\s*100%/s)
  assert.match(tabletCss, /\.pos-order-history-page,\s*\.pos-order-status-workflow,[^}]*width:\s*100%\s*!important;[^}]*max-width:\s*none/s)
  assert.match(tabletCss, /\.pos-order-history-page \.pos-history-grid\s*\{[^}]*auto-fit[^}]*minmax\(min\(270px, 100%\), 1fr\)/s)
  assert.match(tabletCss, /\.pos-order-status-workflow > main\s*\{[^}]*grid-template-rows:\s*auto auto minmax\(0, 1fr\)[^}]*overflow:\s*hidden/s)
  assert.match(tabletCss, /\.pos-order-status-workflow \.pos-status-columns\s*\{[^}]*overflow-y:\s*auto/s)
})

test('tablet entry grid stretches its real frame instead of intrinsic-centering a narrow desktop card', () => {
  assert.match(tabletCss, /\.pos-entry-login,\s*\.pos-entry-pin\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\)/s)
  assert.match(tabletCss, /\.pos-entry-login > div:last-child,\s*\.pos-entry-pin \.pos-pin-frame\s*\{[^}]*justify-self:\s*stretch/s)
})

test('tablet login restores its identity surface without leaking to PIN, phone, or desktop', () => {
  assert.match(tabletCss, /\.pos-entry-login > div:last-child > section\s*\{[^}]*grid-template-rows:\s*minmax\(210px, 28dvh\) minmax\(0, 1fr\)/s)
  assert.match(tabletCss, /\.pos-entry-login > div:last-child > section > div\[dir='rtl'\]:last-of-type\s*\{[^}]*display:\s*flex\s*!important/s)
  assert.match(tabletCss, /\.pos-entry-login > div:last-child > section > div\[dir='rtl'\]:not\(:last-of-type\) > div\s*\{[^}]*width:\s*100%\s*!important;[^}]*max-width:\s*560px\s*!important;[^}]*justify-self:\s*stretch/s)
  assert.match(tabletCss, /\.pos-entry-login > div:last-child > section > div\[dir='rtl'\]:not\(:last-of-type\)\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\)/s)
  assert.match(tabletCss, /\.pos-tablet-frame-root:has\(\.pos-entry-login\)[^}]*width:\s*100dvw\s*!important;[^}]*height:\s*100dvh\s*!important/s)
  assert.doesNotMatch(tabletCss, /\.pos-entry-pin[^,{]*> div\[dir='rtl'\]:last-of-type/)
})

test('tablet cart is a semantic three-row grid with one body and equal bottom actions', () => {
  assert.match(tabletCss, /\.afex-sale-cart\s*\{[^}]*grid-template-rows:\s*auto minmax\(0, 1fr\) auto/s)
  assert.match(tabletCss, /\[data-mobile-cart-scroll-body\][^}]*overflow-y:\s*auto/s)
  assert.match(tabletCss, /\[data-mobile-cart-footer\][^}]*align-self:\s*end/s)
  assert.match(tabletCss, /\[data-mobile-cart-actions\][^}]*repeat\(2, minmax\(0, 1fr\)\)/s)
  assert.match(tabletCss, /\[data-mobile-cart-actions\] button\s*\{[^}]*height:\s*48px\s*!important[^}]*min-height:\s*48px[^}]*max-height:\s*48px/s)
  assert.doesNotMatch(tabletCss, /nth-child|nth-of-type|margin-(?:top|bottom|block):\s*-/)
})

test('tablet checkout has one vertical scroll surface and no fixed action dock', () => {
  assert.match(tabletCss, /\.afex-checkout-workspace\s*\{[^}]*min-height:\s*0[^}]*overflow-y:\s*auto[^}]*touch-action:\s*pan-y/s)
  assert.match(tabletCss, /\.afex-checkout-action-dock\s*\{[^}]*position:\s*static/s)
  assert.doesNotMatch(tabletCss, /position:\s*fixed/)
})

test('R8F CSS contains no application, authority, or business behavior', () => {
  assert.doesNotMatch(tabletCss, /\/api\/|fetch\(|supabase|sessionStorage|localStorage|router\.|checkout\(/)
})
