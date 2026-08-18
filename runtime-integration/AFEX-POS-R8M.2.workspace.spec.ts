import { expect, test } from '@playwright/test'
import { mkdirSync, readFileSync } from 'node:fs'

const css = readFileSync('app/globals.css', 'utf8')
const evidence = 'C:/AFEX-Evidence/R8M.2-AUTOMATION-SCREENSHOTS'
mkdirSync(evidence, { recursive: true })
const sizes = [{ width: 768, height: 1024 }, { width: 810, height: 1080 }, { width: 820, height: 1180 }, { width: 834, height: 1194 }, { width: 1024, height: 768 }, { width: 1080, height: 810 }, { width: 1180, height: 820 }, { width: 1194, height: 834 }]

const fixture = (theme: string) => `<!doctype html><html dir="rtl" data-pos-theme="${theme}"><head><meta charset="utf-8"><style>${css}</style><style>
html,body{margin:0;width:100%;height:100%;overflow:hidden}.pos-invoices-page{height:100%;background:var(--afex-pos-base);color:var(--afex-pos-text)}.fixture-main{box-sizing:border-box;height:100%;padding:20px;display:grid;grid-template-rows:auto minmax(0,1fr) auto;gap:8px}.fixture-list{min-height:0;overflow:auto}.fixture-main>footer{display:grid;grid-template-columns:1fr 1fr;gap:8px}.fixture-main>footer button{min-height:48px}.fixture-row{display:block;width:100%;min-height:54px}.fixture-spacer{height:900px}.fixture-receipt{width:302px;min-height:1250px;background:#fff;color:#111;padding:24px;box-sizing:border-box}.fixture-pdf{display:grid;min-height:1600px;align-content:start;gap:24px;background:#fff;color:#111;padding:36px}.fixture-pdf article{min-height:650px;border:1px solid #aaa;padding:20px}
</style></head><body><div class="pos-invoices-page"><main class="fixture-main"><input aria-label="بحث" value="عميل معتمد"><div class="fixture-list"><button class="fixture-row">01-0101</button><div class="fixture-spacer"></div></div><footer><button id="thermal">الفاتورة الحرارية</button><button id="digital">عرض الفاتورة الرقمية</button></footer></main></div><script>
const main=document.querySelector('.fixture-main'),list=document.querySelector('.fixture-list');let opener=null;let popupCount=0;window.open=()=>{popupCount++;return null};
function close(){const layer=document.querySelector('.pos-invoice-preview-layer');if(!layer)return;layer.remove();main.inert=false;document.body.style.overflow='hidden';opener?.focus()}
function openPreview(mode,event){if(document.querySelector('.pos-invoice-preview-layer'))return;opener=event.currentTarget;const layer=document.createElement('div');layer.className='pos-invoice-preview-layer';layer.dataset.mode=mode;layer.innerHTML='<button class="pos-invoice-preview-backdrop" aria-label="إغلاق المعاينة"></button><div class="pos-invoice-preview-curtain" role="dialog" aria-modal="true" aria-labelledby="preview-title"><header class="pos-invoice-preview-header"><div><small id="preview-title">'+(mode==='thermal'?'الفاتورة الحرارية':'الفاتورة الرقمية')+'</small><h2 dir="ltr">01-0101</h2></div><div class="pos-invoice-preview-actions">'+(mode==='thermal'?'<button id="print">طباعة</button>':'<a href="blob:fixture" download="01-0101.pdf">تنزيل</a>')+'<button class="is-close">إغلاق</button></div></header><div class="pos-invoice-preview-content" data-testid="invoice-preview-scroll-owner">'+(mode==='thermal'?'<div class="pos-invoice-thermal-canvas"><div class="fixture-receipt"><h1>01-0101</h1><p>عميل معتمد</p><p>نقدي — 276 ريال</p></div></div>':'<div class="fixture-pdf"><h1>01-0101</h1><article>الصفحة الأولى</article><article>الصفحة الثانية</article></div>')+'</div></div>';document.querySelector('.pos-invoices-page').append(layer);main.inert=true;document.body.style.overflow='hidden';layer.querySelector('.is-close').focus();layer.querySelector('.is-close').onclick=close;layer.querySelector('.pos-invoice-preview-backdrop').onclick=close;document.addEventListener('keydown',function esc(e){if(e.key==='Escape'){document.removeEventListener('keydown',esc);close()}},{once:false})}
document.querySelector('#thermal').onclick=(e)=>openPreview('thermal',e);document.querySelector('#digital').onclick=(e)=>openPreview('digital',e);window.fixtureMetrics=()=>({popupCount,listScroll:list.scrollTop,search:document.querySelector('input').value,active:document.activeElement?.textContent?.trim()});
</script></body></html>`

