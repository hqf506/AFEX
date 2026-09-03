import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const invoicePage = readFileSync('app/pos/invoices/page.tsx', 'utf8')
const invoiceCss = readFileSync('app/pos/invoices/invoice-mobile-interactions.module.css', 'utf8')
const operationsPage = readFileSync('app/pos/order-history/page.tsx', 'utf8')
const operationsCss = readFileSync('app/pos/order-history/operations-history.module.css', 'utf8')
const themeCss = readFileSync('app/globals.css', 'utf8')

function block(source, selector) {
  const start = source.indexOf(selector)
  assert.notEqual(start, -1, `Missing selector: ${selector}`)
  const open = source.indexOf('{', start)
  let depth = 0
  for (let index = open; index < source.length; index += 1) {
    if (source[index] === '{') depth += 1
    if (source[index] === '}') depth -= 1
    if (depth === 0) return source.slice(start, index + 1)
  }
  throw new Error(`Unclosed selector: ${selector}`)
}

function hexToLuminance(hex) {
  const channels = hex.slice(1).match(/../g).map((value) => Number.parseInt(value, 16) / 255)
  const linear = channels.map((value) => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4)
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2]
}

function contrast(first, second) {
  const a = hexToLuminance(first)
  const b = hexToLuminance(second)
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)
}

const digitalAction = invoicePage.match(/<button type="button" onClick=\{\(\) => onPreview\('digital'\)\} disabled=\{disabled\}><DigitalInvoiceIcon \/>عرض الفاتورة الرقمية<\/button>/u)?.[0] || ''
const footerButton = block(invoiceCss, '.mobileSheetFooter button {')
const digitalStyle = block(invoiceCss, '.mobileSheetFooter button:last-child {')
const disabledStyle = block(invoiceCss, '.mobileSheetFooter button:disabled {')
const darkOperationsStart = operationsCss.indexOf(":global(html[data-pos-theme='dark']) .page")
const darkOperationsEnd = operationsCss.indexOf('\n  .page {', darkOperationsStart)
const darkOperationsCss = operationsCss.slice(darkOperationsStart, darkOperationsEnd)

test('digital invoice action retains one visible Arabic label and document icon', () => {
  assert.equal((invoicePage.match(/عرض الفاتورة الرقمية/gu) || []).length, 1)
  assert.match(digitalAction, /<DigitalInvoiceIcon \/>عرض الفاتورة الرقمية/u)
  assert.doesNotMatch(invoiceCss, /\.mobileSheetFooter[^}]*svg[^}]*display:\s*none/su)
})

