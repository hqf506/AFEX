import { expect, test, type BrowserContext, type Page } from '@playwright/test'
import { mkdir } from 'node:fs/promises'
import path from 'node:path'

const baseURL = 'http://127.0.0.1:3100'
const evidenceRoot = path.join(process.env.USERPROFILE || '.', 'Downloads', 'AFEX-POS-PHASE6F-EVIDENCE')
const fixtureProfile = {
  id: '10000000-0000-4000-8000-000000000001',
  email: 'mobile-fixture@example.invalid',
  role: 'employee',
  full_name: 'Mobile Fixture',
  is_active: true,
  tenant_id: '20000000-0000-4000-8000-000000000001',
  tenant_name: 'AFEX Fixture',
  branch_id: '30000000-0000-4000-8000-000000000001',
  scope_type: 'branch',
}

function jwt(payload: Record<string, unknown>) {
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url')
  return `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode(payload)}.fixture-signature`
}

function createFixtureSession() {
  const expiresAt = Math.floor(Date.now() / 1000) + 3600
  const issuedAt = Math.floor(Date.now() / 1000)
  const accessToken = jwt({ sub: fixtureProfile.id, exp: expiresAt, iat: issuedAt, aud: 'authenticated', role: 'authenticated', email: fixtureProfile.email })
  const fixtureUser = {
    id: fixtureProfile.id,
    aud: 'authenticated',
    role: 'authenticated',
    email: fixtureProfile.email,
    email_confirmed_at: new Date(issuedAt * 1000).toISOString(),
    confirmed_at: new Date(issuedAt * 1000).toISOString(),
    app_metadata: { provider: 'email', providers: ['email'] },
    user_metadata: {},
    identities: [],
    created_at: new Date(issuedAt * 1000).toISOString(),
    updated_at: new Date(issuedAt * 1000).toISOString(),
  }
  return {
    access_token: accessToken,
    refresh_token: 'fixture-refresh-token',
    expires_at: expiresAt,
    expires_in: 3600,
    token_type: 'bearer',
    user: fixtureUser,
  }
}

async function installSafeFixture(context: BrowserContext) {
  const session = createFixtureSession()
  const cookieValue = `base64-${Buffer.from(JSON.stringify(session)).toString('base64url')}`
  await context.addCookies([
    { name: 'sb-127-auth-token', value: cookieValue, url: baseURL },
    { name: 'sb-example-auth-token', value: cookieValue, url: baseURL },
  ])
  await context.addInitScript(({ profile }) => {
    sessionStorage.setItem('lf_shared_auth_profile_v2', JSON.stringify({ profile, userId: profile.id }))
  }, { profile: fixtureProfile })
}

async function installSafeRoutes(page: Page) {
  await page.route(/\/auth\/v1\/|\/rest\/v1\//, async (route) => {
    const url = route.request().url()
    if (url.includes('/auth/v1/token')) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(createFixtureSession()) })
      return
    }
    if (url.includes('/auth/v1/user')) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(createFixtureSession().user) })
      return
    }
    if (url.includes('/rest/v1/profiles')) {
      const wantsObject = route.request().headers()['accept']?.includes('application/vnd.pgrst.object+json')
      await route.fulfill({ status: 200, contentType: 'application/json', headers: { 'content-range': '0-0/1' }, body: JSON.stringify(wantsObject ? fixtureProfile : [fixtureProfile]) })
      return
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
  })
  await page.route(`${baseURL}/api/**`, async (route) => {
    const url = route.request().url()
    if (url.includes('/api/auth/login')) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, session: createFixtureSession() }) })
      return
    }
    if (url.includes('/api/pos/runtime')) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, context: fixtureProfile }) })
      return
    }
    if (url.includes('/api/customers')) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, customers: [{ id: 'customer-1', name: 'عميل اختبار طويل الاسم', phone: '0500000000' }] }) })
      return
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, settings: {} }) })
  })
}

async function geometry(page: Page, selectors: string[]) {
  return page.evaluate((targets) => ({
    viewport: { width: innerWidth, height: innerHeight, visualHeight: visualViewport?.height ?? innerHeight },
    documentWidth: document.documentElement.scrollWidth,
    elements: Object.fromEntries(targets.map((selector) => {
      const element = document.querySelector<HTMLElement>(selector)
      if (!element) return [selector, null]
      const rect = element.getBoundingClientRect()
      const style = getComputedStyle(element)
      return [selector, { x: rect.x, y: rect.y, width: rect.width, height: rect.height, display: style.display, visibility: style.visibility, overflow: style.overflow, fontSize: style.fontSize }]
    })),
  }), selectors)
}

