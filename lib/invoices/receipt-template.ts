import { getDigitalInvoicePaymentMethodLabel } from '@/lib/invoices/digital-preview'

export type ReceiptTemplateItem = {
  id?: string | number | null
  sku?: string | null
  item_id?: string | number | null
  name?: string | null
  item_name?: string | null
  quantity?: number | null
  price?: number | null
  unit_price?: number | null
  line_total?: number | null
}

export type ReceiptTemplatePayload = {
  brandName?: string
  brandBackgroundColor?: string
  brandTextColor?: string
  customerName?: string
  customer_name?: string
  customerPhone?: string
  customer_phone?: string
  invoiceNumber?: string
  invoice_number?: string
  orderNumber?: string
  order_number?: string
  createdAt?: string
  created_at?: string
  issuedAt?: string
  issued_at?: string
  items?: ReceiptTemplateItem[]
  invoiceItems?: ReceiptTemplateItem[]
  total?: number
  subtotal?: number
  taxAmount?: number
  discountAmount?: number
  finalTotal?: number
  paymentMethod?: string
  payment_method?: string
  finalAmountLabel?: string
  cashReceived?: number
  numericCashReceived?: number
  remainingFromCustomer?: number
  cashChange?: number
  addressLine1?: string
  addressLine2?: string
  whatsappNumber?: string
  whatsappEnabled?: boolean
  googleReviewLink?: string
  googleReviewEnabled?: boolean
  mapLink?: string
  mapEnabled?: boolean
  instagramEnabled?: boolean
  instagramLink?: string
  tiktokEnabled?: boolean
  tiktokLink?: string
  branchName?: string
  branch_name?: string
  note?: string
  globalNote?: string
}

export const DEFAULT_DIGITAL_INVOICE_SETTINGS = {
  brandName: 'AFEX',
  branchName: 'فرع الروضة',
  addressLine1: 'Al Hasan Ibn Ali, Ar Rawdah',
  addressLine2: '13213 الروضة، الرياض',
  brandBackgroundColor: '#2e3f1f',
  brandTextColor: '#e6c58f',
  whatsappNumber: '966554450872',
  whatsappEnabled: true,
  googleReviewLink: 'https://g.page/r/CdwLWviyGLaOEBE/review',
  googleReviewEnabled: true,
  mapLink: 'https://maps.app.goo.gl/xeDFUgtavT8r34kGA',
  mapEnabled: true,
  instagramEnabled: false,
  instagramLink: '',
  tiktokEnabled: false,
  tiktokLink: '',
  note: 'ملاحظة: المحل غير مسؤول عن فقدان الأغراض بعد مضي ثلاث أشهر من تاريخ الفاتورة.',
} as const

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')
}

function formatMoney(value: unknown): string {
  return `${Number(value || 0).toLocaleString('ar-SA')} ريال`
}

function formatDate(value?: string): string {
  const created = value ? new Date(value) : null

  if (!created || Number.isNaN(created.getTime())) {
    return '-'
  }

  return created.toLocaleDateString('ar-SA', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'Asia/Riyadh',
  })
}

function formatPaymentMethod(value?: string): string {
  const payment = String(value || '').toLowerCase()

  if (payment.includes('cash') || payment.includes('نقد')) return '💵 كاش'

  if (
    payment.includes('mada') ||
    payment.includes('card') ||
    payment.includes('visa') ||
    payment.includes('master') ||
    payment.includes('شبكة') ||
    payment.includes('بطاقة')
  ) {
    return '💳 بطاقة ائتمانية'
  }

  if (
    payment.includes('transfer') ||
    payment.includes('bank') ||
    payment.includes('تحويل')
  ) {
    return 'تحويل'
  }

  return value || 'غير محدد'
}

