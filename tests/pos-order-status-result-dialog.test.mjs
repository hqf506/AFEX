import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { chromium } from 'playwright'

const page = readFileSync('app/pos/order-status/page.tsx', 'utf8')
const css = readFileSync('app/pos/order-status/order-status.module.css', 'utf8')

test('1 ready plus authoritative WhatsApp success maps to the exact success copy', () => {
  assert.match(page, /transitionClassification !== 'ORDER_STATUS_UPDATED'/)
  assert.match(page, /notificationClassification === 'WHATSAPP_SENT' \? 'success' : 'warning'/)
  assert.match(page, /'تم نقل الطلب إلى جاهز'/)
  assert.match(page, /'تم تحديث حالة الطلب وإرسال رسالة واتساب للعميل بنجاح\.'/)
})

test('2 delivered plus authoritative WhatsApp success maps to the exact delivered copy', () => {
  assert.match(page, /'تم تسليم الطلب'/)
  assert.match(page, /'تم تسجيل تسليم الطلب وإرسال رسالة واتساب للعميل بنجاح\.'/)
})

test('3 the dialog snapshot contains the public order number and no internal order id', () => {
  const snapshotType = page.slice(
    page.indexOf('type TransitionResultDialogSnapshot'),
    page.indexOf('function getOrderStatusMutationMessage')
  )
  assert.match(snapshotType, /publicOrderNumber: string/)
  assert.doesNotMatch(snapshotType, /\borderId\b|\buuid\b/)
  assert.match(page, /الطلب: <b dir="ltr">\{snapshot\.publicOrderNumber\}<\/b>/)
})

