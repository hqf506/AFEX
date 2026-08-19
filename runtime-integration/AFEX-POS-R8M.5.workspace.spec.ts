import { expect, test } from '@playwright/test'
import { mkdirSync, readFileSync } from 'node:fs'

const css = readFileSync('app/globals.css', 'utf8')
const evidence = 'C:/AFEX-Evidence/R8M.5-AUTOMATION-SCREENSHOTS'
mkdirSync(evidence, { recursive: true })
const sizes = [{ width: 768, height: 1024 }, { width: 810, height: 1080 }, { width: 820, height: 1180 }, { width: 834, height: 1194 }, { width: 1024, height: 768 }, { width: 1080, height: 810 }, { width: 1180, height: 820 }, { width: 1194, height: 834 }]
const columns = [['invoice-number','رقم الفاتورة'],['customer','اسم العميل'],['time','التوقيت'],['payment','طريقة الدفع'],['total','الإجمالي'],['status','حالة الفاتورة']]
const data = [
  ['1','02-0034','فيصل','03:30 م','مدى','276.00 ر.س','مدفوعة','اليوم'],
  ['2','01-0001','اسم عميل عربي طويل جدًا لاختبار الاقتطاع الآمن','02:20 م','نقدي','9,999,999.00 ر.س','مدفوعة','اليوم'],
  ['3','12-9999','عميل نقدي','11:10 ص','Visa','80.00 ر.س','مستردة','أمس'],
  ['4','BRANCH-2026-000123','Faisal فيصل','09:00 ص','آجل','55.00 ر.س','مدفوعة','18 أغسطس 2026'],
]

const fixture = (theme: string) => `<!doctype html><html dir="rtl" data-pos-theme="${theme}"><head><meta charset="utf-8"><style>${css}</style><style>html,body{margin:0;width:100%;height:100%;overflow:hidden}.pos-invoices-page{height:100%;background:var(--afex-pos-base)}.pos-invoices-page>main{height:100%;display:grid;grid-template-rows:auto auto minmax(0,1fr)}.pos-invoices-workspace{grid-template-columns:minmax(0,1.65fr) minmax(320px,1fr)}.pos-invoice-detail-pane{min-height:0}.fixture-detail{padding:20px}</style></head><body><div class="pos-invoices-page"><main><header class="pos-invoices-header"><div class="pos-history-heading"><div><h1>الفواتير</h1><p>سجل المبيعات والفواتير</p></div></div><div><button>إغلاق</button><button>تحديث</button></div></header><div class="pos-invoices-toolbar"><label class="pos-invoices-search"><input aria-label="البحث" placeholder="ابحث برقم الفاتورة أو اسم العميل"><button hidden type="button" class="pos-invoices-search-clear" aria-label="مسح البحث">مسح</button></label><div role="group"><button data-active="true">الكل</button><button>مدفوعة</button><button>مستردة</button></div></div><section class="pos-invoices-workspace"><div class="pos-invoice-ledger" role="grid"><div class="pos-invoice-ledger-columns" role="row">${columns.map(([key,label])=>`<span role="columnheader" data-column="${key}">${label}</span>`).join('')}</div><div id="rows"></div></div><aside class="pos-invoice-detail-pane"><div class="fixture-detail">تفاصيل الفاتورة المحددة</div></aside></section></main></div><script>
const all=${JSON.stringify(data)};let generation=0,timer=0;const rows=document.querySelector('#rows'),input=document.querySelector('input'),clear=document.querySelector('.pos-invoices-search-clear');
function normalize(v){return v.trim().replace(/[٠-٩]/g,d=>'٠١٢٣٤٥٦٧٨٩'.indexOf(d)).replace(/[۰-۹]/g,d=>'۰۱۲۳۴۵۶۷۸۹'.indexOf(d)).replace(/[‐-―]/g,'-').replace(/\\s*-\\s*/g,'-').toLowerCase()}
function row(v){return '<button type="button" class="pos-invoice-ledger-row" role="row" data-id="'+v[0]+'"><strong role="gridcell" data-column="invoice-number" data-label="رقم الفاتورة" class="is-invoice-number" dir="ltr">'+v[1]+'</strong><span role="gridcell" data-column="customer" data-label="اسم العميل" class="is-customer" title="'+v[2]+'">'+v[2]+'</span><time role="gridcell" data-column="time" data-label="التوقيت">'+v[3]+'</time><span role="gridcell" data-column="payment" data-label="طريقة الدفع" class="is-payment">'+v[4]+'</span><b role="gridcell" data-column="total" data-label="الإجمالي">'+v[5]+'</b><i role="gridcell" data-column="status" data-label="حالة الفاتورة">'+v[6]+'</i></button>'}
function render(items){const grouped=new Map;for(const item of items){if(!grouped.has(item[7]))grouped.set(item[7],[]);grouped.get(item[7]).push(item)}rows.innerHTML=[...grouped].map(([g,items])=>'<section class="pos-invoice-date-group"><h2>'+g+'</h2><div>'+items.map(row).join('')+'</div></section>').join('');rows.querySelector('button')?.setAttribute('data-selected','true')}
function intent(value){const q=normalize(value);generation++;const mine=generation;clear.hidden=!q;clearTimeout(timer);if(!q){input.value='';render(all);return}timer=setTimeout(()=>setTimeout(()=>{if(mine!==generation)return;render(all.filter(v=>normalize(v[1]+' '+v[2]).includes(q)))},q.includes('9999')?450:50),250)}
input.addEventListener('input',e=>intent(e.target.value));clear.addEventListener('click',()=>intent(''));render(all);window.fixture={intent,count:()=>rows.querySelectorAll('.pos-invoice-ledger-row').length};
</script></body></html>`

