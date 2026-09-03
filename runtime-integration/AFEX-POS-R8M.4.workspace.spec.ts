import { expect, test } from '@playwright/test'
import { mkdirSync, readFileSync } from 'node:fs'

const css = readFileSync('app/globals.css', 'utf8')
const evidence = 'C:/AFEX-Evidence/R8M.4-AUTOMATION-SCREENSHOTS'
mkdirSync(evidence, { recursive: true })
const sizes = [{ width: 768, height: 1024 }, { width: 810, height: 1080 }, { width: 820, height: 1180 }, { width: 834, height: 1194 }, { width: 1024, height: 768 }, { width: 1080, height: 810 }, { width: 1180, height: 820 }, { width: 1194, height: 834 }]
const labels = ['رقم الفاتورة', 'اسم العميل', 'التوقيت', 'طريقة الدفع', 'الإجمالي', 'حالة الفاتورة']
const data = [
  ['1','01-0103','اسم عميل طويل لاختبار الاقتطاع الآمن','03:30 م','مدى','276.00 ر.س','مدفوعة','اليوم'],
  ['2','01-0102','عميل نقدي','02:20 م','كاش','120.00 ر.س','مدفوعة','اليوم'],
  ['3','01-0101','عميل سابق','11:10 ص','مدى','80.00 ر.س','مستردة','أمس'],
  ['4','01-0100','عميل أقدم','09:00 ص','كاش','55.00 ر.س','مدفوعة','18 أغسطس 2026'],
]
const fixture = (theme: string) => `<!doctype html><html dir="rtl" data-pos-theme="${theme}"><head><meta charset="utf-8"><style>${css}</style><style>html,body{margin:0;width:100%;height:100%;overflow:hidden}.pos-invoices-page{height:100%;background:var(--afex-pos-base)}.pos-invoices-page>main{height:100%;display:grid;grid-template-rows:auto auto minmax(0,1fr)}.pos-invoices-workspace{grid-template-columns:minmax(0,1.65fr) minmax(320px,1fr)}.pos-invoice-detail-pane{min-height:0}.fixture-detail{padding:20px}</style></head><body><div class="pos-invoices-page"><main><header class="pos-invoices-header"><div class="pos-history-heading"><div><h1>الفواتير</h1><p>سجل المبيعات والفواتير</p></div></div><div><button class="is-close">إغلاق</button><button id="refresh">تحديث</button></div></header><div class="pos-invoices-toolbar"><label class="pos-invoices-search"><input aria-label="البحث" placeholder="ابحث برقم الفاتورة أو اسم العميل"><button hidden type="button" class="pos-invoices-search-clear" aria-label="مسح البحث">مسح</button></label><div role="group"><button data-active="true">الكل</button><button>مدفوعة</button><button>مستردة</button></div></div><section class="pos-invoices-workspace"><div class="pos-invoice-ledger" role="grid"><div class="pos-invoice-ledger-columns" role="row">${labels.map(label=>`<span role="columnheader">${label}</span>`).join('')}</div><div id="rows"></div></div><aside class="pos-invoice-detail-pane"><div class="fixture-detail">تفاصيل الفاتورة المحددة</div></aside></section></main></div><script>
const all=${JSON.stringify(data)};let generation=0,timer=0,requests=0;const rows=document.querySelector('#rows'),input=document.querySelector('input'),clear=document.querySelector('.pos-invoices-search-clear');
function normalize(v){return v.trim().replace(/[٠-٩]/g,d=>'٠١٢٣٤٥٦٧٨٩'.indexOf(d)).replace(/[۰-۹]/g,d=>'۰۱۲۳۴۵۶۷۸۹'.indexOf(d)).replace(/[‐-―]/g,'-').replace(/\\s*-\\s*/g,'-').toLowerCase()}
function row(v){return '<button type="button" class="pos-invoice-ledger-row" role="row" data-id="'+v[0]+'"><strong role="gridcell" data-label="رقم الفاتورة">'+v[1]+'</strong><span role="gridcell" data-label="اسم العميل" class="is-customer" title="'+v[2]+'">'+v[2]+'</span><time role="gridcell" data-label="التوقيت">'+v[3]+'</time><span role="gridcell" data-label="طريقة الدفع" class="is-payment">'+v[4]+'</span><b role="gridcell" data-label="الإجمالي">'+v[5]+'</b><i role="gridcell" data-label="حالة الفاتورة">'+v[6]+'</i></button>'}
function render(items){const grouped=new Map;for(const item of items){if(!grouped.has(item[7]))grouped.set(item[7],[]);grouped.get(item[7]).push(item)};rows.innerHTML=[...grouped].map(([g,items])=>'<section class="pos-invoice-date-group"><h2>'+g+'</h2><div>'+items.map(row).join('')+'</div></section>').join('')||'<section class="pos-invoice-ledger-empty"><h2>لا توجد فواتير مطابقة</h2></section>';rows.querySelector('button')?.setAttribute('data-selected','true')}
function intent(value){const q=normalize(value);generation++;const mine=generation;clear.hidden=!q;window.clearTimeout(timer);if(!q){input.value='';render(all);return}timer=window.setTimeout(()=>{requests++;const delay=q.includes('0101')?450:60;window.setTimeout(()=>{if(mine!==generation)return;render(all.filter(v=>normalize(v[1]+' '+v[2]).includes(q)))},delay)},250)}
input.addEventListener('input',e=>intent(e.target.value));clear.addEventListener('click',()=>intent(''));render(all);window.fixture={intent,get generation(){return generation},get requests(){return requests},count:()=>rows.querySelectorAll('.pos-invoice-ledger-row').length};
</script></body></html>`

