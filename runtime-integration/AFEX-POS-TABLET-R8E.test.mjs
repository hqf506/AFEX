import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const css = readFileSync('app/globals.css', 'utf8')
const marker = '/* AFEX POS R8E: landscape is a distinct tablet presentation contract.'
const start = css.indexOf(marker)
const end = css.indexOf('@media (prefers-reduced-motion: reduce)', start)
const landscape = css.slice(start, end)

test('R8E is closed to landscape coarse-pointer tablets', () => {
  assert.ok(start >= 0)
  assert.match(landscape, /min-width:\s*768px/)
  assert.match(landscape, /max-width:\s*1366px/)
  assert.match(landscape, /hover:\s*none/)
  assert.match(landscape, /pointer:\s*coarse/)
  assert.match(landscape, /orientation:\s*landscape/)
  assert.doesNotMatch(landscape, /@media[^\n]*(?:max-width:\s*(?:767|430|390|375|360|320)px)/)
})

test('landscape entry surfaces fill the dynamic viewport and honor safe areas', () => {
  assert.match(landscape, /\.pos-entry-login,\s*\.pos-entry-pin\s*\{[^}]*width:\s*100dvw[^}]*height:\s*100dvh/s)
  assert.match(landscape, /env\(safe-area-inset-top\)[^}]*env\(safe-area-inset-right\)[^}]*env\(safe-area-inset-bottom\)[^}]*env\(safe-area-inset-left\)/s)
  assert.match(landscape, /\.pos-entry-pin \.pos-pin-frame > section\s*\{[^}]*grid-template-columns:\s*minmax\(230px, 32%\) minmax\(0, 1fr\)/s)
  assert.match(landscape, /aspect-ratio:\s*auto\s*!important/)
  assert.doesNotMatch(landscape, /aspect-ratio:\s*(?:16\s*\/\s*9|[0-9.]+)/)
})

test('history and status own the complete landscape width', () => {
  assert.match(landscape, /\.pos-order-history-page \.pos-history-grid\s*\{[^}]*auto-fit[^}]*minmax\(min\(260px, 100%\), 1fr\)/s)
  assert.match(landscape, /\.pos-order-status-workflow \.pos-status-columns\s*\{[^}]*repeat\(2, minmax\(0, 1fr\)\)/s)
  assert.match(landscape, /\.pos-order-status-workflow \.pos-history-tools > button[^}]*min-width:\s*44px/s)
})

test('landscape cart has semantic one-body ownership and equal bottom actions', () => {
  assert.match(landscape, /\.afex-sale-layout\s*\{[^}]*clamp\(320px, 30dvw, 360px\) minmax\(0, 1fr\)/s)
  assert.match(landscape, /\.afex-sale-layout\s*\{[^}]*display:\s*grid/s)
  assert.match(landscape, /\.afex-sale-cart\s*\{[^}]*position:\s*static[^}]*display:\s*grid[^}]*grid-template-rows:\s*auto minmax\(0, 1fr\) auto/s)
  assert.match(landscape, /\[data-mobile-cart-scroll-body\][^}]*overflow-y:\s*auto/s)
  assert.match(landscape, /\[data-mobile-cart-actions\][^}]*grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\)/s)
  assert.match(landscape, /\[data-mobile-cart-actions\] button\s*\{[^}]*height:\s*48px\s*!important[^}]*min-height:\s*48px[^}]*max-height:\s*48px/s)
  assert.doesNotMatch(landscape, /nth-child|nth-of-type|margin-(?:top|bottom|block):\s*-/)
})

test('R8E contains no application or authority behavior', () => {
  assert.doesNotMatch(landscape, /\/api\/|fetch\(|supabase|sessionStorage|localStorage|router\.|checkout/)
})
