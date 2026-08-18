import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const curtain = readFileSync('components/pos-invoice-preview-curtain.tsx', 'utf8')
const css = readFileSync('app/globals.css', 'utf8')

test('R8M.3 constrains only the digital viewer to an A4-centered neutral canvas', () => {
  assert.match(curtain, /pos-invoice-digital-canvas.*pos-invoice-digital-page.*pos-invoice-digital-frame/s)
  assert.match(css, /\.pos-invoice-digital-canvas[^}]*container-type:\s*size[^}]*place-items:\s*start center[^}]*overflow:\s*hidden/)
  assert.match(css, /\.pos-invoice-digital-page[^}]*width:\s*min\(100cqi, calc\(100cqb \* 210 \/ 297\)\)[^}]*aspect-ratio:\s*210 \/ 297/)
  assert.match(css, /data-mode='digital'[^}]*background:\s*color-mix/)
  assert.doesNotMatch(css.match(/\.pos-invoice-digital-canvas[^}]*}/)?.[0] || '', /background:\s*#fff|background:\s*white/)
  assert.doesNotMatch(css.match(/\.pos-invoice-digital-page[^}]*}/)?.[0] || '', /background:\s*#fff|background:\s*white/)
})

test('R8M.3 preserves the authoritative PDF generator, bytes contract, and API route', () => {
  const identities = [
    ['lib/invoices/pdf.ts', '0A0AEA7A3E1CD37E724B1F19E7B274FAEEAD7F2B393CBDE594E97240D6EC20C8'],
    ['lib/invoices/receipt-template.ts', '03870C921BEAC62DFEEA705375AC615D7A8A710CCC0802DA3CAF3634643206FB'],
    ['app/api/invoices/pdf/route.ts', '74A8EDD373FEE13383477455C0017272A09CE023FF1B75FD2A017EEB0A8D2847'],
  ]
  for (const [path, expected] of identities) {
    const actual = createHash('sha256').update(readFileSync(path)).digest('hex').toUpperCase()
    assert.equal(actual, expected, path)
  }
  assert.match(curtain, /loadOfficialInvoicePdfPayload\(buildDigitalPayload\(invoice\), controller\.signal\)/)
})

test('R8M.3 changes no download, navigation, print, stale-request, or thermal behavior', () => {
  assert.match(curtain, /<a href=\{digitalUrl} download=\{downloadName}>تنزيل<\/a>/)
  assert.match(curtain, /URL\.revokeObjectURL/)
  assert.match(curtain, /requestRef\.current !== requestId/)
  assert.doesNotMatch(curtain, /window\.open|router\.(?:push|replace|back)|location\./)
  assert.match(curtain, /renderThermalInvoiceHtml/)
  assert.match(curtain, /renderThermalShopCopyHtml/)
  assert.match(curtain, /prepareThermalInvoicePreviewHtml/)
})