test('4 the page-level snapshot is created before the list can remove the transitioned order', () => {
  const advance = page.slice(page.indexOf('const advance = async'), page.indexOf('if (access.loading'))
  assert.ok(advance.indexOf('createTransitionResultDialogSnapshot') < advance.indexOf('setOrders'))
  assert.ok(advance.indexOf('setResultDialog(dialogSnapshot)') < advance.indexOf('await loadOrders(1)'))
  assert.match(page, /\{resultDialog \? <OrderStatusResultDialog/)
})

test('5 the result remains open without timeout or automatic dismissal', () => {
  const dialog = page.slice(page.indexOf('function OrderStatusResultDialog'), page.indexOf('function isPhoneLayout'))
  assert.doesNotMatch(dialog, /setTimeout|setInterval/)
  assert.match(page, /const closeResultDialog = useCallback\(\(\) => setResultDialog\(null\), \[\]\)/)
})

test('6 the explicit done control and Escape close the same dialog state', () => {
  assert.match(page, /if \(event\.key === 'Escape'\)[\s\S]*?onClose\(\)/)
  assert.match(page, /className=\{styles\.resultDialogButton\} onClick=\{onClose\}>تم<\/button>/)
  assert.doesNotMatch(page, /alert\(/)
})

test('7 focus enters the dialog is trapped and restores to a connected trigger or heading', () => {
  assert.match(page, /closeButtonRef\.current\?\.focus\(\)/)
  assert.match(page, /event\.key !== 'Tab'/)
  assert.match(page, /previousFocus\?\.isConnected \? previousFocus : fallbackFocus/)
  assert.match(page, /<h1 ref=\{pageHeadingRef\} tabIndex=\{-1\}>/)
})

test('8 opening the dialog locks and cleanup restores body and document scrolling', () => {
  assert.match(page, /document\.body\.style\.overflow = 'hidden'/)
  assert.match(page, /document\.documentElement\.style\.overflow = 'hidden'/)
  assert.match(page, /document\.body\.style\.overflow = previousBodyOverflow/)
  assert.match(page, /document\.documentElement\.style\.overflow = previousHtmlOverflow/)
})

test('9 provider failure produces a warning dialog and never success wording', () => {
  assert.match(page, /data-result-kind=\{snapshot\.kind\}/)
  assert.match(page, /'تم تحديث الحالة، لكن تعذر إرسال رسالة واتساب للعميل\.'/)
  assert.match(css, /\.resultDialog\[data-result-kind='warning'\]/)
})

test('10 unavailable phone uses the exact warning description', () => {
  assert.match(page, /snapshot\.notificationClassification === 'PHONE_UNAVAILABLE'/)
  assert.match(page, /'تم تحديث الحالة، ولا يوجد رقم جوال صالح لإرسال إشعار واتساب\.'/)
})

test('11 a failed transition keeps existing error handling and cannot create a result dialog', () => {
  assert.match(page, /if \(!response\.ok \|\| !result\?\.success[\s\S]*?setMutationFeedback\([\s\S]*?return/)
  assert.match(page, /transitionClassification !== 'ORDER_STATUS_UPDATED'[\s\S]*?return null/)
  const advance = page.slice(page.indexOf('const advance = async'), page.indexOf('if (access.loading'))
  const failedBranch = advance.slice(advance.indexOf('if (!response.ok'), advance.indexOf('const dialogSnapshot'))
  assert.doesNotMatch(failedBranch, /setOrders|setResultDialog/)
})

test('12 already-applied retries never claim a fresh WhatsApp send', () => {
  assert.match(page, /result\.idempotent \|\| notificationClassification === 'ALREADY_APPLIED_NO_RESEND'/)
  assert.match(page, /'حالة الطلب محدثة مسبقًا\. لم يُعد إرسال إشعار واتساب\.'/)
  assert.match(page, /transitionClassification !== 'ORDER_STATUS_UPDATED'/)
})

test('13 rerenders refreshes and filters cannot independently reopen or duplicate the dialog', () => {
  assert.equal((page.match(/setResultDialog\(dialogSnapshot\)/g) || []).length, 1)
  assert.equal((page.match(/setResultDialog\(null\)/g) || []).length, 1)
  const effects = [...page.matchAll(/useEffect\(\(\) => \{[\s\S]*?\n  \}, \[[^\]]*\]\)/g)].map((match) => match[0]).join('\n')
  assert.doesNotMatch(effects, /setResultDialog/)
})

test('14 closing the dialog performs no request mutation or navigation', () => {
  const closeHandler = page.match(/const closeResultDialog = useCallback\([^\n]+/)?.[0] || ''
  assert.match(closeHandler, /setResultDialog\(null\)/)
  assert.doesNotMatch(closeHandler, /fetch|router|loadOrders|advance|setOrders/)
})

test('15 the accessible responsive dialog is contained and usable across themes and viewports', () => {
  assert.match(page, /role="dialog"/)
  assert.match(page, /aria-modal="true"/)
  assert.match(page, /aria-labelledby=\{titleId\}/)
  assert.match(page, /aria-describedby=\{descriptionId\}/)
  assert.match(css, /\.resultDialogBackdrop \{[\s\S]*?position: fixed;[\s\S]*?inset: 0;[\s\S]*?z-index: 20000;/)
  assert.match(css, /width: min\(430px, calc\(100vw - 32px\)\)/)
  assert.match(css, /max-height: calc\(100dvh - 32px\)/)
  assert.match(css, /@media \(max-width: 767\.98px\)[\s\S]*?width: min\(380px, calc\(100vw - 32px\)\)/)
  assert.match(css, /\.resultDialogButton \{[\s\S]*?min-height: 48px;/)
  assert.match(css, /background: var\(--afex-pos-panel\)/)
  assert.match(css, /color: var\(--afex-pos-text\)/)
  assert.match(css, /var\(--afex-pos-emerald(?:-strong)?\)/)
})

test('16 measured dialog geometry has no overlap clipping overflow or undersized control', { timeout: 30_000 }, async () => {
  const browser = await chromium.launch()
  const cases = [
    { name: 'mobile-portrait', width: 360, height: 800 },
    { name: 'mobile-landscape', width: 844, height: 390 },
    { name: 'tablet', width: 834, height: 1194 },
    { name: 'desktop', width: 1440, height: 1024 },
  ]

  try {
    for (const theme of ['light', 'dark']) {
      for (const viewport of cases) {
        const context = await browser.newContext({ viewport })
        const browserPage = await context.newPage()
        await browserPage.setContent(`<!doctype html><html dir="rtl" data-pos-theme="${theme}"><head><style>
          :root { --afex-pos-panel:#fbf8f2;--afex-pos-border:#d3c8b7;--afex-pos-text:#25221e;--afex-pos-text-secondary:#756f65;--afex-pos-emerald:#a6844f;--afex-pos-emerald-strong:#8a6537 }
          html[data-pos-theme="dark"] { --afex-pos-panel:#15171a;--afex-pos-border:#393a3d;--afex-pos-text:#f4f1ea;--afex-pos-text-secondary:#a9a49b;--afex-pos-emerald:#b89a64;--afex-pos-emerald-strong:#9a7540 }
          html,body{margin:0;width:100%;height:100%;background:var(--afex-pos-panel)}
          ${css}
        </style></head><body><div class="resultDialogBackdrop"><div class="resultDialog" data-result-kind="success" role="dialog" aria-modal="true"><span class="resultDialogIcon"><svg></svg></span><div class="resultDialogCopy"><h2>تم نقل الطلب إلى جاهز</h2><p>تم تحديث حالة الطلب وإرسال رسالة واتساب للعميل بنجاح.</p><p class="resultDialogOrder">الطلب: <b>02-0048</b></p></div><button class="resultDialogButton">تم</button></div></div></body></html>`)

        const metrics = await browserPage.evaluate(() => {
          const dialog = document.querySelector('.resultDialog')
          const button = document.querySelector('.resultDialogButton')
          const parts = [...document.querySelectorAll('.resultDialogIcon,.resultDialogCopy,.resultDialogButton')]
          if (!(dialog instanceof HTMLElement) || !(button instanceof HTMLElement)) throw new Error('fixture missing')
          button.scrollIntoView({ block: 'nearest' })
          const dialogRect = dialog.getBoundingClientRect()
          const buttonRect = button.getBoundingClientRect()
          const overlaps = parts.flatMap((element, index) => parts.slice(index + 1).map((candidate) => {
            const a = element.getBoundingClientRect()
            const b = candidate.getBoundingClientRect()
            return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top
          })).filter(Boolean).length
          const center = document.elementFromPoint(buttonRect.left + buttonRect.width / 2, buttonRect.top + buttonRect.height / 2)
          return {
            dialogInside: dialogRect.left >= 0 && dialogRect.top >= 0 && dialogRect.right <= innerWidth && dialogRect.bottom <= innerHeight,
            horizontalOverflow: document.documentElement.scrollWidth - innerWidth,
            buttonWidth: buttonRect.width,
            buttonHeight: buttonRect.height,
            centerClickable: center === button || button.contains(center),
            overlaps,
          }
        })

        assert.equal(metrics.dialogInside, true, `${theme}/${viewport.name}: dialog clipped`)
        assert.ok(metrics.horizontalOverflow <= 0, `${theme}/${viewport.name}: horizontal overflow`)
        assert.ok(metrics.buttonWidth >= 44 && metrics.buttonHeight >= 44, `${theme}/${viewport.name}: undersized control`)
        assert.equal(metrics.centerClickable, true, `${theme}/${viewport.name}: button center blocked`)
        assert.equal(metrics.overlaps, 0, `${theme}/${viewport.name}: overlapping dialog content`)
        await context.close()
      }
    }
  } finally {
    await browser.close()
  }
})
