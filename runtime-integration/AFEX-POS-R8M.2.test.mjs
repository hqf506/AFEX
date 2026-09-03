import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')
const page = read('app/pos/invoices/page.tsx')
const curtain = read('components/pos-invoice-preview-curtain.tsx')
const css = read('app/globals.css')
const pdfClient = read('lib/invoices/official-pdf-client.ts')
const thermal = read('lib/invoices/thermal-template.ts')

test('R8M.2 exposes exactly the approved same-page preview actions', () => {
  assert.match(page, /<ReceiptIcon \/>الفاتورة الحرارية/)
  assert.match(page, /<DigitalInvoiceIcon \/>عرض الفاتورة الرقمية/)
  assert.doesNotMatch(page, />عرض التفاصيل<|>طباعة<|window\.open|target="_blank"/)
  assert.match(page, /setPreview\(\{ mode, invoice: selected \}\)/)
})

test('R8M.2 reuses authoritative thermal and digital contracts', () => {
  assert.match(curtain, /renderThermalInvoiceHtml\(payload\)/)
  assert.match(curtain, /renderThermalShopCopyHtml\(payload\)/)
  assert.match(curtain, /buildCombinedThermalPrintHtml/)
  assert.match(curtain, /fetch\('\/api\/invoices\/thermal-settings'/)
  assert.match(curtain, /loadOfficialInvoicePdfPayload\(buildDigitalPayload\(invoice\), controller\.signal\)/)
  assert.match(pdfClient, /fetch\('\/api\/invoices\/pdf'/)
  assert.match(thermal, /export function buildCombinedThermalPrintHtml/)
})

test('R8M.2 closes stale work and cleans privileged browser resources', () => {
  assert.match(curtain, /const controller = new AbortController\(\)/)
  assert.match(curtain, /requestRef\.current !== requestId/)
  assert.match(curtain, /controller\.abort\(\)/)
  assert.match(curtain, /URL\.revokeObjectURL\(objectUrlRef\.current\)/)
  assert.match(curtain, /document\.body\.style\.overflow = 'hidden'/)
  assert.match(curtain, /pageMain\.inert = true/)
  assert.match(curtain, /returnFocusRef\.current\?\.focus\(\)/)
})

test('R8M.2 is a top-down reduced-motion-safe viewport curtain', () => {
  assert.match(css, /\.pos-invoice-preview-curtain[^}]*height:\s*100dvh/)
  assert.match(css, /@keyframes pos-invoice-preview-enter\s*\{\s*from\s*\{[^}]*translateY\(-100%\)[^}]*\}\s*to\s*\{[^}]*translateY\(0\)/s)
  assert.match(css, /prefers-reduced-motion:\s*reduce/)
  assert.match(css, /\.pos-invoice-preview-content[^}]*overflow-y:\s*auto/)
  assert.match(css, /data-mode='digital'[^}]*overflow:\s*hidden/)
})

test('opening previews has zero automatic print, download or navigation effects', () => {
  const openEffect = curtain.slice(curtain.indexOf('useEffect(() => {\n    const requestId'), curtain.indexOf('useEffect(() => releaseObjectUrl'))
  assert.doesNotMatch(openEffect, /\.print\(|\.click\(|window\.open|location\.|router\./)
  assert.match(curtain, /onClick=\{\(\) => \{ printFrameRef\.current\?\.contentWindow\?\.focus\(\); printFrameRef\.current\?\.contentWindow\?\.print\(\) \}\}/)
  assert.match(curtain, /href=\{digitalUrl\} download=\{downloadName\}/)
})
