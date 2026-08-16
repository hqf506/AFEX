import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const login = readFileSync(new URL('../app/pos/login/page.tsx', import.meta.url), 'utf8')
const pin = readFileSync(new URL('../app/pos/employee-pin/page.tsx', import.meta.url), 'utf8')
const viewport = readFileSync(new URL('../hooks/use-mobile-viewport.ts', import.meta.url), 'utf8')
const css = readFileSync(new URL('../app/globals.css', import.meta.url), 'utf8')

test('login is mobile-first during server render and hydration', () => {
  assert.match(login, /useMobileViewport\(true\)/)
  assert.match(viewport, /serverMobileFirst \? getMobileServerSnapshot : getDesktopServerSnapshot/)
})

test('login has one latched client-side PIN transition and no full reload', () => {
  assert.match(login, /pinNavigationStartedRef/)
  assert.doesNotMatch(login, /window\.location\.href = '\/pos\/employee-pin'/)
  assert.equal((login.match(/router\.replace\('\/pos\/employee-pin'\)/g) ?? []).length, 2)
})

test('PIN unauthenticated redirect has one shell authority', () => {
  assert.match(pin, /protected shell owns unauthenticated-route navigation/i)
  assert.match(pin, /redirectTargetRef/)
})

test('mobile login fields are explicit Safari-safe controls', () => {
  assert.match(css, /\.pos-entry-login input \{[^}]*min-height: 52px;[^}]*-webkit-appearance: none;[^}]*font-size: max\(16px, 1rem\);/s)
  assert.match(login, /pos-login-field group flex min-h-\[58px\] w-full min-w-0/)
  assert.match(login, /h-11 w-11 shrink-0/)
})

test('mobile login owns one scroll surface without horizontal overflow', () => {
  assert.match(css, /\.pos-entry-login \{[^}]*overflow-x: clip !important;[^}]*overflow-y: auto !important;/s)
  assert.match(login, /pb-\[max\(1\.25rem,env\(safe-area-inset-bottom\)\)\]/)
})

test('authority and business contracts are untouched', () => {
  for (const source of [login, pin, viewport, css]) {
    assert.doesNotMatch(source, /\/api\/orders|execute_atomic_order|acquire_atomic_order/)
  }
})

test('PIN verification remains single-flight', () => {
  assert.match(pin, /verifyingPinRef/)
  assert.match(pin, /if \(verifyingPinRef\.current === pinToVerify\)/)
})
