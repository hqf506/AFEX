export type Product = {
  id: string
  name: string
  type: 'product' | 'service'
  category: string
  price: number
}

export type InvoiceItem = {
  item_id: string | null
  item_name: string
  item_type: 'product' | 'service'
  quantity: number
  unit_price: number
}

export type InvoiceResult = {
  customer_id: string
  order_id: string
  order_number: string
  invoice_id: string
  invoice_number: string
  status: string
}

export const INVOICE_PRODUCTS: Product[] = [
  { id: '1', name: 'تنظيف فاخر', type: 'service', category: 'تنظيف', price: 120 },
  { id: '2', name: 'إصلاح شنطة جلد', type: 'service', category: 'إصلاح', price: 240 },
  { id: '3', name: 'بخاخ حماية جلد', type: 'product', category: 'عناية', price: 85 },
  { id: '4', name: 'صبغة جلد بني', type: 'product', category: 'ألوان', price: 65 },
]

export const INVOICE_FILTERS = [
  'الكل',
  'الخدمات',
  'المنتجات',
  'تنظيف',
  'إصلاح',
  'عناية',
]

export function filterInvoiceProducts(
  products: Product[],
  activeFilter: string,
  search: string
) {
  return products.filter((product) => {
    const matchesFilter =
      activeFilter === 'الكل' ||
      (activeFilter === 'الخدمات' && product.type === 'service') ||
      (activeFilter === 'المنتجات' && product.type === 'product') ||
      product.category === activeFilter

    const normalizedSearch = search.trim()
    const matchesSearch =
      normalizedSearch === '' ||
      product.name.includes(normalizedSearch) ||
      product.category.includes(normalizedSearch)

    return matchesFilter && matchesSearch
  })
}

export function calculateInvoiceSubtotal(invoiceItems: InvoiceItem[]) {
  return invoiceItems.reduce(
    (sum, item) => sum + item.quantity * item.unit_price,
    0
  )
}

export function getNumericCashReceived(value: string) {
  const numericValue = Number(value)
  return Number.isNaN(numericValue) ? 0 : numericValue
}

export function calculateRemainingFromCustomer(
  paymentMethod: 'cash' | 'card' | 'transfer',
  finalTotal: number,
  numericCashReceived: number
) {
  if (paymentMethod !== 'cash') return 0
  return Math.max(finalTotal - numericCashReceived, 0)
}

export function calculateCashChange(
  paymentMethod: 'cash' | 'card' | 'transfer',
  numericCashReceived: number,
  finalTotal: number
) {
  if (paymentMethod !== 'cash') return 0
  return Math.max(numericCashReceived - finalTotal, 0)
}

export function addInvoiceItem(
  invoiceItems: InvoiceItem[],
  product: Product
) {
  const existing = invoiceItems.find((item) => item.item_name === product.name)

  if (existing) {
    return invoiceItems.map((item) =>
      item.item_name === product.name
        ? { ...item, quantity: item.quantity + 1 }
        : item
    )
  }

  return [
    ...invoiceItems,
    {
      item_id: null,
      item_name: product.name,
      item_type: product.type,
      quantity: 1,
      unit_price: product.price,
    },
  ]
}

export function increaseInvoiceItemQuantity(
  invoiceItems: InvoiceItem[],
  itemName: string
) {
  return invoiceItems.map((item) =>
    item.item_name === itemName
      ? { ...item, quantity: item.quantity + 1 }
      : item
  )
}

export function decreaseInvoiceItemQuantity(
  invoiceItems: InvoiceItem[],
  itemName: string
) {
  return invoiceItems.map((item) =>
    item.item_name === itemName
      ? { ...item, quantity: Math.max(1, item.quantity - 1) }
      : item
  )
}

export function removeInvoiceItem(
  invoiceItems: InvoiceItem[],
  itemName: string
) {
  return invoiceItems.filter((item) => item.item_name !== itemName)
}