test('available digital action uses defined AFEX foreground background and border tokens', () => {
  assert.match(digitalStyle, /border-color:\s*var\(--afex-pos-emerald\)/u)
  assert.match(digitalStyle, /background:\s*var\(--afex-pos-raised\)/u)
  assert.match(digitalStyle, /color:\s*var\(--afex-pos-emerald\)/u)
  assert.doesNotMatch(digitalStyle, /--afex-pos-bronze|color:\s*#fff/u)
  assert.match(themeCss, /--afex-pos-emerald:\s*#b89a64/u)
  assert.match(themeCss, /--afex-pos-raised:\s*#15171a/u)
})

test('digital action enforces normal-text contrast in both themes', () => {
  assert.ok(contrast('#b89a64', '#15171a') >= 4.5)
  assert.ok(contrast('#8a6537', '#fbf8f2') >= 4.5)
  assert.match(invoiceCss, /:global\(html\[data-pos-theme='light'\]\) \.mobileSheetFooter button:last-child\s*\{[^}]*color:\s*var\(--afex-pos-emerald-strong\)/su)
})

test('digital and thermal controls meet the 48px mobile action contract', () => {
  assert.match(footerButton, /min-height:\s*48px/u)
  assert.match(footerButton, /display:\s*flex/u)
  assert.match(footerButton, /align-items:\s*center/u)
})

test('disabled invoice actions remain truthful disabled and readable', () => {
  assert.match(digitalAction, /disabled=\{disabled\}/u)
  assert.match(disabledStyle, /cursor:\s*not-allowed/u)
  assert.match(disabledStyle, /opacity:\s*1/u)
  assert.match(disabledStyle, /color:\s*var\(--afex-pos-text-secondary\)/u)
  assert.ok(contrast('#a9a49b', '#15171a') >= 3)
  assert.ok(contrast('#756f65', '#fbf8f2') >= 3)
})

test('digital click still invokes only the original digital preview action', () => {
  assert.match(digitalAction, /onPreview\('digital'\)/u)
  assert.doesNotMatch(digitalAction, /thermal|print|router|fetch/u)
})

test('thermal action behavior remains the original thermal preview action', () => {
  assert.match(invoicePage, /onClick=\{\(\) => onPreview\('thermal'\)\} disabled=\{disabled\}><ReceiptIcon \/>الفاتورة الحرارية/u)
})

test('invoice sheet close animation and sole scroll owner remain intact', () => {
  assert.match(invoicePage, /aria-label="إغلاق تفاصيل الفاتورة"/u)
  assert.match(invoiceCss, /\.mobileSheetClose\s*\{[^}]*width:\s*44px;[^}]*height:\s*44px;/su)
  assert.match(invoiceCss, /\.mobileSheetBody\s*\{[^}]*overflow-y:\s*auto;/su)
  assert.match(invoiceCss, /@keyframes invoice-mobile-sheet-enter/u)
})

test('the existing html data-pos-theme state drives operations dark mode', () => {
  assert.match(operationsCss, /:global\(html\[data-pos-theme='dark'\]\) \.page/u)
  assert.match(darkOperationsCss, /background:\s*var\(--afex-pos-base\)/u)
  assert.match(darkOperationsCss, /color-scheme:\s*dark/u)
})

test('operations introduces no second theme persistence state', () => {
  assert.doesNotMatch(operationsPage, /localStorage|sessionStorage|prefers-color-scheme|data-pos-theme/u)
  assert.doesNotMatch(operationsCss, /@media\s*\(prefers-color-scheme:\s*dark\)/u)
})

test('dark operations root cannot retain the approved ivory light surfaces', () => {
  assert.doesNotMatch(darkOperationsCss, /#fbf8f1|#fffdfa|#f8f3e9|#fbf5e9/u)
  assert.match(darkOperationsCss, /--surface:\s*var\(--afex-pos-panel\)/u)
  assert.match(darkOperationsCss, /--text:\s*var\(--afex-pos-text\)/u)
})

test('operation cards and their text receive scoped dark styles', () => {
  assert.match(darkOperationsCss, /\.card,\s*:global\(html\[data-pos-theme='dark'\]\) \.marker\s*\{[^}]*border-color:\s*var\(--border\);[^}]*background:\s*var\(--surface\)/su)
  assert.match(darkOperationsCss, /\.reference,/u)
  assert.match(darkOperationsCss, /\.customer,/u)
  assert.match(darkOperationsCss, /\.card button\s*\{[^}]*color:\s*var\(--muted\)/su)
})

test('search header statistics timeline controls and dialog inherit the dark palette', () => {
  for (const selector of ['.employee,', '.toolbar input,', '.toolbar select,', '.marker {', '.actions button + button', '.item::after']) {
    assert.ok(darkOperationsCss.includes(selector), `Missing dark coverage for ${selector}`)
  }
  assert.match(operationsCss, /\.summary > div\s*\{[^}]*background:\s*var\(--surface\)/su)
  assert.match(operationsCss, /\.dialog\s*\{[^}]*background:\s*var\(--surface\);[^}]*color:\s*var\(--text\)/su)
  assert.match(darkOperationsCss, /\.card \.detailsAction\s*\{[^}]*background:\s*color-mix/su)
  assert.match(darkOperationsCss, /\.toolbar input:focus-visible,[^}]*outline:\s*2px solid var\(--gold\)/su)
})

test('approved light operations palette remains the unchanged base presentation', () => {
  assert.match(operationsCss, /\.page\s*\{[^}]*--surface:\s*#fffdfa;[^}]*background:\s*#fbf8f1;/su)
  assert.match(operationsCss, /\.employee\s*\{[^}]*background:\s*#f8f3e9;/su)
  assert.match(operationsCss, /\.card \.detailsAction\s*\{[^}]*background:\s*#fbf5e9;[^}]*color:\s*#79571d;/su)
})

test('approved compact mobile operation-card geometry remains unchanged', () => {
  assert.match(operationsCss, /grid-template-areas:\s*'operation status' 'customer time' 'reference action'/u)
  assert.match(operationsCss, /\.card\s*\{[^}]*min-height:\s*112px;[^}]*gap:\s*6px 8px;[^}]*padding:\s*12px;/su)
})

test('mobile operation filter remains absent', () => {
  assert.match(operationsCss, /\.filterField\s*\{\s*display:\s*none;/u)
})

test('dark correction stays inside the existing mobile and short-landscape contract', () => {
  const mobileMedia = operationsCss.indexOf('@media (max-width: 767.98px)')
  assert.ok(darkOperationsStart > mobileMedia)
  assert.match(operationsCss.slice(mobileMedia, darkOperationsStart), /\(max-height: 500px\) and \(hover: none\) and \(pointer: coarse\)/u)
  assert.doesNotMatch(darkOperationsCss, /min-width:\s*768px|width:\s*\d|height:\s*\d/u)
})

test('focused visual correction adds no API or business mutation path', () => {
  const changedCss = `${digitalStyle}\n${disabledStyle}\n${darkOperationsCss}`.toLowerCase()
  for (const forbidden of ['/api/', 'fetch(', 'supabase', 'rpc(', 'insert(', 'update(', 'delete(', 'post', 'patch']) {
    assert.equal(changedCss.includes(forbidden), false, `Unexpected business token: ${forbidden}`)
  }
})
