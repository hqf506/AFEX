import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const css = readFileSync(new URL('../app/globals.css', import.meta.url), 'utf8')
const shell = readFileSync(new URL('../components/pos-shell/pos-responsive-shell.tsx', import.meta.url), 'utf8')
const themeToggle = readFileSync(new URL('../components/pos-theme-toggle.tsx', import.meta.url), 'utf8')
const login = readFileSync(new URL('../app/pos/login/page.tsx', import.meta.url), 'utf8')
const pin = readFileSync(new URL('../app/pos/employee-pin/page.tsx', import.meta.url), 'utf8')
const home = readFileSync(new URL('../app/pos/page.tsx', import.meta.url), 'utf8')
const orders = readFileSync(new URL('../app/pos/order-status/page.tsx', import.meta.url), 'utf8')
const customer = readFileSync(new URL('../components/invoice-customer-step.tsx', import.meta.url), 'utf8')
const items = readFileSync(new URL('../components/invoice-items-step.tsx', import.meta.url), 'utf8')
const checkout = readFileSync(new URL('../app/pos/sale/checkout/page.tsx', import.meta.url), 'utf8')
const success = readFileSync(new URL('../app/pos/sale/success/page.tsx', import.meta.url), 'utf8')
const successWorkspace = readFileSync(new URL('../components/pos-invoice-success-workspace.tsx', import.meta.url), 'utf8')

test('sale shell keeps one operational header outside its only scroll surface at every width', () => {
  assert.match(css, /\.afex-pos-app-shell\.is-sale-route \{[^}]*display: grid;[^}]*height: 100%;[^}]*overflow: hidden;[^}]*grid-template-rows: auto minmax\(0, 1fr\)/s)
  assert.match(css, /\.afex-pos-app-shell\.is-sale-route \.afex-pos-shell-content \{[^}]*height: auto;[^}]*overflow-x: hidden;[^}]*overflow-y: auto;/s)
  assert.match(css, /\.afex-pos-sale-header \{[^}]*position: sticky;[^}]*inset-block-start: 0;[^}]*z-index: 60;[^}]*width: 100%;[^}]*min-width: 0;/s)
  assert.doesNotMatch(css, /@media[^{}]*orientation[^{}]*\{[^{}]*afex-pos-sale-header/s)
})

test('shared header is rendered for every sale route and exposes exact operational controls', () => {
  assert.match(shell, /pathname\.startsWith\('\/pos\/sale\/'\)/)
  assert.match(shell, /data-testid="pos-sale-operational-header"/)
  assert.match(shell, /data-testid="pos-sale-home"/)
  assert.match(shell, /data-testid="pos-sale-step-back"/)
  assert.match(shell, /<PosThemeToggle \/>/)
  assert.match(shell, /\? \{ title: 'اختيار العميل', back: '\/pos' \}/)
  assert.match(shell, /\? \{ title: 'الدفع وإتمام الطلب', back: '\/pos\/sale\/items' \}/)
  assert.match(shell, /: \{ title: 'اختيار المنتجات', back: '\/pos\/sale\/customer' \}/)
})

test('eight-route essential-control inventory remains represented by operational source', () => {
  for (const [name, source, controls] of [
    ['login', login, ['كلمة المرور', 'تسجيل الدخول', 'العودة']],
    ['pin', pin, ['حذف', 'مسح', 'تسجيل الخروج']],
    ['home', home, ['بدء عملية بيع', 'الطلبات']],
    ['orders', orders, ['العودة إلى نقطة البيع', 'ابحث', 'تحديث', 'تم التجهيز', 'تم التسليم']],
    ['customer', customer, ['إضافة عميل', 'اختيار العميل', 'متابعة']],
    ['items', items, ['البحث', 'عرض السلة', 'إتمام البيع']],
    ['checkout', checkout, ['الخصم', 'ملاحظ', 'إنشاء الفاتورة']],
    ['success', `${success}\n${successWorkspace}`, ['WhatsApp', 'PDF', 'الحراري', 'بدء عملية بيع جديدة']],
  ]) for (const control of controls) assert.ok(source.includes(control), `${name}: missing ${control}`)
  assert.ok(themeToggle.includes('المظهر'))
  for (const requiredShellControl of ['تبديل الموظف', 'إنهاء وضع POS']) assert.ok(shell.includes(requiredShellControl))
})

test('essential sale controls retain safe geometry and no fixed/absolute positioning', () => {
  assert.match(css, /\.afex-pos-sale-home \{[^}]*min-width: 44px;[^}]*min-height: 44px;[^}]*flex: 0 0 auto;/s)
  assert.match(css, /\.afex-pos-sale-header > a \{[^}]*width: 44px;[^}]*height: 44px;/s)
  assert.doesNotMatch(css, /\.afex-pos-sale-header \{[^}]*(?:position: fixed|position: absolute)/s)
  assert.doesNotMatch(css, /\.afex-pos-sale-home \{[^}]*(?:position: fixed|position: absolute)/s)
})
