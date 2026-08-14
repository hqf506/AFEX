import fs from 'node:fs/promises'
import process from 'node:process'
import puppeteer from 'puppeteer-core'

const credentialPath = process.env.AFEX_PERFORMANCE_CREDENTIAL_FILE
const outputPath = process.env.AFEX_PERFORMANCE_OUTPUT
const protectionBypassPath = process.env.AFEX_VERCEL_PROTECTION_BYPASS_FILE
const chromePath = process.env.AFEX_CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
const fastSamples = Number(process.env.AFEX_PERFORMANCE_FAST_SAMPLES || process.env.AFEX_PERFORMANCE_SAMPLES || 15)
const fourGSamples = Number(process.env.AFEX_PERFORMANCE_4G_SAMPLES || process.env.AFEX_PERFORMANCE_SAMPLES || 10)
const targets = (process.env.AFEX_PERFORMANCE_TARGETS || '').split(',').filter(Boolean)
const diagnosticMode = process.env.AFEX_PERFORMANCE_DIAGNOSTIC === '1'
const scenarioIndex = process.argv.indexOf('--scenario')
const scenario = scenarioIndex >= 0 ? process.argv[scenarioIndex + 1] : 'all'
const networks = (process.env.AFEX_PERFORMANCE_NETWORKS || 'fast,4g').split(',').filter((value) => ['fast', '4g'].includes(value))
const viewports = (process.env.AFEX_PERFORMANCE_VIEWPORTS || 'desktop,mobile').split(',').filter((value) => ['desktop', 'mobile'].includes(value))
const protectionBypass = protectionBypassPath
  ? (await fs.readFile(protectionBypassPath, 'utf8')).trim()
  : process.env.AFEX_VERCEL_PROTECTION_BYPASS

if (!['all', 'orders', 'warm-catalog', 'customer-search', 'catalog-interaction', 'checkout-replay'].includes(scenario)) {
  throw new Error(`Unsupported performance scenario: ${scenario}`)
}
if (!credentialPath || !outputPath || targets.length === 0 || !protectionBypass || networks.length === 0 || viewports.length === 0 || fastSamples < (diagnosticMode ? 1 : 15) || fourGSamples < (diagnosticMode ? 1 : 10)) {
  throw new Error('Missing bounded R3 performance harness configuration.')
}

const credentials = JSON.parse(await fs.readFile(credentialPath, 'utf8'))
const browser = await puppeteer.launch({ executablePath: chromePath, headless: true, args: ['--no-first-run'] })
const percentile = (values, ratio) => [...values].sort((a, b) => a - b)[Math.min(values.length - 1, Math.ceil(values.length * ratio) - 1)]
const summarize = (values) => ({ values, samples: values.length, min: Math.min(...values), p50: percentile(values, .5), p75: percentile(values, .75), p95: percentile(values, .95), max: Math.max(...values) })
const waitForPath = (page, path) => page.waitForFunction((expected) => location.pathname === expected, { timeout: 20_000 }, path)
const clickButton = async (page, label) => {
  let clicked
  try {
    clicked = await page.evaluate((expected) => {
      const button = Array.from(document.querySelectorAll('button')).find((node) => node.textContent?.trim() === expected)
      if (!button) return false
      button.click()
      return true
    }, label)
  } catch (error) {
    if (String(error).includes('Execution context was destroyed')) return
    throw error
  }
  if (!clicked) throw new Error(`Button unavailable: ${label}`)
  await new Promise((resolve) => setTimeout(resolve, 50))
}
const clickLink = async (page, href) => { const link = await page.$(`a[href="${href}"]`); if (!link) throw new Error(`Link unavailable: ${href}`); await link.click() }

