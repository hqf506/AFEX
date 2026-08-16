import { expect, test, type BrowserContext, type Page } from '@playwright/test'
import { mkdir } from 'node:fs/promises'
import path from 'node:path'

const baseURL = process.env.PLAYWRIGHT_TEST_BASE_URL || 'http://127.0.0.1:3100'
const evidenceRoot = path.join(process.env.USERPROFILE || '.', 'Downloads', 'AFEX-POS-PHASE6F-R2A-EVIDENCE')
const routes = ['/pos/sale/customer', '/pos/sale/items', '/pos/sale/checkout']
const viewports = [{ width: 430, height: 932 }, { width: 393, height: 852 }, { width: 390, height: 844 }, { width: 375, height: 812 }, { width: 360, height: 800 }, { width: 320, height: 568 }]
const profile = { id: '10000000-0000-4000-8000-000000000001', email: 'r2a@example.invalid', role: 'employee', full_name: 'R2A Fixture', is_active: true, tenant_id: '20000000-0000-4000-8000-000000000001', tenant_name: 'AFEX Fixture', branch_id: '30000000-0000-4000-8000-000000000001', scope_type: 'branch' }
const employee = { id: profile.id, username: 'r2a-fixture', full_name: profile.full_name, role: profile.role, branch_id: profile.branch_id }

function fixtureSession() {
  const expiresAt = Math.floor(Date.now() / 1000) + 3600
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url')
  const accessToken = `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ sub: profile.id, exp: expiresAt, aud: 'authenticated', role: 'authenticated', email: profile.email })}.fixture`
  const user = { id: profile.id, aud: 'authenticated', role: 'authenticated', email: profile.email, app_metadata: { provider: 'email', providers: ['email'] }, user_metadata: {}, identities: [], created_at: new Date().toISOString(), updated_at: new Date().toISOString() }
  return { access_token: accessToken, refresh_token: 'fixture', expires_at: expiresAt, expires_in: 3600, token_type: 'bearer', user }
}

async function installSafeFixture(context: BrowserContext, page: Page) {
  const session = fixtureSession()
  const cookieValue = `base64-${Buffer.from(JSON.stringify(session)).toString('base64url')}`
  await context.addCookies([
    { name: 'sb-127-auth-token', value: cookieValue, url: baseURL },
    { name: 'sb-fsxmnwucgotwhtlxuknt-auth-token', value: cookieValue, url: baseURL },
  ])
  await context.addInitScript(({ fixtureProfile, fixtureEmployee }) => {
    sessionStorage.setItem('lf_shared_auth_profile_v2', JSON.stringify({ profile: fixtureProfile, userId: fixtureProfile.id }))
    sessionStorage.setItem('leather_fix_pos_employee', JSON.stringify(fixtureEmployee))
    localStorage.setItem('invoice_customer', JSON.stringify({ customerId: 'fixture-customer', name: 'مسودة آمنة', phone: '' }))
    localStorage.setItem('invoice_sale_items', JSON.stringify({ items: [{ item_id: 'fixture-item', item_name: 'خدمة اختبار', item_type: 'service', quantity: 1, unit_price: 1, vat_rate: 0 }] }))
  }, { fixtureProfile: profile, fixtureEmployee: employee })
  await page.route(/\/auth\/v1\/|\/rest\/v1\//, async (route) => {
    const url = route.request().url()
    if (url.includes('/auth/v1/user')) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(session.user) })
    if (url.includes('/auth/v1/token')) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(session) })
    if (url.includes('/rest/v1/profiles')) {
      const wantsObject = route.request().headers()['accept']?.includes('application/vnd.pgrst.object+json')
      return route.fulfill({ status: 200, contentType: 'application/json', headers: { 'content-range': '0-0/1' }, body: JSON.stringify(wantsObject ? profile : [profile]) })
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
  })
  await page.route(`${baseURL}/api/**`, async (route) => {
    const url = route.request().url()
    if (url.includes('/api/customers')) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, customers: [] }) })
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, settings: {}, products: [], discounts: [] }) })
  })
}

