import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const css = readFileSync('app/pos-tablet.css', 'utf8')
const start = css.indexOf('@media (min-width: 768px) and (max-width: 1366px) and (orientation: landscape)')
const landscape = css.slice(start)

test('R8F landscape contract is geometric and excludes phone and conventional desktop', () => {
  assert.ok(start >= 0)
  assert.match(landscape, /min-width:\s*768px/)
  assert.match(landscape, /max-width:\s*1366px/)
  assert.match(landscape, /orientation:\s*landscape/)
  assert.doesNotMatch(landscape, /pointer:|hover:|user-agent/)
})

test('landscape login and PIN fill the viewport and expose the full keypad', () => {
  assert.match(landscape, /\.pos-entry-login > div:last-child,[\s\S]*height:\s*100%\s*!important/)
  assert.match(landscape, /\.pos-entry-login > div:last-child > section\s*\{[^}]*grid-template-columns:\s*minmax\(400px, 46%\) minmax\(0, 1fr\)\s*!important/s)
  assert.match(landscape, /\.pos-entry-login > div:last-child > section > div\[dir='rtl'\]:last-of-type\s*\{[^}]*grid-column:\s*2;[^}]*grid-row:\s*1/s)
  assert.match(landscape, /\.pos-entry-pin \.pos-pin-frame > section\s*\{[^}]*grid-template-columns:\s*minmax\(280px, 34%\) minmax\(0, 1fr\)/s)
  assert.match(landscape, /\[dir='ltr'\]\s*\{[^}]*grid-template-columns:\s*repeat\(3, minmax\(64px, 92px\)\)/s)
})

test('landscape history, status, cart, and checkout use available geometry', () => {
  assert.match(landscape, /\.pos-order-history-page \.pos-history-grid\s*\{[^}]*minmax\(min\(260px, 100%\), 1fr\)/s)
  assert.match(landscape, /\.pos-order-status-workflow \.pos-status-columns\s*\{[^}]*repeat\(2, minmax\(0, 1fr\)\)/s)
  assert.match(landscape, /\.afex-sale-layout\s*\{[^}]*clamp\(320px, 30dvw, 360px\) minmax\(0, 1fr\)/s)
  assert.match(landscape, /\.afex-checkout-layout\s*\{[^}]*minmax\(270px, 320px\) minmax\(0, 1fr\)/s)
})

test('landscape has no prohibited structural or behavior selectors', () => {
  assert.doesNotMatch(landscape, /nth-child|nth-of-type|position:\s*fixed|margin-(?:top|bottom|block):\s*-/)
  assert.doesNotMatch(landscape, /\/api\/|fetch\(|supabase|sessionStorage|localStorage|router\./)
})
