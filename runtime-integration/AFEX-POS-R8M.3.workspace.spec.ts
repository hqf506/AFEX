import { expect, test } from '@playwright/test'
import { mkdirSync, readFileSync } from 'node:fs'

const css = readFileSync('app/globals.css', 'utf8')
const evidence = 'C:/AFEX-Evidence/R8M.3-AUTOMATION-SCREENSHOTS'
mkdirSync(evidence, { recursive: true })
const sizes = [{ width: 768, height: 1024 }, { width: 810, height: 1080 }, { width: 820, height: 1180 }, { width: 834, height: 1194 }, { width: 1024, height: 768 }, { width: 1080, height: 810 }, { width: 1180, height: 820 }, { width: 1194, height: 834 }]

const fixture = (theme: string) => `<!doctype html><html dir="rtl" data-pos-theme="${theme}"><head><meta charset="utf-8"><style>${css}</style><style>html,body{margin:0;width:100%;height:100%;overflow:hidden}.pos-invoices-page{height:100%;background:var(--afex-pos-base)}.mock-pdf{margin:0;min-height:100%;overflow-y:auto;background:#d8d4cd;padding:18px;box-sizing:border-box}.mock-pdf-page{box-sizing:border-box;width:100%;aspect-ratio:210/297;background:#fff;border:1px solid #ccc;padding:32px;color:#111}.mock-pdf-page+.mock-pdf-page{margin-top:18px}.mock-pdf-page h1{margin:0 0 28px}.mock-pdf-page p{line-height:1.8}</style></head><body><div class="pos-invoices-page"><main></main><div class="pos-invoice-preview-layer" data-mode="digital"><button class="pos-invoice-preview-backdrop" aria-label="إغلاق المعاينة"></button><div class="pos-invoice-preview-curtain" role="dialog" aria-modal="true"><header class="pos-invoice-preview-header"><div><small>الفاتورة الرقمية</small><h2>01-0101</h2></div><div class="pos-invoice-preview-actions"><a href="blob:fixture" download="01-0101.pdf">تنزيل</a><button class="is-close">إغلاق</button></div></header><div class="pos-invoice-preview-content"><div class="pos-invoice-digital-canvas"><div class="pos-invoice-digital-page"><iframe class="pos-invoice-digital-frame" title="الفاتورة الرقمية 01-0101"></iframe></div></div></div></div></div></div><script>const frame=document.querySelector('iframe');frame.srcdoc='<!doctype html><html dir="rtl"><head><meta charset="utf-8"><style>html,body{margin:0;height:100%;overflow:hidden}.mock-pdf{height:100%;overflow-y:auto;background:#d8d4cd;padding:18px;box-sizing:border-box}.mock-pdf-page{box-sizing:border-box;width:100%;aspect-ratio:210/297;background:#fff;border:1px solid #ccc;padding:32px;color:#111}.mock-pdf-page+.mock-pdf-page{margin-top:18px}</style></head><body><div class="mock-pdf"><section class="mock-pdf-page"><h1>01-0101</h1><p>فاتورة رقمية رسمية — الصفحة الأولى</p></section><section class="mock-pdf-page"><h1>01-0101</h1><p>الصفحة الثانية</p></section></div></body></html>';</script></body></html>`

test.setTimeout(180_000)
for (const theme of ['light', 'dark']) test(`R8M.3 ${theme} centered A4 digital viewer`, async ({ page, browserName }) => {
  await page.route('http://afex.test/pos/invoices', (route) => route.fulfill({ status: 200, headers: { 'content-type': 'text/html; charset=utf-8' }, body: fixture(theme) }))
  await page.goto('http://afex.test/pos/invoices')
  for (const size of sizes) {
    await page.setViewportSize(size)
    await page.waitForTimeout(300)
    const metrics = await page.evaluate(() => {
      const curtain=document.querySelector<HTMLElement>('.pos-invoice-preview-curtain')!;const header=document.querySelector<HTMLElement>('.pos-invoice-preview-header')!;const content=document.querySelector<HTMLElement>('.pos-invoice-preview-content')!;const canvas=document.querySelector<HTMLElement>('.pos-invoice-digital-canvas')!;const paper=document.querySelector<HTMLElement>('.pos-invoice-digital-page')!;const frame=document.querySelector<HTMLElement>('.pos-invoice-digital-frame')!;const c=curtain.getBoundingClientRect(),h=header.getBoundingClientRect(),v=content.getBoundingClientRect(),a=canvas.getBoundingClientRect(),p=paper.getBoundingClientRect(),f=frame.getBoundingClientRect();const left=p.left-a.left,right=a.right-p.right;return {curtain:{width:c.width,height:c.height},header:{top:h.top,bottom:h.bottom},content:{top:v.top,bottom:v.bottom,width:v.width},canvas:{left:a.left,right:a.right,width:a.width,height:a.height},paper:{left:p.left,right:p.right,width:p.width,height:p.height},frame:{left:f.left,right:f.right,width:f.width,height:f.height},left,right,centerDelta:Math.abs((p.left+p.right)/2-(a.left+a.right)/2),ratio:p.width/p.height,overflow:document.documentElement.scrollWidth-innerWidth,documentScroll:document.documentElement.scrollHeight-innerHeight,canvasColor:getComputedStyle(content).backgroundColor,paperColor:getComputedStyle(paper).backgroundColor}
    })
    expect(metrics.curtain).toEqual({ width: size.width, height: size.height })
    expect(metrics.header.top).toBe(0); expect(metrics.content.top).toBe(metrics.header.bottom); expect(metrics.content.bottom).toBe(size.height)
    expect(metrics.centerDelta).toBeLessThanOrEqual(0.6); expect(Math.abs(metrics.left-metrics.right)).toBeLessThanOrEqual(1)
    expect(Math.abs(metrics.ratio-(210/297))).toBeLessThan(0.002)
    expect(metrics.paper.width).toBe(metrics.frame.width); expect(metrics.paper.height).toBe(metrics.frame.height)
    expect(metrics.paper.width).toBeLessThan(metrics.canvas.width); expect(metrics.canvasColor).not.toBe('rgb(255, 255, 255)'); expect(metrics.paperColor).not.toBe('rgb(255, 255, 255)')
    expect(metrics.overflow).toBe(0); expect(metrics.documentScroll).toBe(0)
  }
  await page.setViewportSize({ width: 1194, height: 834 }); await page.waitForTimeout(300); await page.screenshot({ path: `${evidence}/${browserName}-${theme}-digital-landscape.png` })
  await page.setViewportSize({ width: 834, height: 1194 }); await page.waitForTimeout(300); await page.screenshot({ path: `${evidence}/${browserName}-${theme}-digital-portrait.png` })
})