async function preparePage(page, viewport, networkProfile) {
  await page.setViewport(viewport)
  await page.setExtraHTTPHeaders({ 'x-vercel-protection-bypass': protectionBypass })
  if (networkProfile === '4g') {
    const session = await page.createCDPSession(); await session.send('Network.enable')
    await session.send('Network.emulateNetworkConditions', { offline: false, latency: 90, downloadThroughput: 200_000, uploadThroughput: 93_750, connectionType: 'cellular4g' })
  }
  await page.evaluateOnNewDocument(() => {
    globalThis.__afexR3 = { start: null, sourcePath: null, eventType: null }
    document.addEventListener('pointerdown', (event) => {
      const target = event.target instanceof Element ? event.target.closest('a,button') : null
      if (!target) return
      globalThis.__afexR3 = { start: performance.now(), sourcePath: location.pathname, eventType: 'pointerdown' }
    }, true)
  })
}

async function authenticate(page, origin) {
  await page.goto(`${origin}/pos/login`, { waitUntil: 'domcontentloaded', timeout: 30_000 })
  await page.waitForSelector('#pos-login-username, #pos-mobile-login-username', { timeout: 20_000 })
  await new Promise((resolve) => setTimeout(resolve, 1_000))
  const loginPrefix = await page.evaluate(() => document.querySelector('#pos-mobile-login-username') ? '#pos-mobile-login' : '#pos-login')
  await page.waitForSelector(`${loginPrefix}-username`, { timeout: 20_000 })
  const setLoginValues = () => page.evaluate(({ prefix, username, password }) => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
    for (const [selector, value] of [[`${prefix}-username`, username], [`${prefix}-password`, password]]) {
      const input = document.querySelector(selector)
      if (!(input instanceof HTMLInputElement) || !setter) throw new Error(`Login input unavailable: ${selector}`)
      setter.call(input, value)
      input.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: value }))
      input.dispatchEvent(new Event('change', { bubbles: true }))
    }
  }, { prefix: loginPrefix, username: credentials.username, password: credentials.password })
  await setLoginValues()
  const loginResponse = page.waitForResponse((response) => new URL(response.url()).pathname === '/api/auth/login' && response.request().method() === 'POST', { timeout: 20_000 })
  const submitLogin = () => page.click(`form:has(${loginPrefix}-username) button[type="submit"]`).catch((error) => {
    if (!String(error).includes('Execution context was destroyed')) throw error
  })
  await submitLogin()
  const earlyResponse = await Promise.race([loginResponse, new Promise((resolve) => setTimeout(() => resolve(null), 3_000))])
  if (!earlyResponse) {
    await setLoginValues()
    await submitLogin()
  }
  const response = earlyResponse || await loginResponse
  if (!response.ok()) throw new Error(`POS authentication request failed with HTTP ${response.status()}.`)
  await waitForPath(page, '/pos/employee-pin').catch(async (error) => {
    const state = await page.evaluate(() => ({
      pathname: location.pathname,
      message: Array.from(document.querySelectorAll('[role="alert"], [role="status"], p')).map((node) => node.textContent?.trim()).find(Boolean) || null,
    }))
    throw new Error(`POS authentication did not reach PIN entry: ${JSON.stringify(state)}`, { cause: error })
  })
  await page.waitForFunction(() => document.querySelectorAll('button').length >= 10, { timeout: 20_000 })
  for (const digit of credentials.pin) await clickButton(page, digit)
  await waitForPath(page, '/pos')
  await page.waitForFunction(() => Boolean(document.querySelector('a[href="/pos/order-status"]')), { timeout: 30_000 })
}

async function timedClick(page, click, expectedPath, marker) {
  const before = await page.evaluate(() => ({ path: location.pathname, navigationCount: performance.getEntriesByType('navigation').length }))
  await click()
  await waitForPath(page, expectedPath)
  await page.waitForFunction(marker, { timeout: 20_000 }, credentials.tag.toUpperCase())
  const after = await page.evaluate(() => ({ duration: Math.round(performance.now() - globalThis.__afexR3.start), sourcePath: globalThis.__afexR3.sourcePath, eventType: globalThis.__afexR3.eventType, path: location.pathname, navigationCount: performance.getEntriesByType('navigation').length }))
  if (!after.sourcePath || after.eventType !== 'pointerdown' || after.path !== expectedPath || after.navigationCount !== before.navigationCount) throw new Error(`Invalid navigation evidence: ${JSON.stringify(after)}`)
  return after.duration
}