export function createInvoicePrintHtml(params: {
  invoiceItems: InvoiceItem[]
  invoiceNumber?: string
  orderNumber?: string
  customerName: string
  customerPhone: string
  paymentMethod: 'cash' | 'card' | 'transfer'
  numericCashReceived: number
  remainingFromCustomer: number
  cashChange: number
  subtotal: number
  discount: number
  tax: number
  finalTotal: number
  note: string
  now: Date
}) {
  const {
    invoiceItems,
    invoiceNumber,
    orderNumber,
    customerName,
    customerPhone,
    paymentMethod,
    numericCashReceived,
    remainingFromCustomer,
    cashChange,
    subtotal,
    discount,
    tax,
    finalTotal,
    note,
    now,
  } = params

  const itemsHtml = invoiceItems
    .map(
      (item) => `
          <tr>
            <td>${item.item_name}</td>
            <td>${item.quantity}</td>
            <td>${item.unit_price} ر.س</td>
            <td>${item.quantity * item.unit_price} ر.س</td>
          </tr>
        `
    )
    .join('')

  return `
      <html lang="ar" dir="rtl">
        <head>
          <title>فاتورة ${invoiceNumber || ''}</title>
          <style>
            body {
              font-family: Arial, sans-serif;
              padding: 24px;
              color: #111827;
            }
            .header {
              display: flex;
              justify-content: space-between;
              align-items: flex-start;
              margin-bottom: 24px;
            }
            .title {
              font-size: 28px;
              font-weight: bold;
            }
            .muted {
              color: #6b7280;
              font-size: 14px;
            }
            .box {
              border: 1px solid #e5e7eb;
              border-radius: 16px;
              padding: 16px;
              margin-bottom: 16px;
            }
            table {
              width: 100%;
              border-collapse: collapse;
              margin-top: 12px;
            }
            th, td {
              border-bottom: 1px solid #e5e7eb;
              padding: 12px;
              text-align: right;
            }
            th {
              background: #f8fafc;
            }
            .totals {
              margin-top: 20px;
            }
            .totals div {
              display: flex;
              justify-content: space-between;
              padding: 8px 0;
            }
            .final {
              font-size: 20px;
              font-weight: bold;
              border-top: 2px solid #111827;
              margin-top: 10px;
              padding-top: 10px;
            }
          </style>
        </head>
        <body>
          <div class="header">
            <div>
              <div class="title">Leather Fix ERP</div>
              <div class="muted">فاتورة عميل</div>
            </div>
            <div>
              <div><strong>رقم الفاتورة:</strong> ${invoiceNumber || '—'}</div>
              <div><strong>رقم الطلب:</strong> ${orderNumber || '—'}</div>
              <div><strong>التاريخ:</strong> ${now.toLocaleDateString('ar-SA')}</div>
              <div><strong>الوقت:</strong> ${now.toLocaleTimeString('ar-SA')}</div>
            </div>
          </div>

          <div class="box">
            <div><strong>اسم العميل:</strong> ${customerName}</div>
            <div><strong>رقم الجوال:</strong> ${customerPhone}</div>
            <div><strong>طريقة الدفع:</strong> ${
              paymentMethod === 'cash'
                ? 'كاش'
                : paymentMethod === 'card'
                ? 'شبكة'
                : 'تحويل'
            }</div>
            ${
              paymentMethod === 'cash'
                ? `
                  <div><strong>المبلغ المستلم:</strong> ${numericCashReceived} ر.س</div>
                  <div><strong>المتبقي من العميل:</strong> ${remainingFromCustomer} ر.س</div>
                  <div><strong>الباقي للعميل:</strong> ${cashChange} ر.س</div>
                `
                : ''
            }
          </div>

          <div class="box">
            <table>
              <thead>
                <tr>
                  <th>العنصر</th>
                  <th>الكمية</th>
                  <th>سعر الوحدة</th>
                  <th>الإجمالي</th>
                </tr>
              </thead>
              <tbody>
                ${itemsHtml}
              </tbody>
            </table>

            <div class="totals">
              <div><span>المجموع الفرعي</span><span>${subtotal} ر.س</span></div>
              <div><span>الخصم</span><span>${discount} ر.س</span></div>
              <div><span>الضريبة</span><span>${tax} ر.س</span></div>
              <div class="final"><span>الإجمالي النهائي</span><span>${finalTotal} ر.س</span></div>
            </div>
          </div>

          ${
            note.trim()
              ? `<div class="box"><strong>ملاحظة:</strong> ${note}</div>`
              : ''
          }

          <script>
            window.onload = function() {
              window.print();
            }
          </script>
        </body>
      </html>
    `
}