const mobileViewports = [
  { width: 393, height: 852 },
  { width: 390, height: 844 },
  { width: 430, height: 932 },
  { width: 375, height: 812 },
  { width: 360, height: 800 },
  { width: 320, height: 568 },
]

test.describe('Phase 6F mobile runtime reproduction', () => {
  test.use({
    baseURL,
    viewport: { width: 393, height: 852 },
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_4 like Mac OS X) AppleWebKit/605.1.15 Version/18.4 Mobile/15E148 Safari/604.1',
    hasTouch: true,
    isMobile: true,
    deviceScaleFactor: 3,
  })

  test('login fields are measurable and editable', async ({ page, browserName }) => {
    await mkdir(evidenceRoot, { recursive: true })
    await installSafeRoutes(page)
    await page.goto('/pos/login')
    const username = page.locator('#pos-mobile-login-username')
    const password = page.locator('#pos-mobile-login-password')
    await expect(username).toBeVisible()
    await expect(password).toBeVisible()
    await username.fill('safe-fixture')
    await password.fill('safe-fixture')
    console.log('LOGIN_GEOMETRY', browserName, JSON.stringify(await geometry(page, ['.pos-entry-login', '#pos-mobile-login-username', '#pos-mobile-login-password', 'button[type="submit"]'])))
    await page.screenshot({ path: path.join(evidenceRoot, `before-login-${browserName}.png`), fullPage: true })
  })

  for (const colorScheme of ['light', 'dark'] as const) {
    for (const viewport of mobileViewports) {
      test(`login geometry ${colorScheme} ${viewport.width}x${viewport.height}`, async ({ page, browserName }) => {
        await mkdir(evidenceRoot, { recursive: true })
        await page.emulateMedia({ colorScheme })
        await page.setViewportSize(viewport)
        await installSafeRoutes(page)
        await page.goto('/pos/login')
        const username = page.locator('#pos-mobile-login-username')
        const password = page.locator('#pos-mobile-login-password')
        await expect(username).toBeEditable()
        await expect(password).toBeEditable()
        for (const locator of [username, password, page.getByRole('button', { name: 'إظهار كلمة المرور' }), page.getByRole('button', { name: 'تسجيل الدخول' })]) {
          const box = await locator.boundingBox()
          expect(box?.height ?? 0).toBeGreaterThanOrEqual(44)
          expect((box?.x ?? -1) + (box?.width ?? viewport.width)).toBeLessThanOrEqual(viewport.width)
        }
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
        expect(overflow).toBe(0)
        await page.screenshot({ path: path.join(evidenceRoot, `login-${browserName}-${colorScheme}-${viewport.width}x${viewport.height}.png`), fullPage: true })
      })
    }
  }

  test('PIN route has one document load and no auth request storm', async ({ context, page, browserName }) => {
    await mkdir(evidenceRoot, { recursive: true })
    await installSafeFixture(context)
    await installSafeRoutes(page)
    const navigations: string[] = []
    const requests: string[] = []
    const documentRequests: string[] = []
    const consoleEvents: string[] = []
    page.on('console', (message) => consoleEvents.push(`${message.type()}:${message.text()}`))
    page.on('framenavigated', (frame) => { if (frame === page.mainFrame()) navigations.push(new URL(frame.url()).pathname) })
    page.on('request', (request) => {
      if (request.resourceType() === 'document') documentRequests.push(new URL(request.url()).pathname)
      if (request.url().includes('/api/') || request.url().includes('/auth/v1/')) requests.push(`${request.method()} ${new URL(request.url()).pathname}`)
    })
    await page.goto('/pos/employee-pin')
    const mounted = await page.locator('.pos-entry-pin').isVisible().catch(() => false)
    if (mounted) await page.screenshot({ path: path.join(evidenceRoot, `pin-mounted-${browserName}.png`), fullPage: true })
    await page.waitForTimeout(2500)
    const browserStorage = await page.evaluate(() => ({ cookies: document.cookie.split(';').map((value) => value.trim().split('=')[0]), storage: Object.keys(sessionStorage) }))
    console.log('PIN_TRACE', browserName, JSON.stringify({ url: new URL(page.url()).pathname, navigations, requests, documentRequests, consoleEvents, browserStorage }))
    console.log('PIN_GEOMETRY', browserName, JSON.stringify(await geometry(page, ['.pos-entry-pin', '.pos-pin-frame'])))
    await page.screenshot({ path: path.join(evidenceRoot, `before-pin-${browserName}.png`), fullPage: true })
    expect(documentRequests.filter((pathName) => pathName === '/pos/employee-pin')).toHaveLength(1)
    expect(requests.filter((request) => request.includes('/auth/v1/')).length).toBeLessThanOrEqual(1)
    await expect(page).toHaveURL(/\/pos\/(employee-pin|login)$/)
  })
})
