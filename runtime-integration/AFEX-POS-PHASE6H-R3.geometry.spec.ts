import { expect, test, type BrowserContext, type Page } from '@playwright/test'
import { mkdir } from 'node:fs/promises'
import path from 'node:path'

const baseURL = process.env.PLAYWRIGHT_TEST_BASE_URL || 'http://127.0.0.1:3100'
const evidenceRoot = path.join(process.env.USERPROFILE || '.', 'Downloads', 'AFEX-POS-PHASE6H-R3-EVIDENCE')
const viewports = [
  { width: 1440, height: 1024 }, { width: 1366, height: 768 },
  { width: 1180, height: 820 }, { width: 1024, height: 768 },
  { width: 834, height: 1194 }, { width: 768, height: 1024 },
  { width: 430, height: 932 }, { width: 393, height: 852 },
  { width: 390, height: 844 }, { width: 375, height: 812 },
  { width: 360, height: 800 }, { width: 320, height: 568 },
  { width: 844, height: 390 },
]
const profile = { id: '10000000-0000-4000-8000-000000000031', email: 'r3@example.invalid', role: 'employee', full_name: 'R3 Fixture', is_active: true, tenant_id: '20000000-0000-4000-8000-000000000031', tenant_name: 'AFEX Fixture', branch_id: '30000000-0000-4000-8000-000000000031', scope_type: 'branch' }
const employee = { id: profile.id, username: 'r3-fixture', full_name: profile.full_name, role: profile.role, branch_id: profile.branch_id }
const items = [
  { item_id: 'fixture-service', item_name: 'خدمة إصلاح جلد باسم طويل لاختبار سطرين', item_type: 'service', quantity: 2, unit_price: 120, vat_rate: 15 },
  { item_id: 'fixture-product', item_name: 'منتج عناية', item_type: 'product', quantity: 1, unit_price: 78, vat_rate: 15 },
]

function fixtureSession() {
  const expiresAt = Math.floor(Date.now() / 1000) + 3600
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url')
  const accessToken = `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ sub: profile.id, exp: expiresAt, aud: 'authenticated', role: 'authenticated', email: profile.email })}.fixture`
  const user = { id: profile.id, aud: 'authenticated', role: 'authenticated', email: profile.email, app_metadata: { provider: 'email', providers: ['email'] }, user_metadata: {}, identities: [], created_at: new Date().toISOString(), updated_at: new Date().toISOString() }
  return { access_token: accessToken, refresh_token: 'fixture', expires_at: expiresAt, expires_in: 3600, token_type: 'bearer', user }
}

async function installSafeFixture(context: BrowserContext) {
  const session = fixtureSession()
  const cookieValue = `base64-${Buffer.from(JSON.stringify(session)).toString('base64url')}`
  await context.addCookies([
    { name: 'sb-127-auth-token', value: cookieValue, url: baseURL },
    { name: 'sb-fsxmnwucgotwhtlxuknt-auth-token', value: cookieValue, url: baseURL },
  ])
  await context.addInitScript(({ fixtureProfile, fixtureEmployee, fixtureItems }) => {
    sessionStorage.setItem('lf_shared_auth_profile_v2', JSON.stringify({ profile: fixtureProfile, userId: fixtureProfile.id }))
    sessionStorage.setItem('leather_fix_pos_employee', JSON.stringify(fixtureEmployee))
    if (!localStorage.getItem('invoice_customer')) localStorage.setItem('invoice_customer', JSON.stringify({ customerId: 'fixture-customer', name: 'عميل المعاينة', phone: '0500000000' }))
    if (!localStorage.getItem('invoice_sale_items')) localStorage.setItem('invoice_sale_items', JSON.stringify({ items: fixtureItems }))
  }, { fixtureProfile: profile, fixtureEmployee: employee, fixtureItems: items })
  await context.route(/\/auth\/v1\/|\/rest\/v1\//, async (route) => {
    const url = route.request().url()
    if (url.includes('/auth/v1/user')) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(session.user) })
    if (url.includes('/auth/v1/token')) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(session) })
    if (url.includes('/rest/v1/profiles')) {
      const wantsObject = route.request().headers()['accept']?.includes('application/vnd.pgrst.object+json')
      return route.fulfill({ status: 200, contentType: 'application/json', headers: { 'content-range': '0-0/1' }, body: JSON.stringify(wantsObject ? profile : [profile]) })
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
  })
  await context.route(`${baseURL}/api/**`, async (route) => {
    const url = route.request().url()
    if (route.request().method() !== 'GET') return route.fulfill({ status: 409, contentType: 'application/json', body: JSON.stringify({ success: false, error: 'VISUAL_QUALIFICATION_WRITE_BLOCKED' }) })
    if (url.includes('/api/pos/runtime')) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, runtime: { discounts: [], vat: { enabled: true, rate: 15 } } }) })
    if (url.includes('/api/invoice/catalog')) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, products: [], total: 0, categories: [] }) })
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, settings: {}, orders: [] }) })
  })
}