async function visibleControlEvidence(page: Page, viewport: { width: number; height: number }) {
  const control = page.getByTestId('pos-sale-home')
  await expect(control).toHaveCount(1)
  await expect(control).toBeVisible()
  const result = await control.evaluate((element) => {
    const style = getComputedStyle(element)
    const rect = element.getBoundingClientRect()
    const center = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2)
    const parentChain: Array<{ tag: string; overflow: string }> = []
    for (let parent = element.parentElement; parent; parent = parent.parentElement) parentChain.push({ tag: parent.className || parent.tagName, overflow: getComputedStyle(parent).overflow })
    return { display: style.display, visibility: style.visibility, opacity: Number(style.opacity), rect: { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, width: rect.width, height: rect.height }, centerClickable: center === element || Boolean(center && element.contains(center)), centerElement: center ? `${center.tagName}.${(center as HTMLElement).className}` : null, parentChain, overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth }
  })
  expect(result.display).not.toBe('none')
  expect(result.visibility).not.toBe('hidden')
  expect(result.opacity).toBeGreaterThanOrEqual(0.99)
  expect(result.rect.width).toBeGreaterThanOrEqual(44)
  expect(result.rect.height).toBeGreaterThanOrEqual(44)
  expect(result.rect.left).toBeGreaterThanOrEqual(0)
  expect(result.rect.right).toBeLessThanOrEqual(viewport.width)
  expect(result.rect.top).toBeGreaterThanOrEqual(0)
  expect(result.rect.bottom).toBeLessThanOrEqual(viewport.height)
  expect(result.centerClickable, JSON.stringify(result)).toBe(true)
  expect(result.overflow).toBe(0)
  if (viewport.width >= 340) await expect(control.getByText('نقطة البيع')).toBeVisible()
  return result
}

test.describe('Phase 6F-R2A real route composition', () => {
  test.use({ baseURL, viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 3, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_4 like Mac OS X) AppleWebKit/605.1.15 Version/18.4 Mobile/15E148 Safari/604.1' })

  for (const mode of ['light', 'dark'] as const) for (const viewport of viewports) {
    test(`${mode} ${viewport.width}x${viewport.height}`, async ({ context, browserName }) => {
      await mkdir(evidenceRoot, { recursive: true })
      for (const route of routes) {
        const routePage = await context.newPage()
        await installSafeFixture(context, routePage)
        await routePage.emulateMedia({ colorScheme: mode })
        await routePage.setViewportSize(viewport)
        await routePage.goto(route)
        await expect(routePage).toHaveURL(new RegExp(`${route}$`))
        await visibleControlEvidence(routePage, viewport)
        if (browserName === 'webkit' && mode === 'dark' && viewport.width === 390) await routePage.screenshot({ path: path.join(evidenceRoot, `${route.split('/').at(-1)}-${browserName}-${viewport.width}x${viewport.height}.png`), fullPage: true })
        await routePage.close()
      }
    })
  }

  test('click navigation is explicit and draft-safe', async ({ context, page }) => {
    await installSafeFixture(context, page)
    const businessRequests: string[] = []
    page.on('request', (request) => { if (request.method() !== 'GET' && request.url().includes('/api/')) businessRequests.push(`${request.method()} ${new URL(request.url()).pathname}`) })
    await page.goto('/pos/sale/customer')
    await page.evaluate(() => { localStorage.removeItem('invoice_customer'); localStorage.removeItem('invoice_sale_items'); localStorage.removeItem('invoice_sale_checkout') })
    await page.getByTestId('pos-sale-home').click()
    await expect(page).toHaveURL(/\/pos$/)

    await page.goto('/pos/sale/customer')
    await page.evaluate(() => localStorage.setItem('invoice_customer', JSON.stringify({ customerId: 'fixture-customer', name: 'مسودة آمنة', phone: '' })))
    await page.getByTestId('pos-sale-home').click()
    await expect(page.getByRole('dialog', { name: 'العودة إلى نقطة البيع؟' })).toBeVisible()
    await page.getByRole('button', { name: 'متابعة عملية البيع' }).click()
    await expect(page).toHaveURL(/\/pos\/sale\/customer$/)
    await page.getByTestId('pos-sale-home').click()
    await page.getByRole('dialog', { name: 'العودة إلى نقطة البيع؟' }).getByRole('button', { name: 'العودة إلى نقطة البيع', exact: true }).click()
    await expect(page).toHaveURL(/\/pos$/)
    expect(await page.evaluate(() => Boolean(localStorage.getItem('invoice_customer')))).toBe(true)
    expect(businessRequests).toEqual([])
  })
})