async function measureCell(origin, viewport, networkProfile, sampleCount) {
  const context = await browser.createBrowserContext(), page = await context.newPage()
  await preparePage(page, viewport, networkProfile)
  let requestCount = 0; const serverTiming = []
  page.on('request', (request) => { if (['fetch', 'xhr'].includes(request.resourceType())) requestCount += 1 })
  page.on('response', async (response) => { const value = response.headers()['server-timing']; if (value) serverTiming.push({ path: new URL(response.url()).pathname, value }) })
  await authenticate(page, origin)
  const orders = [], catalog = [], requests = []
  const initialOrdersRefresh = page.waitForResponse((response) => new URL(response.url()).pathname === '/api/orders', { timeout: 20_000 })
  await timedClick(page, () => clickLink(page, '/pos/order-status'), '/pos/order-status', () => Boolean(document.querySelector('.pos-order-status-page input')) && !document.querySelector('.pos-order-status-page .animate-pulse'))
  await initialOrdersRefresh
  await timedClick(page, () => page.click('button[aria-label="العودة إلى نقطة البيع"]'), '/pos', () => Boolean(document.querySelector('a[href="/pos/order-status"]')))
  for (let index = 0; index < sampleCount; index += 1) {
    const startedRequests = requestCount
    orders.push(await timedClick(page, () => clickLink(page, '/pos/order-status'), '/pos/order-status', () => Boolean(document.querySelector('.pos-order-status-page input')) && !document.querySelector('.pos-order-status-page .animate-pulse')))
    catalog.push(await timedClick(page, () => page.click('button[aria-label="العودة إلى نقطة البيع"]'), '/pos', () => Boolean(document.querySelector('a[href="/pos/order-status"]'))))
    requests.push(requestCount - startedRequests)
  }
  await context.close()
  return { posToOrders: summarize(orders), warmCatalogVisible: summarize(catalog), requestCount: summarize(requests), failedSamples: 0, serverTiming }
}

async function measureCustomerCell(origin, viewport, networkProfile, sampleCount) {
  const api = [], visible = [], debounce = [], requestCount = [], serverTiming = []
  const context = await browser.createBrowserContext(), page = await context.newPage(); await preparePage(page, viewport, networkProfile); await authenticate(page, origin)
  let networkStarted = 0, networkEnded = 0, requests = 0, timing = null
  const isCustomerLookup = (url) => new URL(url).pathname === '/rest/v1/rpc/lookup_customer_phone_identity_v1'
  page.on('request', (request) => { if (isCustomerLookup(request.url()) && request.method() === 'POST') { requests += 1; networkStarted = performance.now() } })
  page.on('response', (response) => { if (isCustomerLookup(response.url()) && response.request().method() === 'POST') { networkEnded = performance.now(); timing = response.headers()['server-timing'] || null } })
  const customerSearchTerm = await page.evaluate(async () => {
    const response = await fetch('/api/customers?page=1&pageSize=1', { credentials: 'include' })
    const result = await response.json()
    const phone = result?.success && Array.isArray(result.customers) ? result.customers[0]?.phone : null
    if (!response.ok || typeof phone !== 'string' || !phone.trim()) throw new Error('No branch-scoped customer fixture is available.')
    return phone.trim()
  })
  for (let index = 0; index < sampleCount; index += 1) {
    await page.goto(`${origin}/pos/sale/customer`, { waitUntil: 'domcontentloaded', timeout: 30_000 }); await waitForPath(page, '/pos/sale/customer')
    const input = await page.waitForSelector('input[placeholder="05xxxxxxxx"], input[placeholder="رقم الجوال"]', { timeout: 20_000 })
    await page.waitForFunction(() => !document.querySelector('[data-pos-mobile-customer-results]')?.innerText.includes('جارٍ تحميل العملاء'), { timeout: 20_000 })
    networkStarted = 0; networkEnded = 0; requests = 0; timing = null
    await input.click({ clickCount: 3 }); const inputStarted = performance.now()
    await input.evaluate((node, value) => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set
      setter.call(node, value)
      node.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: value }))
    }, customerSearchTerm)
    await page.waitForFunction(() => {
      const results = document.querySelector('[data-pos-mobile-customer-results]')
      if (!results) return false
      return matchMedia('(max-width: 767px)').matches
        ? results.querySelectorAll('div.flex.snap-x > button').length > 0
        : results.querySelectorAll('tbody > tr').length > 0
    }, { timeout: 20_000 })
    const rendered = performance.now(); if (requests !== 1 || !networkStarted || !networkEnded) throw new Error(`Customer request invariant failed: ${requests}`)
    api.push(Math.round(networkEnded - networkStarted)); visible.push(Math.round(rendered - inputStarted)); debounce.push(Math.round(networkStarted - inputStarted)); requestCount.push(requests); serverTiming.push(timing)
  }
  await context.close()
  return { api: summarize(api), visibleResult: summarize(visible), debounce: summarize(debounce), requestCount: summarize(requestCount), failedSamples: 0, serverTiming }
}

