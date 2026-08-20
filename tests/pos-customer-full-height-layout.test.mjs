import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const css = readFileSync('app/globals.css', 'utf8')
const shell = readFileSync('components/pos-shell/pos-responsive-shell.tsx', 'utf8')
const workspace = readFileSync('components/pos-customer-workspace.tsx', 'utf8')

test('customer content no longer renders the duplicate hero', () => {
  assert.doesNotMatch(workspace, /afex-customer-header|afex-customer-eyebrow|عملية بيع جديدة/)
  assert.doesNotMatch(workspace, /<h1>اختيار العميل<\/h1>/)
})

test('customer route places theme and employee together in the topbar left area', () => {
  assert.match(shell, /<div className="afex-pos-sale-left-controls">\s*<PosThemeToggle \/>\s*<section className="afex-pos-sale-employee"/s)
  assert.match(shell, /<div className="afex-pos-sale-right-controls">[\s\S]*data-testid="pos-sale-step-back"[\s\S]*data-testid="pos-sale-home"/)
})

test('employee identity has exactly one customer-route presentation source', () => {
  assert.equal((shell.match(/className="afex-pos-sale-employee"/g) || []).length, 1)
  assert.doesNotMatch(workspace, /employeeName|afex-customer-operator/)
})

test('three-area topbar keeps the customer title centered in the viewport', () => {
  assert.match(css, /\.afex-pos-sale-header\.is-customer \{[^}]*grid-template-areas: 'left title right'[^}]*grid-template-columns: minmax\(0, 1fr\) auto minmax\(0, 1fr\)/s)
  assert.match(css, /\.afex-pos-sale-header\.is-customer > strong \{[^}]*grid-area: title[^}]*justify-self: center/s)
})

test('customer content begins within sixteen pixels of the topbar', () => {
  const match = css.match(/\.afex-customer-workspace \{[^}]*padding: (\d+)px 20px/s)
  assert.ok(match)
  assert.ok(Number(match[1]) >= 12 && Number(match[1]) <= 16)
})

test('customer route consumes only the shell row remaining below the real topbar', () => {
  assert.match(css, /\.afex-pos-app-shell\.is-sale-route \{[^}]*grid-template-rows: auto minmax\(0, 1fr\)/s)
  assert.match(css, /\.afex-pos-app-shell\.is-sale-route\.is-customer-route \.afex-pos-shell-content \{ overflow: hidden; \}/)
  assert.match(css, /\.afex-pos-app-shell\.is-sale-route\.is-customer-route \.afex-pos-route-content \{[^}]*height: 100%[^}]*min-height: 0[^}]*overflow: hidden/s)
})

test('desktop and tablet customer grid uses the approved right profile width and gap', () => {
  assert.match(css, /\.afex-customer-layout \{[^}]*height: 100%[^}]*grid-template-columns: 355px minmax\(0, 1fr\)[^}]*gap: 18px/s)
  assert.match(workspace, /<aside className="afex-customer-ticket"[\s\S]*<section className="afex-customer-panel"/)
})

test('search and profile panels fill the available height without horizontal escape', () => {
  assert.match(css, /\.afex-customer-ticket \{[^}]*min-width: 0[^}]*min-height: 0[^}]*height: 100%[^}]*overflow: hidden/s)
  assert.match(css, /\.afex-customer-panel \{[^}]*min-width: 0[^}]*min-height: 0[^}]*height: 100%[^}]*overflow: hidden/s)
  assert.match(css, /\.afex-customer-results \{[^}]*flex: 1 1 auto[^}]*overflow-y: auto/s)
})

test('authorized customer profile retains all ten approved detail fields', () => {
  const labels = ['رقم الجوال', 'البريد الإلكتروني', 'المدينة', 'العنوان', 'ملاحظات', 'رقم العميل', 'تاريخ التسجيل', 'عدد الزيارات', 'إجمالي المشتريات', 'آخر طلب']
  for (const label of labels) assert.match(workspace, new RegExp(`label="${label}"`))
})

test('customer details use compact rows with accessible overflow disclosure', () => {
  assert.match(css, /\.afex-customer-detail-row \{[^}]*height: 34px[^}]*min-height: 34px/s)
  assert.match(css, /\.afex-customer-detail-group \{ display: grid; gap: 6px; \}/)
  assert.match(css, /\.afex-customer-detail-icon svg \{ width: 17px; height: 17px; \}/)
  assert.match(workspace, /<strong dir=\{ltr \? 'ltr' : undefined\} title=\{valueTitle\}>/)
})

test('profile controls remain static with the approved exact heights', () => {
  assert.match(css, /\.afex-customer-ticket-actions button \{ height: 42px; min-height: 42px;/)
  assert.match(css, /\.afex-customer-ticket-footer a \{ min-height: 44px;/)
  assert.match(css, /\.afex-customer-ticket-footer button \{ min-height: 48px;/)
  assert.doesNotMatch(workspace, /position:\s*(?:absolute|fixed)/)
})

test('typical complete profile and controls fit at 1024x768 and 1194x834', () => {
  const required = 32 + 6 + 56 + 6 + (10 * 34) + (7 * 6) + (2 * 6) + 8 + 42 + 8 + 44 + 8 + 48
  for (const [width, height, horizontalPadding, bottomPadding] of [[1024, 768, 16, 16], [1194, 834, 20, 20]]) {
    const available = height - 64 - 14 - bottomPadding - 2 - 20
    assert.ok(width - (horizontalPadding * 2) - 355 - 18 > 0)
    assert.ok(required <= available, `${width}x${height}: required ${required}, available ${available}`)
  }
})

test('only detail and result bodies own overflow on tablet', () => {
  assert.match(css, /\.afex-customer-profile-scroll \{[^}]*overflow-y: auto/s)
  assert.match(css, /\.afex-customer-results \{[^}]*overflow-y: auto/s)
  assert.match(css, /\.afex-customer-profile \{[^}]*overflow: hidden/s)
  assert.match(css, /\.afex-customer-ticket-footer \{[^}]*flex: 0 0 auto/s)
})

test('mobile remains one column with search first and employee name retained', () => {
  assert.match(css, /@media \(max-width: 767px\)[\s\S]*\.afex-customer-layout \{ display: flex; flex-direction: column; \}/)
  assert.match(css, /@media \(max-width: 767px\)[\s\S]*\.afex-customer-ticket \{ order: 2/)
  assert.match(css, /@media \(max-width: 767px\)[\s\S]*\.afex-customer-panel \{ order: 1/)
  assert.match(css, /\.afex-pos-sale-employee small \{ display: none; \}/)
  assert.doesNotMatch(css, /\.afex-pos-sale-employee b \{[^}]*display:\s*none/s)
})

test('customer search, selection, add and continue handlers remain wired', () => {
  for (const marker of ['onPhoneChange', 'onNameChange', 'onSelect(customer)', 'onAddCustomer', 'onContinue']) assert.match(workspace, new RegExp(marker.replace(/[()]/g, '\\$&')))
})
