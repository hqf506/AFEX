import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const tabletCss = readFileSync(new URL('../app/pos-tablet.css', import.meta.url), 'utf8')

test('R8M.1 removes the legacy invoice main cap only inside the tablet contract', () => {
  assert.match(tabletCss, /@media \(min-width: 768px\) and \(max-width: 1366px\)/)
  assert.match(tabletCss, /\.pos-invoices-page > main\s*\{[^}]*width:\s*100%;[^}]*max-width:\s*none;/s)
  assert.match(tabletCss, /\.pos-invoices-page \.pos-invoices-workspace\s*\{[^}]*padding-inline:\s*0;/s)
  assert.doesNotMatch(tabletCss, /@media \(max-width: 767px\)[^{]*\{[^}]*R8M\.1/s)
})

test('R8M.1 preserves one explicit height chain and route-local scroll ownership', () => {
  assert.match(tabletCss, /\.afex-pos-shell-content:has\(\.pos-invoices-page\)[\s\S]*?height:\s*100%;[\s\S]*?min-height:\s*0;[\s\S]*?overflow:\s*hidden;/)
  assert.match(tabletCss, /\.pos-invoices-page\s*\{[^}]*height:\s*100%;[^}]*min-height:\s*0;/s)
  assert.match(tabletCss, /\.pos-invoices-page > main\s*\{[^}]*height:\s*100%;[^}]*min-height:\s*0;/s)
  assert.doesNotMatch(tabletCss, /\.pos-invoices-page[^}]*transform:\s*scale/s)
})

test('R8M.1 changes no mobile, desktop, API, financial, or behavior source', () => {
  assert.doesNotMatch(tabletCss, /\.pos-invoices-page[^}]*position:\s*(fixed|absolute)/s)
  assert.doesNotMatch(tabletCss, /\.pos-invoices-page[^}]*\b(100vh|resize|zoom)\b/s)
})
