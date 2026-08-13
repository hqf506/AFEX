import fs from 'node:fs/promises'
import process from 'node:process'
import puppeteer from 'puppeteer-core'

const credentialPath = process.env.AFEX_PERFORMANCE_CREDENTIAL_FILE
const outputPath = process.env.AFEX_PERFORMANCE_OUTPUT
const chromePath = process.env.AFEX_CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
const samples = Number(process.env.AFEX_PERFORMANCE_SAMPLES || 5)
const targets = (process.env.AFEX_PERFORMANCE_TARGETS || '').split(',').filter(Boolean)

if (!credentialPath || !outputPath || targets.length === 0) {
  throw new Error('Missing bounded performance harness configuration.')
}

const credentials = JSON.parse(await fs.readFile(credentialPath, 'utf8'))
const browser = await puppeteer.launch({
  executablePath: chromePath,
  headless: true,
  args: ['--no-first-run', '--disable-background-networking'],
})

const percentile = (values, ratio) => {
  const ordered = [...values].sort((a, b) => a - b)
  return ordered[Math.min(ordered.length - 1, Math.ceil(ordered.length * ratio) - 1)]
}
const summarize = (values) => ({
  samples: values.length,
  min: Math.min(...values),
  p50: percentile(values, 0.5),
  p75: percentile(values, 0.75),
  p95: percentile(values, 0.95),
  max: Math.max(...values),
})
const waitForPath = async (page, suffix) => {
  try {
    await page.waitForFunction(
      (expected) => location.pathname === expected,
      { timeout: 20_000 },
      suffix
    )
  } catch {
    const state = await page.evaluate(() => ({
      pathname: location.pathname,
      text: document.body.innerText.slice(0, 500),
    }))
    throw new Error(`Expected ${suffix}; observed ${JSON.stringify(state)}`)
  }
}
const clickButton = async (page, label) => {
  for (const button of await page.$$('button')) {
    const text = await button.evaluate((candidate) => candidate.textContent?.trim())
    if (text === label) {
      await button.click()
      return
    }
  }
  throw new Error('Expected button unavailable.')
}
const clickLink = async (page, href) => {
  const link = await page.$(`a[href="${href}"]`)
  if (!link) throw new Error(`Expected link unavailable: ${href}`)
  await link.click()
}

async function applyNetwork(page, profile) {
  if (profile !== '4g') return
  const session = await page.createCDPSession()
  await session.send('Network.enable')
  await session.send('Network.emulateNetworkConditions', {
    offline: false,
    latency: 90,
    downloadThroughput: 1_600_000 / 8,
    uploadThroughput: 750_000 / 8,
    connectionType: 'cellular4g',
  })
}

async function authenticate(page, origin) {
  const started = performance.now()
  await page.goto(`${origin}/login`, { waitUntil: 'networkidle2', timeout: 30_000 })
  await page.waitForFunction(() => {
    const button = document.querySelector('button[type="submit"]')
    return button && !button.disabled
  }, { timeout: 20_000 })
  await page.waitForSelector('form input:not([type="password"])', { timeout: 20_000 })
  await page.waitForSelector('form input[type="password"]', { timeout: 20_000 })
  await page.type('form input:not([type="password"])', credentials.username)
  await page.type('form input[type="password"]', credentials.password)
  await page.click('button[type="submit"]')
  await waitForPath(page, '/pos/employee-pin')
  await page.waitForFunction(() => document.querySelectorAll('button').length >= 10, { timeout: 20_000 })
  for (const digit of credentials.pin) {
    await clickButton(page, digit)
  }
  await waitForPath(page, '/pos')
  await page.waitForFunction(() => document.body.innerText.includes('مرحب'), { timeout: 20_000 })
  return Math.round(performance.now() - started)
}