async function prepareCatalogPage(page, origin) {
  await page.goto(`${origin}/pos/sale/customer`, { waitUntil: 'domcontentloaded', timeout: 30_000 })
  await waitForPath(page, '/pos/sale/customer')
  const fixture = await page.evaluate(async () => {
    const response = await fetch('/api/customers?page=1&pageSize=1', { credentials: 'include' })
    const result = await response.json()
    const phone = result?.success && Array.isArray(result.customers) ? result.customers[0]?.phone : null
    if (!response.ok || typeof phone !== 'string' || !phone.trim()) throw new Error('No branch-scoped customer fixture is available.')
    return phone.trim()
  })
  const input = await page.waitForSelector('input[placeholder="05xxxxxxxx"], input[placeholder="رقم الجوال"]', { timeout: 20_000 })
  await input.evaluate((node, value) => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set
    setter.call(node, value)
    node.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: value }))
  }, fixture)
  await page.waitForFunction(() => {
    const results = document.querySelector('[data-pos-mobile-customer-results]')
    return Boolean(results?.querySelector('div.flex.snap-x > button, tbody > tr'))
  }, { timeout: 20_000 })
  await page.evaluate(() => {
    const results = document.querySelector('[data-pos-mobile-customer-results]')
    const target = results?.querySelector('div.flex.snap-x > button, tbody > tr')
    if (!(target instanceof HTMLElement)) throw new Error('Selectable customer result is unavailable.')
    target.click()
  })
  await page.waitForFunction(() => Array.from(document.querySelectorAll('button')).some((button) => !button.disabled && button.textContent?.includes('الانتقال إلى العناصر')), { timeout: 20_000 })
  await page.evaluate(() => {
    const target = Array.from(document.querySelectorAll('button')).find((button) => !button.disabled && button.textContent?.includes('الانتقال إلى العناصر'))
    target?.click()
  })
  await waitForPath(page, '/pos/sale/items')
}