function resolveReceiptPaymentMethodLabel(value?: string): string {
  const paymentMethod = String(value || '').trim()
  const normalized = paymentMethod.toLowerCase()
  const isCashOnDelivery =
    normalized === 'cod' ||
    paymentMethod === 'عند الاستلام' ||
    normalized.includes('عند الاستلام')

  if (isCashOnDelivery) return 'عند الاستلام'
  if (normalized === 'mada' || normalized.includes('مدى')) return 'مدى'
  if (normalized === 'visa' || normalized.includes('فيزا')) return 'فيزا'
  if (
    normalized === 'cash' ||
    paymentMethod === 'نقدي' ||
    normalized.includes('نقد')
  ) {
    return 'نقدي'
  }
  if (
    normalized === 'card' ||
    paymentMethod === 'بطاقة' ||
    normalized.includes('بطاقة') ||
    normalized.includes('master') ||
    normalized.includes('شبكة')
  ) {
    return 'بطاقة'
  }
  if (
    normalized === 'transfer' ||
    paymentMethod === 'تحويل' ||
    normalized.includes('تحويل') ||
    normalized.includes('bank')
  ) {
    return 'تحويل'
  }

  return paymentMethod || 'غير محدد'
}

function getPaymentMethodLabel(
  paymentMethod?: string,
  paymentMethodLabel?: string
): string {
  return (
    getDigitalInvoicePaymentMethodLabel(paymentMethod) ||
    getDigitalInvoicePaymentMethodLabel(paymentMethodLabel)
  )
}

function resolveColor(value: string | undefined, fallback: string) {
  const normalized = value?.trim()
  return /^#[0-9a-f]{6}$/i.test(normalized || '') ? normalized! : fallback
}

type FooterLinkItem = {
  key: string
  href: string
  label: string
  icon: string
  enabled?: boolean
}