async function geometry(page: Page, selector: string) {
  return page.locator(selector).first().evaluate((element) => {
    const rect = element.getBoundingClientRect()
    const style = getComputedStyle(element)
    const center = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2)
    return {
      rect: { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, width: rect.width, height: rect.height },
      display: style.display,
      visibility: style.visibility,
      opacity: Number(style.opacity),
      centerClickable: center === element || Boolean(center && element.contains(center)),
    }
  })
}

test.describe('Phase 6H-R3 production-route geometry', () => {
  test.use({ baseURL, hasTouch: true })

  test('all required viewports preserve scroll, cart, dock and preview geometry', async ({ context, page, browserName }) => {
    test.setTimeout(300_000)
    await installSafeFixture(context)
    const writes: string[] = []
    page.on('request', (request) => {
      if (request.method() !== 'GET' && request.url().includes('/api/')) writes.push(`${request.method()} ${new URL(request.url()).pathname}`)
    })

    for (const mode of ['light', 'dark'] as const) {
      await page.emulateMedia({ colorScheme: mode })
      for (const viewport of viewports) {
        await page.setViewportSize(viewport)

        await page.goto('/pos')
        await expect(page.locator('.pos-operational-home')).toBeVisible()
        const homeOverflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
        expect(homeOverflow).toBe(0)
        const homeOwners = await page.locator('.afex-pos-shell-content, .pos-operational-home, .pos-operational-canvas').evaluateAll((elements) => elements.filter((element) => /(auto|scroll)/.test(getComputedStyle(element).overflowY) && element.scrollHeight > element.clientHeight + 1).length)
        expect(homeOwners).toBeLessThanOrEqual(1)

        await page.goto('/pos/sale/items')
        await expect(page.locator('.afex-sale-catalog')).toBeVisible()
        const catalogOverflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
        expect(catalogOverflow).toBe(0)
        if (viewport.width <= 767 || viewport.height <= 500) {
          await expect(page.locator('.afex-sale-mobile-summary')).toBeVisible()
          await page.locator('.afex-sale-mobile-summary button').click()
          await expect(page.locator('[data-mobile-cart-sheet]')).toBeVisible()
          const itemRect = await geometry(page, '.afex-mobile-cart-item')
          expect(itemRect.rect.height).toBeGreaterThanOrEqual(100)
          const stepperRect = await geometry(page, '.afex-mobile-quantity-stepper')
          expect(stepperRect.rect.width).toBeLessThanOrEqual(152)
          expect(stepperRect.rect.height).toBeGreaterThanOrEqual(44)
          const totalLine = page.locator('.afex-mobile-cart-total-lines > div').first()
          const totalGap = await totalLine.evaluate((element) => {
            const [label, value] = Array.from(element.children).map((child) => child.getBoundingClientRect())
            return Math.max(0, Math.max(label.left, value.left) - Math.min(label.right, value.right))
          })
          expect(totalGap).toBeLessThanOrEqual(24)
        }

        await page.goto('/pos/sale/checkout')
        const previewButton = page.getByRole('button', { name: 'عرض تفاصيل الطلب' }).filter({ visible: true }).first()
        await expect(previewButton).toBeVisible()
        const previewButtonRect = await previewButton.evaluate((element) => {
          const rect = element.getBoundingClientRect()
          const center = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2)
          return { width: rect.width, height: rect.height, clickable: center === element || Boolean(center && element.contains(center)) }
        })
        expect(previewButtonRect.height).toBeGreaterThanOrEqual(44)
        expect(previewButtonRect.clickable).toBe(true)
        const beforeUrl = page.url()
        await previewButton.click()
        const dialog = page.getByRole('dialog', { name: 'معاينة قبل الإنشاء' })
        await expect(dialog).toBeVisible()
        await expect(dialog.locator('iframe[title="معاينة الإيصال الحراري قبل الإنشاء"]')).toBeVisible()
        expect(page.url()).toBe(beforeUrl)
        const closeButton = page.getByRole('button', { name: 'إغلاق معاينة الإيصال' })
        const closeRect = await geometry(page, '.afex-thermal-curtain-close')
        expect(closeRect.rect.width).toBeGreaterThanOrEqual(44)
        expect(closeRect.rect.height).toBeGreaterThanOrEqual(44)
        expect(closeRect.centerClickable).toBe(true)
        await closeButton.click()
        await expect(dialog).toBeHidden()
        await expect(previewButton).toBeFocused()

        const dock = await geometry(page, '[data-checkout-action-dock]')
        expect(dock.rect.width).toBeGreaterThan(0)
        const dockBackground = await page.locator('[data-checkout-action-dock]').evaluate((element) => getComputedStyle(element).backgroundColor)
        expect(dockBackground).not.toMatch(/rgba\([^)]*,\s*0\)/)
      }
    }

    if (browserName === 'webkit') {
      await mkdir(evidenceRoot, { recursive: true })
      await page.setViewportSize({ width: 390, height: 844 })
      await page.goto('/pos/sale/checkout')
      await page.getByRole('button', { name: 'عرض تفاصيل الطلب' }).filter({ visible: true }).first().click()
      await page.screenshot({ path: path.join(evidenceRoot, 'checkout-thermal-webkit-390x844.png'), fullPage: false })
    }
    expect(writes).toEqual([])
  })

  test('cart density, repeated preview, rotation and cash keyboard remain stable', async ({ context, page }) => {
    test.setTimeout(120_000)
    await installSafeFixture(context)
    const writes: string[] = []
    page.on('request', (request) => {
      if (request.method() !== 'GET' && request.url().includes('/api/')) writes.push(`${request.method()} ${new URL(request.url()).pathname}`)
    })
    await page.setViewportSize({ width: 390, height: 844 })

    for (const count of [1, 2, 6, 15]) {
      const denseItems = Array.from({ length: count }, (_, index) => ({
        item_id: `density-${count}-${index}`,
        item_name: index % 2 === 0 ? `خدمة طويلة جدًا لاختبار وضوح بطاقة السلة رقم ${index + 1}` : `منتج ${index + 1}`,
        item_type: index % 2 === 0 ? 'service' : 'product',
        quantity: index === 0 ? 10 : index === 1 ? 2 : 1,
        unit_price: 25 + index,
        vat_rate: 15,
      }))
      await page.goto('/pos/sale/items')
      await page.evaluate((fixtureItems) => localStorage.setItem('invoice_sale_items', JSON.stringify({ items: fixtureItems })), denseItems)
      await page.reload()
      await page.locator('.afex-sale-mobile-summary button').click()
      const cards = page.locator('.afex-mobile-cart-item')
      await expect(cards).toHaveCount(count)
      const rectangles = await cards.evaluateAll((elements) => elements.map((element) => {
        const rect = element.getBoundingClientRect()
        return { top: rect.top, bottom: rect.bottom, height: rect.height }
      }))
      expect(rectangles.every((rect) => rect.height >= 100)).toBe(true)
      expect(rectangles.slice(1).every((rect, index) => rect.top >= rectangles[index].bottom - 1)).toBe(true)
    }

    await page.goto('/pos/sale/checkout')
    for (let index = 0; index < 3; index += 1) {
      const trigger = page.getByRole('button', { name: 'عرض تفاصيل الطلب' }).filter({ visible: true }).first()
      await trigger.click()
      await expect(page.getByRole('dialog', { name: 'معاينة قبل الإنشاء' })).toBeVisible()
      await page.getByRole('button', { name: 'إغلاق معاينة الإيصال' }).click()
      await expect(trigger).toBeFocused()
    }
    await page.setViewportSize({ width: 844, height: 390 })
    await expect(page.getByRole('button', { name: 'عرض تفاصيل الطلب' }).filter({ visible: true }).first()).toBeVisible()
    await page.setViewportSize({ width: 390, height: 844 })
    await page.getByRole('button', { name: /^نقد/ }).click()
    const cashInput = page.getByLabel('المبلغ المستلم')
    await cashInput.focus()
    await expect(cashInput).toBeFocused()
    await cashInput.blur()
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(0)
    expect(writes).toEqual([])
  })
})
