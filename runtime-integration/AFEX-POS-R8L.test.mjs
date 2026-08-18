import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')
const component = read('components/pos-preparing-screen.tsx')
const routeLoading = read('app/pos/loading.tsx')
const shell = read('components/pos-shell-layout.tsx')
const page = read('app/pos/page.tsx')
const css = read('app/globals.css')

test('R8L renders the approved code-native AFEX waiting composition', () => {
  assert.match(component, /نجهز نقطة البيع/)
  assert.match(component, /يرجى الانتظار قليلًا/)
  assert.equal((component.match(/<span \/>/g) || []).length, 3)
  assert.match(component, /afex-pos-preparing-mark[^>]*aria-hidden="true">A</)
  assert.match(component, /afex-pos-preparing-wordmark[^>]*>AFEX</)
  assert.doesNotMatch(component, /<img|https?:\/\/|fetch\(|setTimeout|setInterval/)
})

test('R8L replaces only the three existing normal loading presentations', () => {
  assert.match(routeLoading, /return <PosPreparingScreen \/>/)
  assert.match(shell, /if \(authState\.loading \|\| \(requireEmployee && allowed && !employeeCheckReady\)\)/)
  assert.match(shell, /<PosPreparingScreen \/>/)
  assert.match(page, /if \(access\.loading \|\| !access\.allowed\)/)
  assert.match(page, /return <PosPreparingScreen \/>/)
  assert.doesNotMatch(routeLoading, /جارٍ فتح نقطة البيع|يتم تجهيز جلسة AFEX POS/)
})

test('R8L preserves redirects, retryable errors, and session predicates', () => {
  assert.match(shell, /router\.replace\('\/pos\/login'\)/)
  assert.match(shell, /router\.replace\('\/pos\/employee-pin'\)/)
  assert.match(shell, /await authState\.refreshAuthState\(\)/)
  assert.match(shell, /تعذر تجهيز نقطة البيع/)
  assert.match(shell, /إعادة المحاولة/)
  assert.match(page, /access\.authError === 'timeout'/)
  assert.match(page, /تعذر تجهيز نقطة البيع/)
  assert.doesNotMatch(component, /router|auth|session|employee|branch|tenant|catalog|api\//i)
})

test('R8L uses POS tokens, dvh safe areas, and reduced motion without layout shift', () => {
  for (const token of ['--afex-pos-base', '--afex-pos-text', '--afex-pos-text-secondary', '--afex-pos-emerald']) {
    assert.match(css, new RegExp(`var\\(${token}\\)`))
  }
  assert.match(css, /\.afex-pos-preparing[\s\S]*height: 100dvh;[\s\S]*overflow: hidden;/)
  assert.match(css, /env\(safe-area-inset-top\)/)
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/)
  assert.match(css, /animation: none/)
  assert.match(css, /height: 12px/)
})
