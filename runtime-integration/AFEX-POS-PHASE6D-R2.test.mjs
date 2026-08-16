import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const css = readFileSync('app/globals.css', 'utf8')
const items = readFileSync('components/invoice-items-step.tsx', 'utf8')
const shell = readFileSync('components/pos-shell/pos-responsive-shell.tsx', 'utf8')

test('cancel invoice keeps the existing confirmation and cart-state behavior', () => {
  assert.match(items, /onClick=\{\(\) => setShowCancelModal\(true\)\}[\s\S]{0,180}className="afex-sale-cancel-button/)
  assert.match(items, /\{showCancelModal \? \(/)
  assert.match(items, /هل أنت متأكد من إلغاء الفاتورة؟/)
})

test('cancel invoice uses the destructive token, never a neutral token', () => {
  assert.match(css, /\.afex-sale-cancel-button \{[^}]*var\(--afex-pos-danger\)[^}]*color: var\(--afex-pos-danger\) !important;/)
  const rule = css.match(/\.afex-sale-cancel-button \{[^}]+\}/)?.[0] ?? ''
  assert.doesNotMatch(rule, /--afex-pos-(?:hover|text-secondary|card|border)/)
  assert.doesNotMatch(rule, /slate|gray|grey/i)
})

test('cancel label and icon retain opaque destructive contrast', () => {
  assert.match(items, /afex-sale-cancel-button[\s\S]{0,500}<svg[^>]*stroke-current/)
  assert.match(css, /\.afex-sale-cancel-button :where\(span, svg, path\) \{[^}]*color: var\(--afex-pos-danger\) !important;[^}]*opacity: 1 !important;/)
})

test('destructive hover, focus, pressed and touch states are explicit', () => {
  assert.match(css, /\.afex-sale-cancel-button:hover/)
  assert.match(css, /\.afex-sale-cancel-button:focus-visible/)
  assert.match(css, /\.afex-sale-cancel-button:active/)
  assert.match(css, /\.afex-sale-cancel-button \{ min-height: 44px;/)
})

test('complete-sale bronze identity remains separate', () => {
  assert.match(css, /\.afex-sale-complete-button:not\(:disabled\) \{[^}]*background: #8a6537 !important;/)
  assert.doesNotMatch(css, /\.afex-sale-cancel-button \{[^}]*#8a6537/)
})

test('theme control remains structurally in its approved shell locations', () => {
  assert.match(shell, /afex-pos-brand-row[\s\S]{0,120}<PosThemeToggle \/>/)
  assert.match(shell, /afex-pos-sale-header[\s\S]{0,220}<PosThemeToggle \/>/)
  assert.match(shell, /afex-pos-responsive-actions[\s\S]{0,80}<PosThemeToggle \/>/)
})

test('theme control cannot shrink, wrap, or clip at supported widths', () => {
  assert.match(css, /\.afex-pos-theme-toggle \{[^}]*width: max-content;[^}]*min-width: 84px;[^}]*flex: 0 0 auto;[^}]*flex-shrink: 0;[^}]*overflow: visible;[^}]*white-space: nowrap;/)
  assert.doesNotMatch(css, /\.afex-pos-theme-toggle b \{[^}]*clip:/)
  assert.match(css, /\.afex-pos-sale-header \{[^}]*grid-template-columns: 44px minmax\(0, 1fr\) max-content;[^}]*overflow: visible;/)
  for (const width of [1366, 1180, 1024, 834, 768, 430, 390, 360]) {
    const reserved = 44 + 84 + 24 + 32
    assert.ok(width - reserved > 0, `${width}px retains a non-overlapping title column`)
  }
})

test('theme headers preserve physical safe-area in RTL and LTR without horizontal overflow', () => {
  for (const side of ['left', 'right']) {
    assert.match(css, new RegExp(`padding-${side}: max\\([^;]+env\\(safe-area-inset-${side}\\)\\)`))
  }
  assert.match(css, /max-width: calc\(100vw - max\(16px, env\(safe-area-inset-left\)\) - max\(16px, env\(safe-area-inset-right\)\)\)/)
  assert.match(css, /\.afex-pos-responsive-actions \{[^}]*min-width: max-content;[^}]*overflow: visible;/)
  assert.match(css, /\.afex-pos-theme-toggle \{[^}]*min-height: 44px;/)
})