test.setTimeout(180_000)
for (const theme of ['light','dark']) test(`R8M.5 ${theme} text geometry, bidi, and search`, async ({ page, browserName }) => {
  await page.setContent(fixture(theme))
  for (const size of sizes) {
    await page.setViewportSize(size)
    await page.waitForTimeout(40)
    const metrics = await page.evaluate(() => {
      const header = document.querySelector<HTMLElement>('.pos-invoice-ledger-columns')!
      const row = document.querySelector<HTMLElement>('.pos-invoice-ledger-row')!
      const visible = getComputedStyle(header).display !== 'none'
      const rect = (el: Element) => { const r=el.getBoundingClientRect(); return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height,cx:(r.left+r.right)/2} }
      const textRect = (el: Element) => { const range=document.createRange();range.selectNodeContents(el);const r=range.getBoundingClientRect();return {left:r.left,right:r.right,width:r.width,cx:(r.left+r.right)/2} }
      const heads=[...header.children].map(rect),cells=[...row.children].map(rect),texts=[...row.children].map(textRect)
      const standardInside = texts.slice(0,2).every((r,i)=>r.left>=cells[i].left-.5&&r.right<=cells[i].right+.5)
      const gap = texts[0].left-texts[1].right
      const intersection = Math.max(0,Math.min(texts[0].right,texts[1].right)-Math.max(texts[0].left,texts[1].left))
      return {visible,columns:row.children.length,alignment:visible?Math.max(...heads.map((h,i)=>Math.max(Math.abs(h.left-cells[i].left),Math.abs(h.right-cells[i].right)))):0,invoiceCenter:visible?Math.abs(heads[0].cx-texts[0].cx):0,customerCenter:visible?Math.abs(heads[1].cx-texts[1].cx):0,standardInside,gap,intersection,direction:getComputedStyle(row.children[0]).direction,bidi:getComputedStyle(row.children[0]).unicodeBidi,textAlign:[...row.children].map(x=>getComputedStyle(x).textAlign),overflow:document.documentElement.scrollWidth-innerWidth,copy:row.children[0].textContent}
    })
    expect(metrics.columns).toBe(6);expect(metrics.overflow).toBe(0);expect(metrics.copy).toBe('02-0034')
    if (metrics.visible) { expect(metrics.alignment).toBeLessThanOrEqual(1);expect(metrics.invoiceCenter).toBeLessThanOrEqual(1);expect(metrics.customerCenter).toBeLessThanOrEqual(1);expect(metrics.standardInside).toBe(true);expect(metrics.gap).toBeGreaterThanOrEqual(12);expect(metrics.intersection).toBe(0);expect(metrics.direction).toBe('ltr');expect(metrics.bidi).toContain('isolate');expect(metrics.textAlign.every(x=>x==='center')).toBe(true) }
  }
  await page.setViewportSize({width:1194,height:834})
  await page.screenshot({path:`${evidence}/${browserName}-${theme}-aligned-ledger.png`})
  await page.evaluate(() => { const colors=['#ef4444','#3b82f6'];['invoice-number','customer'].forEach((key,i)=>{const cell=document.querySelector<HTMLElement>(`.pos-invoice-ledger-row [data-column="${key}"]`)!,r=cell.getBoundingClientRect(),box=document.createElement('div');Object.assign(box.style,{position:'fixed',pointerEvents:'none',zIndex:'9999',left:`${r.left}px`,top:`${r.top}px`,width:`${r.width}px`,height:`${r.height}px`,border:`2px solid ${colors[i]}`,boxSizing:'border-box'});document.body.appendChild(box)}) })
  await page.screenshot({path:`${evidence}/${browserName}-${theme}-annotated-boundaries.png`})
  const input=page.getByRole('textbox',{name:'البحث'});await input.fill('02-0034');await page.waitForTimeout(400);await expect(page.locator('.pos-invoice-ledger-row')).toHaveCount(1);await page.screenshot({path:`${evidence}/${browserName}-${theme}-search.png`});await input.fill('');await expect(page.locator('.pos-invoice-ledger-row')).toHaveCount(4);await page.waitForTimeout(600);await expect(page.locator('.pos-invoice-ledger-row')).toHaveCount(4);await page.screenshot({path:`${evidence}/${browserName}-${theme}-restored.png`})
})
