import fs from 'node:fs/promises'
import process from 'node:process'
import puppeteer from 'puppeteer-core'

const credentialPath = process.env.AFEX_PERFORMANCE_CREDENTIAL_FILE
const outputPath = process.env.AFEX_PERFORMANCE_OUTPUT
const chromePath = process.env.AFEX_CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
const samples = Number(process.env.AFEX_PERFORMANCE_SAMPLES || 10)
const targets = (process.env.AFEX_PERFORMANCE_TARGETS || '').split(',').filter(Boolean)
const protectionBypass = process.env.AFEX_VERCEL_PROTECTION_BYPASS

if (!credentialPath || !outputPath || targets.length === 0 || !protectionBypass || samples < 10) {
  throw new Error('Missing bounded R3 performance harness configuration.')
}

const credentials = JSON.parse(await fs.readFile(credentialPath, 'utf8'))
const browser = await puppeteer.launch({ executablePath: chromePath, headless: true, args: ['--no-first-run', '--disable-background-networking'] })
let authenticatedState = null
const percentile = (values, ratio) => [...values].sort((a, b) => a - b)[Math.min(values.length - 1, Math.ceil(values.length * ratio) - 1)]
const summarize = (values) => ({ values, samples: values.length, min: Math.min(...values), p50: percentile(values, .5), p75: percentile(values, .75), p95: percentile(values, .95), max: Math.max(...values) })
const waitForPath = (page, path) => page.waitForFunction((expected) => location.pathname === expected, { timeout: 20_000 }, path)
const clickButton = async (page, label) => {
  for (const button of await page.$$('button')) if ((await button.evaluate((node) => node.textContent?.trim())) === label) return button.click()
  throw new Error(`Button unavailable: ${label}`)
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
  if (authenticatedState) {
    await page.setCookie(...authenticatedState.cookies)
    await page.evaluateOnNewDocument((state) => {
      for (const [key, value] of state.local) localStorage.setItem(key, value)
      for (const [key, value] of state.session) sessionStorage.setItem(key, value)
    }, authenticatedState.storage)
    await page.goto(`${origin}/pos`, { waitUntil: 'domcontentloaded', timeout: 30_000 })
    await page.waitForFunction(() => Boolean(document.querySelector('a[href="/pos/order-status"]')), { timeout: 30_000 })
    return
  }
  await page.goto(`${origin}/login`, { waitUntil: 'domcontentloaded', timeout: 30_000 })
  await page.waitForSelector('form input:not([type="password"])', { timeout: 20_000 })
  await page.type('form input:not([type="password"])', `${credentials.username}@example.invalid`)
  await page.type('form input[type="password"]', credentials.password)
  await page.click('button[type="submit"]'); await waitForPath(page, '/pos/employee-pin')
  await page.waitForFunction(() => document.querySelectorAll('button').length >= 10, { timeout: 20_000 })
  for (const digit of credentials.pin) await clickButton(page, digit)
  await waitForPath(page, '/pos')
  await page.waitForFunction(() => Boolean(document.querySelector('a[href="/pos/order-status"]')), { timeout: 30_000 })
  authenticatedState = {
    cookies: await page.cookies(),
    storage: await page.evaluate(() => ({ local: Object.entries(localStorage), session: Object.entries(sessionStorage) })),
  }
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

async function measureCell(origin, viewport, networkProfile) {
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
  await page.waitForNetworkIdle({ idleTime: 100, timeout: 20_000 })
  await timedClick(page, () => page.click('button[aria-label]'), '/pos', () => Boolean(document.querySelector('a[href="/pos/order-status"]')))
  for (let index = 0; index < samples; index += 1) {
    const startedRequests = requestCount
    orders.push(await timedClick(page, () => clickLink(page, '/pos/order-status'), '/pos/order-status', () => Boolean(document.querySelector('.pos-order-status-page input')) && !document.querySelector('.pos-order-status-page .animate-pulse')))
    catalog.push(await timedClick(page, () => page.click('button[aria-label]'), '/pos', () => Boolean(document.querySelector('a[href="/pos/order-status"]'))))
    requests.push(requestCount - startedRequests)
  }
  await context.close()
  return { posToOrders: summarize(orders), warmCatalogVisible: summarize(catalog), requestCount: summarize(requests), failedSamples: 0, serverTiming }
}

async function measureCustomerCell(origin, viewport, networkProfile) {
  const api = [], visible = [], debounce = [], requestCount = [], serverTiming = []
  const context = await browser.createBrowserContext(), page = await context.newPage(); await preparePage(page, viewport, networkProfile); await authenticate(page, origin)
  let networkStarted = 0, networkEnded = 0, requests = 0, timing = null
  const isCustomerLookup = (url) => new URL(url).pathname === '/rest/v1/rpc/lookup_customer_phone_identity_v1'
  page.on('request', (request) => { if (isCustomerLookup(request.url()) && request.method() === 'POST') { requests += 1; networkStarted = performance.now() } })
  page.on('response', (response) => { if (isCustomerLookup(response.url()) && response.request().method() === 'POST') { networkEnded = performance.now(); timing = response.headers()['server-timing'] || null } })
  for (let index = 0; index < samples; index += 1) {
    await page.goto(`${origin}/pos/sale/customer`, { waitUntil: 'domcontentloaded', timeout: 30_000 }); await waitForPath(page, '/pos/sale/customer')
    const input = await page.waitForSelector('input[placeholder="05xxxxxxxx"], input[placeholder="رقم الجوال"]', { timeout: 20_000 })
    await page.waitForFunction(() => !document.querySelector('[data-pos-mobile-customer-results]')?.innerText.includes('جارٍ تحميل العملاء'), { timeout: 20_000 })
    networkStarted = 0; networkEnded = 0; requests = 0; timing = null
    await input.click({ clickCount: 3 }); const inputStarted = performance.now()
    await input.evaluate((node, value) => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set
      setter.call(node, value)
      node.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: value }))
    }, credentials.customerPhone)
    await page.waitForFunction((tag) => document.querySelector('[data-pos-mobile-customer-results]')?.innerText.includes(tag), { timeout: 20_000 }, credentials.tag)
    const rendered = performance.now(); if (requests !== 1 || !networkStarted || !networkEnded) throw new Error(`Customer request invariant failed: ${requests}`)
    api.push(Math.round(networkEnded - networkStarted)); visible.push(Math.round(rendered - inputStarted)); debounce.push(Math.round(networkStarted - inputStarted)); requestCount.push(requests); serverTiming.push(timing)
  }
  await context.close()
  return { api: summarize(api), visibleResult: summarize(visible), debounce: summarize(debounce), requestCount: summarize(requestCount), failedSamples: 0, serverTiming }
}

try {
  const evidence = []
  for (const target of targets) {
    const origin = target.replace(/\/$/, ''), matrix = {}
    for (const [viewportName, viewport] of Object.entries({ desktop: { width: 1440, height: 1000, isMobile: false }, mobile: { width: 390, height: 844, isMobile: true, hasTouch: true } })) {
      matrix[viewportName] = {}
      for (const networkProfile of ['fast', '4g']) matrix[viewportName][networkProfile] = { navigation: await measureCell(origin, viewport, networkProfile), customer: await measureCustomerCell(origin, viewport, networkProfile) }
    }
    evidence.push({ origin, matrix })
  }
  await fs.writeFile(outputPath, `${JSON.stringify({ version: 'hyper-pos-p1-r3-v1', samplesPerCell: samples, evidence }, null, 2)}\n`, { mode: 0o600 })
} finally { await browser.close() }