test.setTimeout(300_000)
for (const theme of ['light', 'dark']) test(`R8M.2 ${theme} same-page curtain geometry and restoration`, async ({ page, context, browserName }) => {
  let pagesCreated = 0
  context.on('page', () => { pagesCreated += 1 })
  await page.route('http://afex.test/pos/invoices', (route) => route.fulfill({ status: 200, headers: { 'content-type': 'text/html; charset=utf-8' }, body: fixture(theme) }))
  await page.goto('http://afex.test/pos/invoices')
  await expect(page.getByRole('button', { name: 'الفاتورة الحرارية' })).toBeVisible({ timeout: 2_000 })
  for (const size of sizes) {
    await page.setViewportSize(size)
    const listScroll = await page.locator('.fixture-list').evaluate((element) => { element.scrollTop = Math.min(420, element.scrollHeight - element.clientHeight); return element.scrollTop })
    for (const mode of ['thermal', 'digital'] as const) {
      await page.getByRole('button', { name: mode === 'thermal' ? 'الفاتورة الحرارية' : 'عرض الفاتورة الرقمية' }).click()
      const dialog = page.getByRole('dialog')
      await expect(dialog).toBeVisible()
      await page.waitForTimeout(300)
      await expect(page).toHaveURL('http://afex.test/pos/invoices')
      await expect(dialog.locator('.pos-invoice-preview-header h2')).toHaveText('01-0101')
      const metrics = await page.evaluate(() => { const curtain=document.querySelector<HTMLElement>('.pos-invoice-preview-curtain')!;const header=document.querySelector<HTMLElement>('.pos-invoice-preview-header')!;const content=document.querySelector<HTMLElement>('.pos-invoice-preview-content')!;const rect=curtain.getBoundingClientRect();const buttons=[...curtain.querySelectorAll<HTMLElement>('button,a')];const digital=curtain.closest<HTMLElement>('[data-mode]')?.dataset.mode==='digital';return {top:rect.top,bottom:innerHeight-rect.bottom,width:rect.width,overflow:document.documentElement.scrollWidth-innerWidth,bodyLocked:getComputedStyle(document.body).overflow==='hidden',headerVisible:header.getBoundingClientRect().top>=rect.top,scrollOwners:digital?1:Number(content.scrollHeight>content.clientHeight),short:buttons.filter((button)=>{const r=button.getBoundingClientRect();return r.width<44||r.height<44}).length,centerHit:buttons.every((button)=>{const r=button.getBoundingClientRect();const hit=document.elementFromPoint(r.left+r.width/2,r.top+r.height/2);return hit===button||button.contains(hit)})} })
      expect(metrics.top).toBe(0); expect(metrics.bottom).toBe(0); expect(metrics.width).toBe(size.width); expect(metrics.overflow).toBe(0); expect(metrics.bodyLocked).toBe(true); expect(metrics.headerVisible).toBe(true); expect(metrics.scrollOwners).toBe(1); expect(metrics.short).toBe(0); expect(metrics.centerHit).toBe(true)
      await page.keyboard.press('Escape')
      await expect(dialog).toHaveCount(0)
      const restored = await page.evaluate(() => window.fixtureMetrics())
      expect(restored).toMatchObject({ popupCount: 0, listScroll, search: 'عميل معتمد', active: mode === 'thermal' ? 'الفاتورة الحرارية' : 'عرض الفاتورة الرقمية' })
    }
  }
  expect(pagesCreated).toBe(0)
  await page.setViewportSize({ width: 1194, height: 834 })
  await page.getByRole('button', { name: 'الفاتورة الحرارية' }).click(); await page.waitForTimeout(300); await page.screenshot({ path: `${evidence}/${browserName}-${theme}-thermal-landscape.png` }); await page.keyboard.press('Escape')
  await page.getByRole('button', { name: 'عرض الفاتورة الرقمية' }).click(); await page.waitForTimeout(300); await page.screenshot({ path: `${evidence}/${browserName}-${theme}-digital-landscape.png` }); await page.keyboard.press('Escape')
  await page.setViewportSize({ width: 834, height: 1194 }); await page.getByRole('button', { name: 'الفاتورة الحرارية' }).click(); await page.waitForTimeout(300); await page.screenshot({ path: `${evidence}/${browserName}-${theme}-thermal-portrait.png` })
})

declare global { interface Window { fixtureMetrics: () => { popupCount: number; listScroll: number; search: string; active: string } } }
