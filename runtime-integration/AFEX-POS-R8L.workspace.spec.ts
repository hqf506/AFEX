import { expect, test } from '@playwright/test'
import { mkdirSync, readFileSync } from 'node:fs'

const css = readFileSync('app/globals.css', 'utf8')
const evidence = 'C:/AFEX-Evidence/R8L-AUTOMATION-SCREENSHOTS'
mkdirSync(evidence, { recursive: true })

const sizes = [
  { width: 768, height: 1024 }, { width: 810, height: 1080 },
  { width: 820, height: 1180 }, { width: 834, height: 1194 },
  { width: 1024, height: 768 }, { width: 1080, height: 810 },
  { width: 1180, height: 820 }, { width: 1194, height: 834 },
]

const loader = `<main class="afex-pos-preparing" dir="rtl" aria-live="polite" aria-busy="true"><span class="afex-pos-preparing-mark" aria-hidden="true">A</span><section class="afex-pos-preparing-content" aria-label="نجهز نقطة البيع"><p class="afex-pos-preparing-wordmark" aria-hidden="true">AFEX</p><h1>نجهز نقطة البيع</h1><p class="afex-pos-preparing-subtitle">يرجى الانتظار قليلًا</p><div class="afex-pos-preparing-indicator" aria-hidden="true"><span></span><span></span><span></span></div><span class="afex-pos-preparing-accent" aria-hidden="true"></span></section></main>`
const operational = `<main data-operational style="height:100dvh;display:grid;place-items:center;background:var(--afex-pos-base);color:var(--afex-pos-text)"><h1>نقطة البيع جاهزة</h1></main>`
const error = `<main data-error style="height:100dvh;display:grid;place-items:center;background:var(--afex-pos-base);color:var(--afex-pos-text)"><section><h1>تعذر تجهيز نقطة البيع</h1><button style="min-height:44px">إعادة المحاولة</button></section></main>`

test.setTimeout(120_000)

for (const theme of ['light', 'dark']) {
  test(`R8L ${theme} geometry and state replacement`, async ({ page, browserName }) => {
    await page.setContent(`<html data-pos-theme="${theme}" dir="rtl"><body>${loader}</body></html>`)
    await page.evaluate((stylesheet) => {
      const style = document.createElement('style')
      style.textContent = stylesheet
      document.head.append(style)
    }, css)

    for (const size of sizes) {
      await page.setViewportSize(size)
      const metrics = await page.evaluate(() => {
        const root = document.querySelector<HTMLElement>('.afex-pos-preparing')!
        const content = document.querySelector<HTMLElement>('.afex-pos-preparing-content')!
        const dots = [...document.querySelectorAll<HTMLElement>('.afex-pos-preparing-indicator span')]
        const rootBox = root.getBoundingClientRect()
        const contentBox = content.getBoundingClientRect()
        return {
          width: rootBox.width,
          height: rootBox.height,
          viewportWidth: window.innerWidth,
          viewportHeight: window.innerHeight,
          horizontalOverflow: document.documentElement.scrollWidth - window.innerWidth,
          verticalOverflow: document.documentElement.scrollHeight - window.innerHeight,
          clipped: Number(rootBox.left < 0 || rootBox.right > window.innerWidth || rootBox.top < 0 || rootBox.bottom > window.innerHeight),
          contentInside: contentBox.left >= 0 && contentBox.right <= window.innerWidth && contentBox.top >= 0 && contentBox.bottom <= window.innerHeight,
          dots: dots.length,
          dotSizes: dots.map((dot) => `${dot.getBoundingClientRect().width}x${dot.getBoundingClientRect().height}`),
          scrollY: window.scrollY,
        }
      })
      expect(metrics).toMatchObject({ width: size.width, height: size.height, viewportWidth: size.width, viewportHeight: size.height, horizontalOverflow: 0, verticalOverflow: 0, clipped: 0, contentInside: true, dots: 3, scrollY: 0 })
      expect(new Set(metrics.dotSizes).size).toBe(1)
    }

    await page.setViewportSize({ width: 1194, height: 834 })
    await page.screenshot({ path: `${evidence}/${browserName}-${theme}-landscape.png` })
    await page.setViewportSize({ width: 834, height: 1194 })
    await page.screenshot({ path: `${evidence}/${browserName}-${theme}-portrait.png` })

    await page.emulateMedia({ reducedMotion: 'reduce' })
    const reduced = await page.locator('.afex-pos-preparing-indicator span').first().evaluate((dot) => getComputedStyle(dot).animationName)
    expect(reduced).toBe('none')
    await page.screenshot({ path: `${evidence}/${browserName}-${theme}-reduced-motion.png` })

    await page.locator('body').evaluate((body, markup) => { body.innerHTML = markup }, operational)
    await expect(page.locator('.afex-pos-preparing')).toHaveCount(0)
    await expect(page.locator('[data-operational]')).toBeVisible()
    await page.screenshot({ path: `${evidence}/${browserName}-${theme}-operational.png` })

    await page.locator('body').evaluate((body, markup) => { body.innerHTML = markup }, error)
    await expect(page.getByRole('heading', { name: 'تعذر تجهيز نقطة البيع' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'إعادة المحاولة' })).toBeVisible()
    await page.screenshot({ path: `${evidence}/${browserName}-${theme}-error.png` })
  })
}