async function measureTarget(origin) {
  const result = { origin, desktop: {}, mobile: {}, requests: {} }
  for (const [viewportName, viewport] of Object.entries({
    desktop: { width: 1440, height: 1000, isMobile: false },
    mobile: { width: 390, height: 844, isMobile: true, hasTouch: true },
  })) {
    for (const networkProfile of ['fast', '4g']) {
      const cold = []
      const warm = []
      const posToOrders = []
      const ordersToPos = []
      const catalog = []
      const catalogServerTiming = []
      const customer = []
      const customerServerTiming = []
      const requestCounts = []
      for (let index = 0; index < samples; index += 1) {
        const context = await browser.createBrowserContext()
        const page = await context.newPage()
        await page.setViewport(viewport)
        await applyNetwork(page, networkProfile)
        let requestCount = 0
        page.on('request', (request) => {
          if (request.resourceType() === 'fetch' || request.resourceType() === 'xhr') requestCount += 1
        })
        cold.push(await authenticate(page, origin))

        let started = performance.now()
        await page.goto(`${origin}/pos`, { waitUntil: 'domcontentloaded', timeout: 30_000 })
        await page.waitForFunction(() => document.body.innerText.includes('مرحب'), { timeout: 20_000 })
        warm.push(Math.round(performance.now() - started))

        started = performance.now()
        await clickLink(page, '/pos/order-status')
        await waitForPath(page, '/pos/order-status')
        await page.waitForFunction(() => document.querySelector('input[type="search"], input[placeholder*="بحث"]'), { timeout: 20_000 })
        posToOrders.push(Math.round(performance.now() - started))

        started = performance.now()
        await clickLink(page, '/pos')
        await waitForPath(page, '/pos')
        await page.waitForFunction(() => document.body.innerText.includes('مرحب'), { timeout: 20_000 })
        ordersToPos.push(Math.round(performance.now() - started))

        const catalogSample = await page.evaluate(async (branchId) => {
          const startedAt = performance.now()
          const response = await fetch(`/api/invoice/catalog?branchId=${encodeURIComponent(branchId)}&page=1&pageSize=24`, { cache: 'no-store' })
          await response.json()
          return {
            duration: Math.round(performance.now() - startedAt),
            serverTiming: response.headers.get('server-timing'),
          }
        }, credentials.branchId)
        catalog.push(catalogSample.duration)
        catalogServerTiming.push(catalogSample.serverTiming)

        const customerPhone = credentials.uniqueCustomerPhone || credentials.customerPhone
        if (customerPhone) {
          const customerSample = await page.evaluate(async (phone, branchId) => {
            const startedAt = performance.now()
            const response = await fetch(`/api/customers?q=${encodeURIComponent(phone)}&branchId=${encodeURIComponent(branchId)}&limit=10`, { cache: 'no-store' })
            await response.json()
            return {
              duration: Math.round(performance.now() - startedAt),
              serverTiming: response.headers.get('server-timing'),
            }
          }, customerPhone, credentials.branchId)
          customer.push(customerSample.duration)
          customerServerTiming.push(customerSample.serverTiming)
        }
        requestCounts.push(requestCount)
        await context.close()
      }
      result[viewportName][networkProfile] = {
        loginToPosUsable: summarize(cold),
        posWarmUsable: summarize(warm),
        posToOrders: summarize(posToOrders),
        ordersToPos: summarize(ordersToPos),
        catalogApi: summarize(catalog),
        catalogServerTiming,
        uniqueCustomerSearch: customer.length ? summarize(customer) : null,
        customerServerTiming,
        xhrFetchRequestCount: summarize(requestCounts),
      }
    }
  }
  return result
}

try {
  const evidence = []
  for (const target of targets) {
    evidence.push(await measureTarget(target.replace(/\/$/, '')))
    await fs.writeFile(outputPath, `${JSON.stringify({ version: 'hyper-pos-p1-r1-v1', evidence }, null, 2)}\n`, { mode: 0o600 })
  }
} finally {
  await browser.close()
}
