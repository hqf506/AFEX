import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const itemsSource = readFileSync('components/invoice-items-step.tsx', 'utf8')
const itemsCss = readFileSync('components/pos-items-model-one.module.css', 'utf8')
const shellSource = readFileSync('components/pos-shell/pos-responsive-shell.tsx', 'utf8')
const globals = readFileSync('app/globals.css', 'utf8')

const itemsHeaderContract = itemsCss.slice(
  itemsCss.indexOf('@media (max-width: 767px),'),
  itemsCss.indexOf('@media (prefers-reduced-motion: reduce)')
)
const customerHeaderContract = globals.slice(
  globals.indexOf("@media (max-width: 767px),\n  (max-height: 500px) and (hover: none) and (pointer: coarse)", globals.indexOf('.afex-customer-workspace')),
  globals.indexOf('@media (max-width: 350px)', globals.indexOf('.afex-customer-workspace'))
)

test('items mobile header exposes one semantic four-control row with the shared theme toggle', () => {
  assert.equal((itemsSource.match(/<PosThemeToggle \/>/g) ?? []).length, 1)
  assert.match(itemsHeaderContract, /grid-template-areas:\s*'theme title sale back'/)
  assert.match(itemsHeaderContract, /grid-template-columns:\s*48px minmax\(0, 1fr\) 44px 44px/)
  assert.match(itemsHeaderContract, /\.catalogHeaderTitle,\s*\.headerActions\s*\{\s*display:\s*contents/)
  assert.match(itemsHeaderContract, /\.headerActions > :global\(\.afex-pos-theme-toggle\)\s*\{[^}]*grid-area:\s*theme/s)
  assert.match(itemsHeaderContract, /\.refreshButton\s*\{\s*display:\s*none/)
})

test('items preserves mobile search outside the compact top row and keeps every target at least 44px', () => {
  assert.match(itemsHeaderContract, /\.searchField\s*\{[^}]*inset-block-start:\s*calc\(100% \+ 7px\)[^}]*width:\s*44px[^}]*height:\s*44px/s)
  assert.match(itemsHeaderContract, /gap:\s*8px/)
  assert.match(itemsHeaderContract, /\.categories\s*\{[^}]*padding-inline-end:/s)
  assert.doesNotMatch(itemsHeaderContract, /\.headerActions[^}]*overflow:\s*hidden/s)
})

test('items cart sheet retains exactly one real close control and no business behavior changes', () => {
  assert.equal((itemsSource.match(/className=\{modelOneStyles\.cartClose\}/g) ?? []).length, 1)
  assert.equal((itemsSource.match(/aria-label="إغلاق ملخص الفاتورة"/g) ?? []).length, 1)
  assert.match(itemsCss, /\.cartClose\s*\{[^}]*display:\s*inline-flex/s)
})

test('customer mobile header keeps the shared toggle, employee avatar/name, and complete POS label', () => {
  const customerHeader = shellSource.slice(shellSource.indexOf('isCustomerRoute ? <header'), shellSource.indexOf('</header> : <header'))
  assert.equal((customerHeader.match(/<PosThemeToggle \/>/g) ?? []).length, 1)
  assert.match(customerHeader, /className="afex-pos-sale-employee"/)
  assert.match(customerHeader, /<span>نقطة البيع<\/span>/)
  assert.match(customerHeaderContract, /grid-template-columns:\s*minmax\(108px, 1\.1fr\) minmax\(54px, \.8fr\) minmax\(116px, 1fr\)/)
  assert.match(customerHeaderContract, /\.afex-pos-sale-employee\s*\{[^}]*min-width:\s*52px[^}]*max-width:\s*148px[^}]*height:\s*44px/s)
  assert.match(customerHeaderContract, /\.afex-pos-sale-right-controls \.afex-pos-sale-home span\s*\{[^}]*position:\s*static[^}]*overflow:\s*visible/s)
})

test('customer mobile identities use deliberate shrinking without clipping controls or hiding the POS label', () => {
  assert.match(customerHeaderContract, /\.afex-pos-sale-left-controls,\s*\.afex-pos-sale-right-controls\s*\{[^}]*gap:\s*8px[^}]*overflow:\s*visible/s)
  assert.match(customerHeaderContract, /\.afex-pos-sale-left-controls \.afex-pos-theme-toggle\s*\{[^}]*width:\s*48px[^}]*min-width:\s*48px[^}]*flex:\s*0 0 48px/s)
  assert.match(customerHeaderContract, /\.afex-pos-sale-right-controls > a\s*\{[^}]*width:\s*44px[^}]*height:\s*44px/s)
  assert.doesNotMatch(customerHeaderContract, /max-width:\s*70px|clip:\s*rect\(0 0 0 0\)/)
})

test('header corrections are phone and supported short-landscape scoped, not tablet or desktop overrides', () => {
  const combinedMedia = /@media \(max-width: 767px\),\s*\(max-height: 500px\) and \(hover: none\) and \(pointer: coarse\)/
  assert.match(itemsHeaderContract, combinedMedia)
  assert.match(customerHeaderContract, combinedMedia)
  assert.doesNotMatch(itemsHeaderContract, /min-width:\s*768px/)
  assert.doesNotMatch(customerHeaderContract, /min-width:\s*768px/)
})
