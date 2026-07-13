import { type ReceiptTemplatePayload } from '@/lib/invoices/receipt-template'
import { getPaymentMethodLabel as getSharedPaymentMethodLabel } from '@/lib/invoices/payment-method'

export type ThermalPaperWidth = '80mm' | '58mm'

export type ThermalInvoiceTemplatePayload = ReceiptTemplatePayload & {
  thermalLogoUrl?: string
  logoUrl?: string
  logo_url?: string
  thermalBrandName?: string
  thermalBranchName?: string
  thermalPaperWidth?: ThermalPaperWidth
  thermalShowCustomerPhone?: boolean
  thermalShowPaymentMethod?: boolean
  thermalShowNote?: boolean
  thermalNote?: string
  thermalFooterMessage?: string
  thermalShowWhatsapp?: boolean
  thermalShowInstagram?: boolean
  thermalShowTiktok?: boolean
  thermalShowGoogleReview?: boolean
  thermalShowMap?: boolean
  receivedAmount?: number
  paidAmount?: number
  remaining?: number
  change?: number
}

export const DEFAULT_THERMAL_INVOICE_SETTINGS = {
  brandName: 'AFEX',
  branchName: 'فرع الروضة',
  paperWidth: '80mm' as ThermalPaperWidth,
  showCustomerPhone: true,
  showPaymentMethod: true,
  showNote: true,
  note: 'المحل غير مسؤول عن فقدان الأغراض بعد مضي ثلاث اشهر من تاريخ الفاتورة.',
  footerMessage: 'شكراً لزيارتكم',
  showWhatsapp: true,
  showInstagram: false,
  showTiktok: false,
  showGoogleReview: true,
  showMap: true,
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
  return `${Number(value || 0).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} ريال`
}

function formatDate(value?: string): string {
  const created = value ? new Date(value) : null

  if (!created || Number.isNaN(created.getTime())) {
    return '-'
  }

  return created.toLocaleString('ar-SA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'Asia/Riyadh',
  })
}

