import { expect, test, type BrowserContext } from '@playwright/test'

const baseURL = process.env.PLAYWRIGHT_TEST_BASE_URL || 'http://127.0.0.1:3100'
const viewports = [
  { width: 1440, height: 1024 }, { width: 1366, height: 768 },
  { width: 1180, height: 820 }, { width: 1024, height: 768 },
  { width: 834, height: 1194 }, { width: 768, height: 1024 },
  { width: 430, height: 932 }, { width: 393, height: 852 },
  { width: 390, height: 844 }, { width: 375, height: 812 },
  { width: 360, height: 800 }, { width: 844, height: 390 },
]
const profile = { id: '10000000-0000-4000-8000-000000000041', email: 'r4@example.invalid', role: 'employee', full_name: 'R4 Fixture', is_active: true, tenant_id: '20000000-0000-4000-8000-000000000041', tenant_name: 'AFEX Fixture', branch_id: '30000000-0000-4000-8000-000000000041', scope_type: 'branch' }

function fixtureSession() {
  const expiresAt = Math.floor(Date.now() / 1000) + 3600
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url')
  const accessToken = `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ sub: profile.id, exp: expiresAt, aud: 'authenticated', role: 'authenticated', email: profile.email })}.fixture`
  const user = { id: profile.id, aud: 'authenticated', role: 'authenticated', email: profile.email, app_metadata: { provider: 'email', providers: ['email'] }, user_metadata: {}, identities: [], created_at: new Date().toISOString(), updated_at: new Date().toISOString() }
  return { access_token: accessToken, refresh_token: 'fixture', expires_at: expiresAt, expires_in: 3600, token_type: 'bearer', user }
}

async function installSafeFixture(context: BrowserContext) {
  const session = fixtureSession()
  const employee = { id: profile.id, username: 'r4-fixture', full_name: profile.full_name, role: profile.role, branch_id: profile.branch_id }
  const cookieValue = `base64-${Buffer.from(JSON.stringify(session)).toString('base64url')}`
  await context.addCookies([
    { name: 'sb-127-auth-token', value: cookieValue, url: baseURL },
    { name: 'sb-fsxmnwucgotwhtlxuknt-auth-token', value: cookieValue, url: baseURL },
  ])
  await context.addInitScript(({ fixtureProfile, fixtureEmployee }) => {
    sessionStorage.setItem('lf_shared_auth_profile_v2', JSON.stringify({ profile: fixtureProfile, userId: fixtureProfile.id }))
    sessionStorage.setItem('leather_fix_pos_employee', JSON.stringify(fixtureEmployee))
  }, { fixtureProfile: profile, fixtureEmployee: employee })
  await context.route(/\/auth\/v1\/|\/rest\/v1\//, async (route) => {
    const url = route.request().url()
    if (url.includes('/auth/v1/user')) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(session.user) })
    if (url.includes('/auth/v1/token')) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(session) })
    if (url.includes('/rest/v1/profiles')) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(profile) })
    return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
  })
  await context.route(`${baseURL}/api/**`, async (route) => {
    if (route.request().method() !== 'GET') return route.fulfill({ status: 409, contentType: 'application/json', body: JSON.stringify({ success: false, error: 'VISUAL_QUALIFICATION_WRITE_BLOCKED' }) })
    const url = route.request().url()
    if (url.includes('/api/pos/runtime')) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, runtime: { discounts: [], vat: { enabled: true, rate: 15 } } }) })
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, orders: [], settings: {} }) })
  })
}

test.describe('Phase 6H-R4 real POS route geometry', () => {
  test.use({ baseURL, hasTouch: true })

  test('actions and customer modal remain visible, reachable and write-free', async ({ context, page }) => {
    test.setTimeout(240_000)
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
        const actions = page.locator('.pos-home-action')
        await expect(actions).toHaveCount(4)
        expect(await page.locator('a[href^="/admin"]').count()).toBe(0)
        expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(0)
        const actionGeometry = []
        for (let index = 0; index < 4; index += 1) {
          const action = actions.nth(index)
          await action.evaluate((element) => element.scrollIntoView({ block: 'center', inline: 'nearest' }))
          actionGeometry.push(await action.evaluate((element, actionIndex) => {
            const rect = element.getBoundingClientRect()
            const center = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2)
            return { index: actionIndex, width: rect.width, height: rect.height, left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, clickable: center === element || Boolean(center && element.contains(center)) }
          }, index))
        }
        const invalidActions = actionGeometry.filter((rect) => !(rect.width >= 44 && rect.height >= 44 && rect.left >= 0 && rect.right <= viewport.width && rect.clickable))
        expect(invalidActions, `${mode} ${viewport.width}x${viewport.height}`).toEqual([])
        await expect(page.locator('.pos-home-action[href="/pos/order-status"]')).toHaveAttribute('href', '/pos/order-status')
        await expect(page.locator('.pos-home-action[href="/pos/offline-drafts"]')).toHaveAttribute('href', '/pos/offline-drafts')

        await page.getByRole('button', { name: /إضافة عميل/ }).click()
        const dialog = page.getByRole('dialog', { name: 'إضافة عميل جديد' })
        await expect(dialog).toBeVisible()
        const modalMetrics = await dialog.evaluate((element) => {
          const rect = element.getBoundingClientRect()
          const style = getComputedStyle(element)
          return { top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right, border: style.borderColor, background: style.backgroundColor }
        })
        expect(modalMetrics.top).toBeGreaterThanOrEqual(0)
        expect(modalMetrics.bottom).toBeLessThanOrEqual(viewport.height)
        expect(modalMetrics.left).toBeGreaterThanOrEqual(0)
        expect(modalMetrics.right).toBeLessThanOrEqual(viewport.width)
        expect(modalMetrics.border).not.toMatch(/rgba\([^)]*,\s*0\)/)
        expect(modalMetrics.background).not.toMatch(/rgba\([^)]*,\s*0\)/)
        const fields = dialog.locator('.pos-add-customer-field')
        expect(await fields.evaluateAll((elements) => elements.every((element) => {
          const style = getComputedStyle(element)
          return Number.parseFloat(style.fontSize) >= 16 && style.borderStyle !== 'none' && style.borderColor !== 'rgba(0, 0, 0, 0)'
        }))).toBe(true)
        await expect(page.getByRole('button', { name: 'حفظ العميل' })).toBeDisabled()
        await expect(dialog.locator('.pos-add-customer-validation')).toBeVisible()
        await page.getByRole('button', { name: 'إغلاق' }).click()
        await expect(dialog).toBeHidden()
        await page.getByRole('button', { name: /إضافة عميل/ }).click()
        await page.getByLabel('رقم الجوال').focus()
        await page.getByRole('button', { name: 'إلغاء' }).scrollIntoViewIfNeeded()
        await expect(page.getByRole('button', { name: 'إلغاء' })).toBeVisible()
        await page.getByRole('button', { name: 'إلغاء' }).click()
        await expect(dialog).toBeHidden()
      }
    }
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/pos')
    await page.locator('.pos-home-action.is-primary').click()
    await expect(page).toHaveURL(/\/pos\/sale\/customer$/)
    expect(writes).toEqual([])
  })
})