async function measureCatalogInteractionCell(origin, viewport, networkProfile, sampleCount) {
  const values = [], requestCount = []
  const context = await browser.createBrowserContext(), page = await context.newPage()
  await preparePage(page, viewport, networkProfile); await authenticate(page, origin)
  let requests = 0
  page.on('request', (request) => { if (['fetch', 'xhr'].includes(request.resourceType())) requests += 1 })
  for (let index = 0; index < sampleCount; index += 1) {
    await prepareCatalogPage(page, origin)
    await page.waitForSelector('input[placeholder="ابحث عن منتج أو خدمة"]', { timeout: 20_000 })
    const catalogState = await page.evaluate(async (branchId) => {
      const response = await fetch(`/api/invoice/catalog?branchId=${encodeURIComponent(branchId)}&page=1&pageSize=20&t=${Date.now()}`, { cache: 'no-store' })
      const body = await response.json().catch(() => null)
      const product = Array.isArray(body?.products) ? body.products[0] : null
      return { status: response.status, success: body?.success === true, productCount: Array.isArray(body?.products) ? body.products.length : -1, total: Number(body?.total ?? -1), trackInventory: product?.track_inventory === true, quantityOnHand: Number(product?.quantity_on_hand ?? -1) }
    }, credentials.branchId)
    if (!catalogState.success || catalogState.productCount < 1) throw new Error(`Branch catalog fixture is unavailable: ${JSON.stringify(catalogState)}`)
    await page.waitForFunction((itemName) => Array.from(document.querySelectorAll('button, [role="button"]')).some((node) => !(node instanceof HTMLButtonElement && node.disabled) && ((node.getAttribute('aria-label') || node.textContent || '').includes(itemName))), { timeout: 20_000 }, credentials.catalogItemName)
    const startedRequests = requests
    const started = await page.evaluate(() => performance.now())
    const initialCartCount = await page.$eval('button[aria-controls="pos-cart-panel"] span', (node) => Number(node.textContent || 0))
    await page.evaluate((itemName) => {
      const target = Array.from(document.querySelectorAll('button, [role="button"]')).find((node) => !(node instanceof HTMLButtonElement && node.disabled) && ((node.getAttribute('aria-label') || node.textContent || '').includes(itemName)))
      if (!(target instanceof HTMLElement)) throw new Error('Addable catalog item is unavailable.')
      target.click()
    }, credentials.catalogItemName)
    await page.waitForFunction((initial) => Number(document.querySelector('button[aria-controls="pos-cart-panel"] span')?.textContent || 0) > initial, { timeout: 20_000 }, initialCartCount)
    values.push(await page.evaluate((start) => Math.round(performance.now() - start), started))
    requestCount.push(requests - startedRequests)
  }
  await context.close()
  return { interactionVisible: summarize(values), requestCount: summarize(requestCount), failedSamples: 0 }
}

try {
  const evidence = []
  for (const target of targets) {
    const origin = target.replace(/\/$/, ''), matrix = {}
    for (const [viewportName, viewport] of Object.entries({ desktop: { width: 1440, height: 1000, isMobile: false }, mobile: { width: 390, height: 844, isMobile: true, hasTouch: true } }).filter(([name]) => viewports.includes(name))) {
      matrix[viewportName] = {}
      for (const networkProfile of networks) {
        const sampleCount = networkProfile === 'fast' ? fastSamples : fourGSamples
        const cell = {}
        if (['all', 'orders', 'warm-catalog'].includes(scenario)) cell.navigation = await measureCell(origin, viewport, networkProfile, sampleCount)
        if (['all', 'customer-search'].includes(scenario)) cell.customer = await measureCustomerCell(origin, viewport, networkProfile, sampleCount)
        if (['all', 'catalog-interaction'].includes(scenario)) cell.catalogInteraction = await measureCatalogInteractionCell(origin, viewport, networkProfile, sampleCount)
        if (scenario === 'checkout-replay') throw new Error('Checkout/replay uses the separately bounded Core executor.')
        matrix[viewportName][networkProfile] = cell
      }
    }
    evidence.push({ origin, matrix })
  }
  await fs.writeFile(outputPath, `${JSON.stringify({ version: 'hyper-pos-p1-r8-v1', scenario, diagnosticMode, samplesPerCell: { fast: fastSamples, '4g': fourGSamples }, evidence }, null, 2)}\n`, { mode: 0o600 })
} finally { await browser.close() }