function formatPaymentMethod(value?: string): string {
  const sharedLabel = getSharedPaymentMethodLabel(value)

  if (sharedLabel) {
    return sharedLabel
  }

  const payment = String(value || '').toLowerCase()

  if (payment.includes('cash') || payment.includes('نقد')) return 'نقد'
  if (
    payment.includes('mada') ||
    payment.includes('card') ||
    payment.includes('visa') ||
    payment.includes('master') ||
    payment.includes('شبكة') ||
    payment.includes('بطاقة')
  ) {
    return 'شبكة'
  }

  if (
    payment.includes('cod') ||
    payment.includes('delivery') ||
    payment.includes('عند الاستلام')
  ) {
    return 'عند الاستلام'
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

function resolvePaperWidth(value?: string): ThermalPaperWidth {
  return value === '58mm' ? '58mm' : '80mm'
}

export function renderThermalInvoiceHtml(
  payload: ThermalInvoiceTemplatePayload
): string {
  const paperWidth = resolvePaperWidth(payload.thermalPaperWidth)
  const logoUrl =
    payload.thermalLogoUrl ?? payload.logoUrl ?? payload.logo_url ?? ''
  const brandName =
    payload.thermalBrandName ??
    payload.brandName ??
    DEFAULT_THERMAL_INVOICE_SETTINGS.brandName
  const branchName =
    payload.thermalBranchName ??
    payload.branchName ??
    payload.branch_name ??
    DEFAULT_THERMAL_INVOICE_SETTINGS.branchName
  const addressLine1 = payload.addressLine1 ?? ''
  const addressLine2 = payload.addressLine2 ?? ''
  const customerName = payload.customerName || payload.customer_name || 'عميل'
  const customerPhone = payload.customerPhone || payload.customer_phone || '-'
  const invoiceNumber =
    payload.invoiceNumber ||
    payload.invoice_number ||
    payload.orderNumber ||
    payload.order_number ||
    '-'
  const issuedAt =
    payload.issuedAt ||
    payload.issued_at ||
    payload.createdAt ||
    payload.created_at
  const subtotal = Number(
    payload.subtotal ?? payload.finalTotal ?? payload.total ?? 0
  )
  const taxAmount = Number(payload.taxAmount ?? 0)
  const total = Number(payload.finalTotal ?? payload.total ?? 0)
  const paymentMethod = formatPaymentMethod(
    payload.paymentMethod || payload.payment_method
  )
  const isCash =
    payload.paymentMethod === 'cash' ||
    payload.payment_method === 'cash' ||
    paymentMethod === 'نقدي' ||
    paymentMethod === 'نقد'
  const isCashOnDelivery =
    paymentMethod === 'عند الاستلام' ||
    String(payload.paymentMethod || payload.payment_method)
      .toLowerCase()
      .includes('cod')
  const cashReceivedAmount = Number(
    payload.cashReceived ??
      payload.numericCashReceived ??
      payload.receivedAmount ??
      payload.paidAmount ??
      0
  )
  const remainingAmount = Number(
    payload.remainingFromCustomer ?? payload.remaining ?? 0
  )
  const cashChangeAmount = Number(payload.cashChange ?? payload.change ?? 0)
  const finalAmountLabel = isCashOnDelivery ? 'المتبقي من العميل' : 'الإجمالي'
  const showCustomerPhone =
    payload.thermalShowCustomerPhone ??
    DEFAULT_THERMAL_INVOICE_SETTINGS.showCustomerPhone
  const showPaymentMethod =
    payload.thermalShowPaymentMethod ??
    DEFAULT_THERMAL_INVOICE_SETTINGS.showPaymentMethod
  const showNote =
    payload.thermalShowNote ?? DEFAULT_THERMAL_INVOICE_SETTINGS.showNote
  const rawCustomerNote = String(payload.note || '').trim()
  const customerNote =
    rawCustomerNote === '-' || rawCustomerNote === '—' ? '' : rawCustomerNote
  const note =
    payload.thermalNote ?? DEFAULT_THERMAL_INVOICE_SETTINGS.note
  const footerMessage =
    payload.thermalFooterMessage ??
    DEFAULT_THERMAL_INVOICE_SETTINGS.footerMessage
  const showStoreWhatsapp =
    payload.thermalShowWhatsapp ?? DEFAULT_THERMAL_INVOICE_SETTINGS.showWhatsapp
  const showStoreMap =
    payload.thermalShowMap ?? DEFAULT_THERMAL_INVOICE_SETTINGS.showMap
  const headerDetails = [
    addressLine1,
    addressLine2,
    showStoreWhatsapp && payload.whatsappNumber?.trim()
      ? `واتساب: ${payload.whatsappNumber}`
      : '',
    showStoreMap && payload.mapLink?.trim() ? `الموقع: ${payload.mapLink}` : '',
  ].filter((item): item is string => Boolean(item && item.trim()))
  const headerDetailsHtml = headerDetails.length
    ? `
      <div class="header-details">
        ${headerDetails.map((item) => `<div>${escapeHtml(item)}</div>`).join('')}
      </div>
    `
    : ''
  const thermalContactItems = [
    {
      enabled:
        payload.thermalShowInstagram ??
        DEFAULT_THERMAL_INVOICE_SETTINGS.showInstagram,
      label: 'Instagram',
      value: payload.instagramLink,
    },
    {
      enabled:
        payload.thermalShowTiktok ??
        DEFAULT_THERMAL_INVOICE_SETTINGS.showTiktok,
      label: 'TikTok',
      value: payload.tiktokLink,
    },
    {
      enabled:
        payload.thermalShowGoogleReview ??
        DEFAULT_THERMAL_INVOICE_SETTINGS.showGoogleReview,
      label: 'Google Review',
      value: payload.googleReviewLink,
    },
  ].filter((item) => item.enabled && item.value?.trim())
  const thermalContactHtml = thermalContactItems.length
    ? `
    <div class="contact-links">
      ${thermalContactItems
        .map(
          (item) => `
      <div>${escapeHtml(item.label)}: ${escapeHtml(item.value)}</div>
      `
        )
        .join('')}
    </div>
    `
    : ''
  const items = payload.invoiceItems || payload.items || []
  const logoHtml = logoUrl.trim()
    ? `
      <img
        class="receipt-logo"
        src="${escapeHtml(logoUrl)}"
        alt="${escapeHtml(brandName)}"
      />
    `
    : ''

  const itemsHtml = items
    .map((item) => {
      const quantity = Number(item.quantity || 0)
      const price = Number(item.price ?? item.unit_price ?? 0)
      const name = item.name || item.item_name || '-'

      return `
        <div class="item">
          <div class="item-name">${escapeHtml(name)}</div>
          <div class="item-meta">${escapeHtml(quantity)} × ${formatMoney(price)}</div>
        </div>
      `
    })
    .join('')

  const cashDetailsHtml = isCash
    ? `
      <div class="divider"></div>
      <div class="row">
        <span>تفاصيل الدفع النقدي</span>
        <span></span>
      </div>
      <div class="row">
        <span>المبلغ المدفوع:</span>
        <span>${formatMoney(cashReceivedAmount)}</span>
      </div>
      ${
        remainingAmount > 0
          ? `
      <div class="row">
        <span>المتبقي:</span>
        <span>${formatMoney(remainingAmount)}</span>
      </div>
      `
          : ''
      }
      ${
        cashChangeAmount > 0
          ? `
      <div class="row">
        <span>الباقي للعميل:</span>
        <span>${formatMoney(cashChangeAmount)}</span>
      </div>
      `
          : ''
      }
    `
    : ''

  return `
<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Thermal Invoice</title>
  <style>
    @page {
      size: ${paperWidth} auto;
      margin: 0;
    }

    * {
      box-sizing: border-box;
    }

    html, body {
      margin: 0;
      padding: 0;
      background: #fff;
      color: #111;
      font-family: "Courier New", "Cascadia Mono", monospace;
      width: ${paperWidth};
    }

    body {
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }

    .receipt {
      width: ${paperWidth};
      padding: 8mm 5mm;
      margin: 0 auto;
      background: #ffffff;
    }

    .header {
      text-align: center;
    }

    .receipt-logo {
      display: block;
      max-width: 120px;
      max-height: 55px;
      width: auto;
      height: auto;
      object-fit: contain;
      margin: 0 auto 6px;
    }

    .brand {
      font-size: ${paperWidth === '58mm' ? '16px' : '18px'};
      font-weight: 700;
      letter-spacing: 0.02em;
    }

    .branch {
      margin-top: 4px;
      font-size: 12px;
    }

    .header-details {
      margin-top: 5px;
      display: grid;
      gap: 2px;
      text-align: center;
      font-size: 10px;
      line-height: 1.5;
      color: #222;
      word-break: break-word;
    }

    .divider {
      border-top: 1px solid #000;
      margin: 12px 0;
    }

    .meta-grid,
    .totals {
      display: grid;
      gap: 4px;
    }

    .meta-grid {
      gap: 10px;
    }

    .meta-block {
      display: grid;
      gap: 2px;
      text-align: right;
    }

    .label {
      font-size: 11px;
      color: #555;
    }

    .value {
      font-size: 13px;
      color: #111;
      font-weight: 700;
      word-break: break-word;
    }

    .section-title {
      font-size: 12px;
      font-weight: 700;
      text-align: center;
    }

    .items {
      display: grid;
      gap: 8px;
    }

    .item {
      display: grid;
      gap: 3px;
      text-align: right;
    }

    .item + .item {
      border-top: 1px solid #eee;
      margin-top: 8px;
      padding-top: 8px;
    }

    .item-name {
      font-size: 12px;
      font-weight: 700;
      word-break: break-word;
    }

    .item-meta {
      font-size: 11px;
      color: #555;
    }

    .row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 8px;
      font-size: 12px;
      line-height: 1.6;
    }

    .row.total {
      font-size: 14px;
      font-weight: 700;
    }

    .note {
      text-align: right;
      font-size: 11px;
      line-height: 1.8;
      color: #333;
      margin-top: 12px;
    }

    .customer-note {
      display: flex;
      align-items: flex-start;
      gap: 4px;
      direction: rtl;
      text-align: right;
      font-size: 11px;
      line-height: 1.8;
      color: #333;
      margin-top: 12px;
    }

    .customer-note strong {
      flex: 0 0 auto;
      font-weight: 700;
    }

    .customer-note span {
      min-width: 0;
      white-space: pre-line;
      overflow-wrap: anywhere;
    }

    .thanks {
      margin-top: 12px;
      text-align: center;
      font-size: 12px;
      font-weight: 700;
    }

    .contact-links {
      margin-top: 10px;
      display: grid;
      gap: 3px;
      text-align: center;
      font-size: 10px;
      line-height: 1.5;
      word-break: break-word;
    }
  </style>
</head>
<body style="background: #ffffff; margin: 0;">
  <div class="receipt">
    <div class="header">
      ${logoHtml}
      <div class="brand">${escapeHtml(brandName)}</div>
      <div class="branch">${escapeHtml(branchName)}</div>
      ${headerDetailsHtml}
    </div>

    <div class="divider"></div>

    <div class="meta-grid">
      <div class="meta-block">
        <div class="label">اسم العميل:</div>
        <div class="value">${escapeHtml(customerName)}</div>
      </div>
      ${
        showCustomerPhone
          ? `
      <div class="meta-block">
        <div class="label">رقم العميل:</div>
        <div class="value">${escapeHtml(customerPhone)}</div>
      </div>
      `
          : ''
      }
      <div class="meta-block">
        <div class="label">رقم الفاتورة:</div>
        <div class="value">${escapeHtml(invoiceNumber)}</div>
      </div>
      <div class="meta-block">
        <div class="label">التاريخ:</div>
        <div class="value">${escapeHtml(formatDate(issuedAt))}</div>
      </div>
      ${
        showPaymentMethod
          ? `
      <div class="meta-block">
        <div class="label">طريقة الدفع:</div>
        <div class="value">${escapeHtml(paymentMethod)}</div>
      </div>
      `
          : ''
      }
    </div>

    <div class="divider"></div>
    <div class="section-title">المنتجات</div>
    <div class="divider"></div>

    <div class="items">
      ${itemsHtml || '<div class="item-name">لا توجد عناصر</div>'}
    </div>

    <div class="totals">
      <div class="divider"></div>
      <div class="row">
        <span>المجموع الفرعي</span>
        <span>${formatMoney(subtotal)}</span>
      </div>
      <div class="row">
        <span>الضريبة</span>
        <span>${formatMoney(taxAmount)}</span>
      </div>
      ${cashDetailsHtml}
      <div class="divider"></div>
      <div class="row total">
        <span>${finalAmountLabel}</span>
        <span>${formatMoney(total)}</span>
      </div>
    </div>

    ${
      customerNote
        ? `
    <div class="customer-note"><strong>ملاحظة العميل:</strong><span>${escapeHtml(customerNote)}</span></div>
    `
        : ''
    }

    ${
      showNote && note.trim() !== ''
        ? `
    <div class="note">${escapeHtml(note)}</div>
    `
        : ''
    }

    <div class="thanks">${escapeHtml(footerMessage)}</div>
    ${thermalContactHtml}
  </div>
</body>
</html>
`
}

export function renderThermalShopCopyHtml(
  payload: ThermalInvoiceTemplatePayload
): string {
  const paperWidth = resolvePaperWidth(payload.thermalPaperWidth)
  const customerName = payload.customerName || payload.customer_name || 'عميل'
  const customerPhone = payload.customerPhone || payload.customer_phone || '-'
  const invoiceNumber =
    payload.invoiceNumber ||
    payload.invoice_number ||
    payload.orderNumber ||
    payload.order_number ||
    '-'

  return `
<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Thermal Shop Copy</title>
  <style>
    @page {
      size: ${paperWidth} auto;
      margin: 0;
    }

    * {
      box-sizing: border-box;
    }

    html, body {
      margin: 0;
      padding: 0;
      background: #fff;
      color: #111;
      font-family: "Courier New", "Cascadia Mono", monospace;
      width: ${paperWidth};
    }

    body {
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }

    .receipt {
      width: ${paperWidth};
      padding: 8mm 5mm;
      margin: 0 auto;
      background: #ffffff;
    }

    .title {
      text-align: center;
      font-size: ${paperWidth === '58mm' ? '16px' : '18px'};
      font-weight: 700;
      margin-bottom: 12px;
    }

    .divider {
      border-top: 1px solid #000;
      margin: 12px 0;
    }

    .meta-grid {
      display: grid;
      gap: 10px;
    }

    .meta-block {
      display: grid;
      gap: 2px;
      text-align: right;
    }

    .label {
      font-size: 11px;
      color: #555;
    }

    .value {
      font-size: 13px;
      color: #111;
      font-weight: 700;
      word-break: break-word;
    }
  </style>
</head>
<body style="background: #ffffff; margin: 0;">
  <div class="receipt">
    <div class="title">نسخة المحل</div>
    <div class="divider"></div>

    <div class="meta-grid">
      <div class="meta-block">
        <div class="label">اسم العميل:</div>
        <div class="value">${escapeHtml(customerName)}</div>
      </div>
      <div class="meta-block">
        <div class="label">رقم العميل:</div>
        <div class="value">${escapeHtml(customerPhone)}</div>
      </div>
      <div class="meta-block">
        <div class="label">رقم الفاتورة:</div>
        <div class="value">${escapeHtml(invoiceNumber)}</div>
      </div>
    </div>
  </div>
</body>
</html>
`
}