test.setTimeout(180_000)
for (const theme of ['light','dark']) test(`R8M.4 ${theme} fixed columns and search restoration`, async ({ page, browserName }) => {
  await page.setContent(fixture(theme))
  for (const size of sizes) {
    await page.setViewportSize(size)
    await page.waitForTimeout(80)
    const metrics = await page.evaluate(() => {
      const ledger=document.querySelector<HTMLElement>('.pos-invoice-ledger')!,header=document.querySelector<HTMLElement>('.pos-invoice-ledger-columns')!,row=document.querySelector<HTMLElement>('.pos-invoice-ledger-row')!;const before=header.getBoundingClientRect();ledger.scrollTop=ledger.scrollHeight;const after=header.getBoundingClientRect();const visible=getComputedStyle(header).display!=='none';const headerCells=[...header.children].map(x=>x.getBoundingClientRect()),rowCells=[...row.children].map(x=>x.getBoundingClientRect());return {labels:[...header.children].map(x=>x.textContent),rowCells:row.children.length,visible,stickyDelta:Math.abs(before.top-after.top),alignment:visible?Math.max(...headerCells.map((cell,i)=>Math.max(Math.abs(cell.left-rowCells[i].left),Math.abs(cell.right-rowCells[i].right)))):0,headerEdges:headerCells.map(x=>[x.left,x.right]),rowEdges:rowCells.map(x=>[x.left,x.right]),overflow:document.documentElement.scrollWidth-innerWidth,transparent:getComputedStyle(header).backgroundColor==='rgba(0, 0, 0, 0)',groups:[...document.querySelectorAll('.pos-invoice-date-group>h2')].map(x=>x.textContent),short:[...document.querySelectorAll<HTMLElement>('button')].filter(x=>{const r=x.getBoundingClientRect(),s=getComputedStyle(x);return s.display!=='none'&&(r.width<44||r.height<44)}).length}
    })
    expect(metrics.labels).toEqual(labels);expect(metrics.rowCells).toBe(6);expect(metrics.stickyDelta).toBeLessThanOrEqual(.6);expect(metrics.alignment).toBeLessThanOrEqual(1);expect(metrics.overflow).toBe(0);expect(metrics.transparent).toBe(false);expect(metrics.groups).toEqual(['اليوم','أمس','18 أغسطس 2026']);expect(metrics.short).toBe(0)
  }
  await page.setViewportSize({width:1194,height:834});await page.screenshot({path:`${evidence}/${browserName}-${theme}-full-ledger.png`})
  const input=page.getByRole('textbox',{name:'البحث',exact:true});await input.fill('01-0101');await page.waitForTimeout(800);await expect(page.locator('.pos-invoice-ledger-row')).toHaveCount(1);await page.screenshot({path:`${evidence}/${browserName}-${theme}-one-result.png`})
  await input.fill('');await expect(page.locator('.pos-invoice-ledger-row')).toHaveCount(4);await page.waitForTimeout(600);await expect(page.locator('.pos-invoice-ledger-row')).toHaveCount(4);await page.screenshot({path:`${evidence}/${browserName}-${theme}-restored.png`})
  await input.fill('۰۱ — ۰۱۰۲');await page.waitForTimeout(400);await expect(page.locator('.pos-invoice-ledger-row')).toHaveCount(1)
  await input.fill('عميل');await input.fill('');await expect(page.locator('.pos-invoice-ledger-row')).toHaveCount(4)
  await input.fill('01-0101');await page.waitForTimeout(300);await input.fill('01-0103');await page.waitForTimeout(700);await expect(page.locator('.pos-invoice-ledger-row')).toHaveCount(1);await expect(page.locator('.pos-invoice-ledger-row')).toContainText('01-0103')
  await page.setViewportSize({width:834,height:1194});await page.screenshot({path:`${evidence}/${browserName}-${theme}-portrait-labelled.png`})
})