export function renderInvoiceHtmlFromPayload(
  payload: ReceiptTemplatePayload
): string {
  const brandName =
    payload.brandName ?? DEFAULT_DIGITAL_INVOICE_SETTINGS.brandName
  const brandBackgroundColor = resolveColor(
    payload.brandBackgroundColor,
    DEFAULT_DIGITAL_INVOICE_SETTINGS.brandBackgroundColor
  )
  const brandTextColor = resolveColor(
    payload.brandTextColor,
    DEFAULT_DIGITAL_INVOICE_SETTINGS.brandTextColor
  )
  const customerName =
    payload.customerName || payload.customer_name || 'عميلنا العزيز'
  const customerPhone = payload.customerPhone || payload.customer_phone || '-'
  const invoiceNumber =
    payload.invoiceNumber ||
    payload.invoice_number ||
    payload.orderNumber ||
    payload.order_number ||
    '-'
  const createdAt =
    payload.issuedAt ||
    payload.issued_at ||
    payload.createdAt ||
    payload.created_at

  const branchName =
    payload.branchName ??
    payload.branch_name ??
    DEFAULT_DIGITAL_INVOICE_SETTINGS.branchName
  const addressLine1 =
    payload.addressLine1 ?? DEFAULT_DIGITAL_INVOICE_SETTINGS.addressLine1
  const addressLine2 =
    payload.addressLine2 ?? DEFAULT_DIGITAL_INVOICE_SETTINGS.addressLine2
  const whatsappNumber =
    payload.whatsappNumber ?? DEFAULT_DIGITAL_INVOICE_SETTINGS.whatsappNumber
  const whatsappEnabled =
    payload.whatsappEnabled ?? DEFAULT_DIGITAL_INVOICE_SETTINGS.whatsappEnabled
  const googleReviewLink =
    payload.googleReviewLink ??
    DEFAULT_DIGITAL_INVOICE_SETTINGS.googleReviewLink
  const googleReviewEnabled =
    payload.googleReviewEnabled ??
    DEFAULT_DIGITAL_INVOICE_SETTINGS.googleReviewEnabled
  const mapLink = payload.mapLink ?? DEFAULT_DIGITAL_INVOICE_SETTINGS.mapLink
  const mapEnabled =
    payload.mapEnabled ?? DEFAULT_DIGITAL_INVOICE_SETTINGS.mapEnabled
  const instagramEnabled =
    payload.instagramEnabled ??
    DEFAULT_DIGITAL_INVOICE_SETTINGS.instagramEnabled
  const instagramLink =
    payload.instagramLink ?? DEFAULT_DIGITAL_INVOICE_SETTINGS.instagramLink
  const tiktokEnabled =
    payload.tiktokEnabled ?? DEFAULT_DIGITAL_INVOICE_SETTINGS.tiktokEnabled
  const tiktokLink =
    payload.tiktokLink ?? DEFAULT_DIGITAL_INVOICE_SETTINGS.tiktokLink

  const items = payload.invoiceItems || payload.items || []
  const taxableAmount = Number(
    payload.subtotal ?? payload.finalTotal ?? payload.total ?? 0
  )
  const vatAmount = Number(payload.taxAmount ?? 0)
  const amountDue = Number(payload.finalTotal ?? payload.total ?? 0)
  const paymentMethodValue = payload.paymentMethod || payload.payment_method
  const isCash =
    paymentMethodValue === 'cash' || paymentMethodValue === 'نقدي'
  const isCashOnDelivery =
    paymentMethodValue === 'cod' || paymentMethodValue === 'عند الاستلام'
  const cashReceivedAmount = Number(
    payload.cashReceived ?? payload.numericCashReceived ?? 0
  )
  const remainingAmount = Number(payload.remainingFromCustomer ?? 0)
  const cashChangeAmount = Number(payload.cashChange ?? 0)
  const amountDueForDisplay =
    isCash && remainingAmount > 0 ? remainingAmount : amountDue
  const paymentType =
    getPaymentMethodLabel(paymentMethodValue) ||
    resolveReceiptPaymentMethodLabel(paymentMethodValue) ||
    formatPaymentMethod(paymentMethodValue)
  const finalAmountLabel =
    payload.finalAmountLabel ||
    (isCashOnDelivery ? 'المتبقي من العميل' : 'الإجمالي')
  const displayFinalAmountLabel = isCash
    ? 'إجمالي المبلغ المستحق'
    : finalAmountLabel
  const orderDate = formatDate(createdAt)
  const note = payload.note ?? ''
  const globalNote = payload.globalNote ?? ''
  const trimmedGlobalNote = globalNote.trim()
  const globalNoteLabelMatch = trimmedGlobalNote.match(/^(ملاحظة\s*:)([\s\S]*)$/u)
  const globalNoteHtml = trimmedGlobalNote
    ? globalNoteLabelMatch
      ? `<div class="global-note-block"><strong>${escapeHtml(globalNoteLabelMatch[1])}</strong><span>${escapeHtml(globalNoteLabelMatch[2].replace(/^[ \t]+/, ''))}</span></div>`
      : `<div class="global-note-block"><strong>ملاحظة:</strong><span>${escapeHtml(trimmedGlobalNote)}</span></div>`
    : ''
  const cashPaymentDetailsHtml = isCash || isCashOnDelivery
    ? `
          <div class="summary-row" style="padding:0;"></div>
          <div style="margin-top: 8px;">
            <div style="font-weight:500; margin-bottom:4px;">
              تفاصيل العملية
            </div>

            <div style="display:flex; justify-content:space-between; font-size:14px;">
              <span>المبلغ المدفوع</span>
              <span>${formatMoney(cashReceivedAmount)}</span>
            </div>

            ${
              isCashOnDelivery || remainingAmount > 0
                ? `
            <div style="display:flex; justify-content:space-between; font-size:14px;">
              <span>المتبقي</span>
              <span>${formatMoney(remainingAmount)}</span>
            </div>
            `
                : ''
            }

            ${
              cashChangeAmount > 0
                ? `
            <div style="display:flex; justify-content:space-between; font-size:14px;">
              <span>الباقي للعميل</span>
              <span>${formatMoney(cashChangeAmount)}</span>
            </div>
            `
                : ''
            }
          </div>
      `
    : ''

  const itemsHtml = items
    .map((item) => {
      const quantity = Number(item.quantity || 0)
      const price = Number(item.price ?? item.unit_price ?? 0)
      const lineTotal = Number(item.line_total ?? quantity * price)
      const code = item.sku || item.item_id || item.id || ''
      const name = item.name || item.item_name || '-'

      return `
    <tr>
      <td class="desc">
        <div class="code">${escapeHtml(code)}</div>
        <div class="item-name">${escapeHtml(name)}</div>
      </td>
      <td>${escapeHtml(quantity || '-')}</td>
      <td>${formatMoney(price)}</td>
      <td>${formatMoney(lineTotal)}</td>
    </tr>
  `
    })
    .join('')

  const footerItems: FooterLinkItem[] = [
    {
      key: 'whatsapp',
      href: `https://wa.me/${encodeURIComponent(whatsappNumber)}`,
      label: 'تواصل معنا',
      enabled: whatsappEnabled,
      icon: `
        <svg viewBox="0 0 32 32" width="18" height="18" aria-hidden="true">
          <path fill="#25D366" d="M16 .396C7.164.396 0 7.56 0 16.396c0 2.885.756 5.596 2.064 7.946L.104 32l7.83-2.046a15.95 15.95 0 007.999 2.16c8.836 0 16-7.164 16-16S24.836.396 16 .396zm0 29.09a13.03 13.03 0 01-6.63-1.82l-.475-.28-4.646 1.214 1.24-4.53-.308-.467A13.03 13.03 0 013.06 16.4c0-7.17 5.77-12.94 12.94-12.94 7.17 0 12.94 5.77 12.94 12.94 0 7.17-5.77 12.94-12.94 12.94zm7.49-9.68c-.41-.205-2.42-1.194-2.79-1.33-.37-.136-.64-.205-.91.205-.27.41-1.05 1.33-1.29 1.6-.24.27-.47.3-.88.1-.41-.205-1.74-.64-3.31-2.04-1.22-1.09-2.04-2.43-2.28-2.84-.24-.41-.026-.63.18-.83.185-.185.41-.47.615-.705.205-.235.27-.41.41-.68.136-.27.068-.51-.034-.705-.102-.205-.91-2.19-1.25-3-.33-.8-.66-.69-.91-.7h-.78c-.27 0-.705.1-1.07.51-.37.41-1.4 1.37-1.4 3.34 0 1.97 1.44 3.88 1.64 4.15.205.27 2.84 4.34 6.88 6.08.96.41 1.71.65 2.3.83.97.31 1.85.27 2.55.165.78-.116 2.42-.99 2.76-1.95.34-.96.34-1.78.24-1.95-.1-.17-.37-.27-.78-.47z"/>
        </svg>
      `,
    },
    {
      key: 'google-review',
      href: googleReviewLink,
      label: 'تقييمك يهمنا',
      enabled: googleReviewEnabled,
      icon: `
        <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
          <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.6 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3 0 5.7 1.1 7.8 3l5.7-5.7C33.6 6.1 29.1 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.3-.4-3.5z"/>
          <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.5 16.1 18.9 12 24 12c3 0 5.7 1.1 7.8 3l5.7-5.7C33.6 6.1 29.1 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/>
          <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.5-5.2l-6.2-5.1C29.2 35.1 26.7 36 24 36c-5.3 0-9.8-3.4-11.4-8.1l-6.5 5C9.5 39.5 16.2 44 24 44z"/>
          <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-1.1 3.1-3.3 5.6-6 7.3l6.2 5.1C39.9 36.7 44 30.9 44 24c0-1.3-.1-2.3-.4-3.5z"/>
        </svg>
      `,
    },
    {
      key: 'instagram',
      href: instagramLink,
      label: 'Instagram',
      enabled: instagramEnabled,
      icon: `
        <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
          <defs>
            <linearGradient id="ig-gradient" x1="0%" y1="100%" x2="100%" y2="0%">
              <stop offset="0%" stop-color="#feda75"/>
              <stop offset="35%" stop-color="#fa7e1e"/>
              <stop offset="65%" stop-color="#d62976"/>
              <stop offset="100%" stop-color="#4f5bd5"/>
            </linearGradient>
          </defs>
          <rect x="2" y="2" width="20" height="20" rx="6" fill="url(#ig-gradient)"/>
          <circle cx="12" cy="12" r="4.2" fill="none" stroke="#fff" stroke-width="1.8"/>
          <circle cx="17.3" cy="6.8" r="1.2" fill="#fff"/>
        </svg>
      `,
    },
    {
      key: 'tiktok',
      href: tiktokLink,
      label: 'TikTok',
      enabled: tiktokEnabled,
      icon: `
        <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true">
          <path d="M12.75 2h2.5c.2 1.6 1.3 3 3 3.4v2.6c-1.3-.1-2.6-.5-3.8-1.2v6.5c0 3.4-2.8 6.2-6.2 6.2S2 16.7 2 13.3s2.8-6.2 6.2-6.2c.4 0 .8 0 1.2.1v2.7c-.4-.2-.8-.2-1.2-.2-2 0-3.7 1.7-3.7 3.7s1.7 3.7 3.7 3.7 3.7-1.7 3.7-3.7V2z"/>
        </svg>
      `,
    },
    {
      key: 'map',
      href: mapLink,
      label: 'موقعنا',
      enabled: mapEnabled,
      icon: `
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
          <path fill="#EA4335" d="M12 2C8.13 2 5 5.13 5 9c0 4.25 7 13 7 13s7-8.75 7-13c0-3.87-3.13-7-7-7z"/>
          <circle cx="12" cy="9" r="2.5" fill="#fff"/>
        </svg>
      `,
    },
  ].filter((item) => (item.enabled ?? true) && item.href.trim() !== '')

  const footerItemsHtml = footerItems
    .map(
      (item) => `
        <a class="footer-link footer-link-${item.key}" href="${escapeHtml(item.href)}" target="_blank" rel="noreferrer">
          ${item.icon}
          <span>${escapeHtml(item.label)}</span>
        </a>
      `
    )
    .join('')

  return `
<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="UTF-8" />
  <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800&display=swap" rel="stylesheet">
  <style>
    @page {
      size: A4;
      margin: 0;
    }

    * {
      box-sizing: border-box;
    }

    html, body {
      margin: 0;
      padding: 0;
      background: #eee;
      font-family: 'Cairo', Arial, sans-serif;
    }

    body {
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }

    .page {
      width: 210mm;
      min-height: 297mm;
      background: #fff;
      margin: 0 auto;
      padding-bottom: 82px;
      overflow: hidden;
      position: relative;
    }

    .header {
      padding: 32px 40px 18px;
    }

    .logo {
      width: 180px;
      height: 80px;
      background: ${brandBackgroundColor};
      color: ${brandTextColor};
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 26px;
      font-weight: 700;
      margin-left: auto;
      margin-right: 0;
      text-align: center;
    }

    .branch {
      font-size: 13px;
      color: #777;
      margin-top: 6px;
      text-align: right;
      width: 180px;
      margin-left: auto;
      margin-right: 0;
      font-family: 'Cairo', Arial, sans-serif;
    }

    .title {
      text-align: center;
      margin-top: 18px;
    }

    .title h1 {
      margin: 0;
      font-size: 24px;
      font-weight: 800;
      color: #111;
      line-height: 1.5;
      word-break: break-word;
    }

    .title p {
      color: #666;
      font-size: 14px;
      margin-top: 8px;
      line-height: 1.7;
    }

    .section-title {
      text-align: center;
      font-size: 22px;
      font-weight: 800;
      color: #111;
      margin: 18px 0 22px;
    }

    .left-title {
      position: absolute;
      top: 32px;
      left: 40px;
      font-size: 13px;
      color: #777;
      font-family: 'Cairo', Arial, sans-serif;
      direction: ltr;
      text-align: left;
      line-height: 1.8;
    }

    .layout {
      display: grid;
      grid-template-columns: minmax(0, 1fr) 226px;
      padding: 0 0 0 10px;
      gap: 14px;
      align-items: start;
      direction: ltr;
    }

    .sidebar-area {
      width: 226px;
      direction: rtl;
    }

    .sidebar {
      background: #f3f3f3;
      padding: 20px;
      display: flex;
      flex-direction: column;
      min-height: 600px;
    }

    .side-block {
      margin-bottom: 14px;
      padding-bottom: 10px;
      border-bottom: 1px solid #e2e2e2;
    }

    .side-label {
      font-size: 18px;
      font-weight: 700;
      color: #111;
      margin-bottom: 4px;
      line-height: 1.5;
    }

    .side-value {
      font-size: 13px;
      font-weight: 400;
      color: #777;
      line-height: 1.8;
      word-break: break-word;
      overflow-wrap: anywhere;
    }

    .total-block {
      margin-top: auto;
      border-top: 1px solid #ccc;
      padding-top: 12px;
      text-align: center;
    }

    .total-label {
      font-size: 20px;
      font-weight: 800;
      color: #111;
      line-height: 1.5;
    }

    .total-value {
      display: flex;
      justify-content: center;
      align-items: baseline;
      gap: 6px;
      flex-wrap: wrap;
    }

    .amount {
      font-size: 28px;
      font-weight: 500;
      color: #111;
      line-height: 1.2;
    }

    .currency {
      font-size: 14px;
      color: #666;
    }

    .table-wrap {
      min-width: 0;
      overflow: hidden;
      direction: rtl;
    }

    table {
      width: 100%;
      border-collapse: collapse;
      table-layout: fixed;
      page-break-inside: auto;
    }

    thead {
      display: table-header-group;
    }

    tbody {
      display: table-row-group;
    }

    tr {
      page-break-inside: avoid;
      break-inside: avoid;
    }

    th, td {
      padding: 10px 6px;
      border-bottom: 1px solid #ddd;
      text-align: center;
      vertical-align: top;
      font-size: 13px;
      line-height: 1.7;
      overflow-wrap: anywhere;
      word-break: break-word;
    }

    th {
      font-weight: 700;
      color: #111;
      background: #fafafa;
    }

    th:nth-child(1), td:nth-child(1) { width: 46%; }
    th:nth-child(2), td:nth-child(2) { width: 14%; }
    th:nth-child(3), td:nth-child(3) { width: 20%; }
    th:nth-child(4), td:nth-child(4) { width: 20%; }

    .desc {
      text-align: right;
    }

    .item-name {
      font-weight: 600;
      color: #111;
      line-height: 1.7;
      white-space: normal;
      overflow-wrap: anywhere;
      word-break: break-word;
    }

    .code {
      font-size: 11px;
      color: #888;
      margin-bottom: 2px;
      line-height: 1.5;
      direction: ltr;
      text-align: right;
    }

    .summary-box {
      width: 300px;
      max-width: 100%;
      margin: 30px auto 0;
    }

    .summary-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 18px;
      padding: 12px 0;
      border-top: 1px solid #e3e3e3;
    }

    .summary-row:first-child {
      border-top: none;
    }

    .summary-text {
      flex: 1;
      text-align: right;
      line-height: 1.35;
      min-width: 0;
    }

    .summary-ar {
      font-size: 13px;
      font-weight: 600;
      color: #111;
      line-height: 1.6;
    }

    .summary-en {
      font-size: 10px;
      color: #555;
      line-height: 1.5;
    }

    .summary-en.strong {
      font-weight: 700;
      color: #111;
    }

    .summary-amount {
      min-width: 95px;
      text-align: left;
      white-space: nowrap;
      font-size: 15px;
      font-weight: 500;
      color: #111;
    }

    .summary-amount.strong {
      font-size: 17px;
      font-weight: 700;
    }

    .summary-row.due .summary-ar,
    .summary-row.due .summary-en.strong {
      font-weight: 700;
    }

    .note-block {
      display: flex;
      align-items: flex-start;
      gap: 4px;
      direction: rtl;
      text-align: right;
      font-size: 11px;
      color: #333;
      margin: 12px 0 0;
      line-height: 1.8;
    }

    .note-block strong {
      flex: 0 0 auto;
      font-weight: 700;
    }

    .note-block span {
      min-width: 0;
      white-space: pre-line;
      overflow-wrap: anywhere;
    }

    .global-note-block {
      position: absolute;
      right: 40px;
      bottom: 90px;
      left: 40px;
      display: flex;
      align-items: flex-start;
      justify-content: center;
      gap: 4px;
      direction: rtl;
      text-align: center;
      font-size: 10px;
      color: #555;
      margin: 0;
      line-height: 1.8;
    }

    .global-note-block strong {
      flex: 0 0 auto;
      font-weight: 700;
    }

    .global-note-block span {
      min-width: 0;
      white-space: pre-line;
      overflow-wrap: anywhere;
    }

    .cash-details {
      margin-top: 20px;
    }

    .cash-details hr {
      border: 0;
      border-top: 1px solid #e3e3e3;
      margin: 0 0 12px;
    }

    .cash-details h3 {
      margin: 0 0 10px;
      font-size: 14px;
      font-weight: 700;
      color: #111;
      text-align: right;
    }

    .cash-details p {
      margin: 0;
      padding: 8px 0;
      font-size: 13px;
      color: #111;
      border-top: 1px solid #efefef;
      text-align: right;
    }

    .cash-details p:first-of-type {
      border-top: none;
    }

    .footer {
      position: absolute;
      bottom: 10px;
      right: 0;
      left: 0;
      padding: 0 40px;
      direction: rtl;
    }

    .footer::before {
      content: "";
      display: block;
      height: 1px;
      background: #e5e7eb;
      margin-bottom: 16px;
    }

    .footer-links {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(108px, 1fr));
      gap: 14px;
      align-items: start;
      text-align: center;
    }

    .footer-link {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 8px;
      color: #777;
      text-decoration: none;
      font-size: 12px;
      font-weight: 400;
      font-family: 'Cairo', Arial, sans-serif;
      line-height: 1.5;
      min-height: 52px;
      padding: 2px 4px;
    }

    .footer-link svg {
      width: 18px;
      height: 18px;
      display: block;
      flex-shrink: 0;
    }

    @media print {
      html, body {
        background: #fff;
      }

      .page {
        width: 100%;
        margin: 0;
        padding-bottom: 0;
        box-shadow: none;
      }

      .layout {
        page-break-inside: auto;
      }

      .sidebar-area,
      .table-wrap,
      .summary-box,
      .footer,
      .note-block,
      .global-note-block {
        page-break-inside: avoid;
        break-inside: avoid;
      }
    }
  </style>
</head>
<body>
  <div class="page">
    <div class="header">
      <div class="left-title">
        ${escapeHtml(addressLine1)}<br>
        ${escapeHtml(addressLine2)}
      </div>

      <div class="logo">${escapeHtml(brandName)}</div>
      <div class="branch">${escapeHtml(branchName)}</div>

      <div class="title">
        <h1>طلبك، ${escapeHtml(customerName)}</h1>
        <p>شكراً لزيارتكم لنا، لقد أرفقنا تفاصيل طلبك.</p>
      </div>
    </div>

    <div class="section-title">الطلب والإجمالي</div>

    <div class="layout">
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>الوصف</th>
              <th>الكمية</th>
              <th>سعر الوحدة</th>
              <th>الإجمالي</th>
            </tr>
          </thead>
          <tbody>
            ${itemsHtml}
          </tbody>
        </table>

        <div class="summary-box">
          <div class="summary-row">
            <div class="summary-text">
              <div class="summary-ar">الإجمالي الخاضع للضريبة</div>
              <div class="summary-en">(غير شامل القيمة المضافة)</div>
              <div class="summary-en strong">Total subject to tax</div>
              <div class="summary-en">(Not including VAT)</div>
            </div>
            <div class="summary-amount">${formatMoney(taxableAmount)}</div>
          </div>

          <div class="summary-row">
            <div class="summary-text">
              <div class="summary-ar">مجموع ضريبة القيمة المضافة</div>
              <div class="summary-en strong">Total V.A.T</div>
            </div>
            <div class="summary-amount">${formatMoney(vatAmount)}</div>
          </div>

          ${cashPaymentDetailsHtml}

          <div class="summary-row due">
            <div class="summary-text">
              <div class="summary-ar">إجمالي المبلغ المستحق</div>
              <div class="summary-en strong">Total amount due</div>
            </div>
            <div class="summary-amount strong">${formatMoney(amountDueForDisplay)}</div>
          </div>
        </div>

        ${
          note.trim()
            ? `<div class="note-block"><strong>ملاحظة العميل:</strong><span>${escapeHtml(note)}</span></div>`
            : ''
        }
      </div>

      <div class="sidebar-area">
        <div class="sidebar">
          <div class="side-block">
            <div class="side-label">تاريخ الطلب:</div>
            <div class="side-value">${escapeHtml(orderDate)}</div>
          </div>

          <div class="side-block">
            <div class="side-label">رقم الفاتورة:</div>
            <div class="side-value">${escapeHtml(invoiceNumber)}</div>
          </div>

          <div class="side-block">
            <div class="side-label">رقم العميل:</div>
            <div class="side-value">${escapeHtml(customerPhone)}</div>
          </div>

          <div class="side-block">
            <div class="side-label">طريقة الدفع:</div>
            <div class="side-value">${escapeHtml(paymentType)}</div>
          </div>

          <div class="total-block">
            <div class="total-label">إجمالي المبلغ</div>
            <div class="total-value">
              <span class="amount">${Number(amountDueForDisplay).toLocaleString('ar-SA')}</span>
              <span class="currency">ريال</span>
            </div>
          </div>
        </div>
      </div>
    </div>

    ${globalNoteHtml}

    <div class="footer">
      <div class="footer-links">
        ${footerItemsHtml}
      </div>
    </div>
  </div>
</body>
</html>
`.replace(
    /<div class="total-label">.*?<\/div>/,
    `<div class="total-label">${escapeHtml(displayFinalAmountLabel)}</div>`
  )
}

export const renderInvoiceHtml = renderInvoiceHtmlFromPayload



