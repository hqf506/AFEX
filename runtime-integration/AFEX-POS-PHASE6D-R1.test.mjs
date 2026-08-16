import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const css = readFileSync('app/globals.css', 'utf8')
const items = readFileSync('components/invoice-items-step.tsx', 'utf8')

function relativeLuminance(hex) {
  const channels = hex.match(/[a-f\d]{2}/gi).map((value) => Number.parseInt(value, 16) / 255)
  const [red, green, blue] = channels.map((value) => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4)
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue
}

function contrast(foreground, background) {
  const values = [relativeLuminance(foreground), relativeLuminance(background)].sort((a, b) => b - a)
  return (values[0] + 0.05) / (values[1] + 0.05)
}

test('existing continuation condition remains unchanged and disabled is non-interactive gray', () => {
  assert.match(items, /className="afex-sale-complete-button[^\n]+"/)
  assert.match(items, /disabled=\{invoiceItems\.length === 0\}/)
  assert.match(css, /\.afex-sale-complete-button:disabled \{[^}]*cursor: not-allowed;[^}]*color: var\(--afex-pos-text-secondary\) !important;/)
})

test('enabled label and currentColor icon are explicit opaque white', () => {
  assert.match(css, /\.afex-sale-complete-button:not\(:disabled\) \{[^}]*background: #8a6537 !important;[^}]*color: #fff !important;[^}]*opacity: 1 !important;/)
  assert.match(css, /\.afex-sale-complete-button:not\(:disabled\) :where\(span, svg, path\) \{[^}]*color: #fff !important;[^}]*opacity: 1 !important;/)
  assert.match(items, /<svg[^>]*stroke-current/)
})

test('enabled bronze and white meet WCAG AA contrast', () => {
  assert.ok(contrast('ffffff', '8a6537') >= 4.5)
  assert.ok(contrast('ffffff', '79572f') >= 4.5)
  assert.ok(contrast('ffffff', '684a28') >= 4.5)
})

test('hover, keyboard focus, pressed and touch target states remain explicit', () => {
  assert.match(css, /\.afex-sale-complete-button:hover:not\(:disabled\)/)
  assert.match(css, /\.afex-sale-complete-button:focus-visible:not\(:disabled\)/)
  assert.match(css, /\.afex-sale-complete-button:active:not\(:disabled\)/)
  assert.match(css, /\.afex-sale-complete-button \{ min-height: 56px;/)
})
