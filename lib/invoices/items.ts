import type { DigitalInvoiceTemplateSettings } from '@/lib/admin/settings'
import { renderInvoiceHtmlFromPayload } from '@/lib/invoices/receipt-template'
export { getPaymentMethodLabel } from '@/lib/invoices/payment-method'

export type InvoiceCatalogItem = {
  id: string
  name: string
  type: 'product' | 'service'
  category: string
  price: number
  image_url: string | null
}

export type InvoiceLineItem = {
  item_id: string | null
  item_name: string
  item_type: 'product' | 'service'
  quantity: number
  unit_price: number
}

export type CreatedInvoiceRecord = {
  customer_id: string
  order_id: string
  order_number: string
  invoice_id: string
  invoice_number: string
  status: string
}

export const INVOICE_ALL_FILTER = 'الكل'
const INVOICE_UNCATEGORIZED_FILTER = 'دون فئة'

function isVisibleInvoiceCategory(categoryName: string) {
  const normalizedCategoryName = categoryName.trim()
  return (
    normalizedCategoryName !== '' &&
    normalizedCategoryName !== INVOICE_UNCATEGORIZED_FILTER
  )
}

export function buildInvoiceFilters(
  categoryNames: string[],
  products: InvoiceCatalogItem[]
) {
  const filters = new Set<string>([INVOICE_ALL_FILTER])

  for (const categoryName of categoryNames) {
    const normalizedCategoryName = categoryName.trim()
    if (isVisibleInvoiceCategory(normalizedCategoryName)) {
      filters.add(normalizedCategoryName)
    }
  }

  for (const product of products) {
    const normalizedCategoryName = product.category.trim()
    if (isVisibleInvoiceCategory(normalizedCategoryName)) {
      filters.add(normalizedCategoryName)
    }
  }

  return Array.from(filters)
}

export const INVOICE_PRODUCTS: InvoiceCatalogItem[] = [
  { id: '1', name: 'تنظيف فاخر', type: 'service', category: 'تنظيف', price: 120, image_url: null },
  { id: '2', name: 'إصلاح شنطة جلد', type: 'service', category: 'إصلاح', price: 240, image_url: null },
  { id: '3', name: 'بخاخ حماية جلد', type: 'product', category: 'عناية', price: 85, image_url: null },
  { id: '4', name: 'صبغة جلد بني', type: 'product', category: 'ألوان', price: 65, image_url: null },
]

export const INVOICE_FILTERS = [
  'الكل',
  'الخدمات',
  'المنتجات',
  'تنظيف',
  'إصلاح',
  'عناية',
]

export function resolveInvoiceCatalogImageUrl(
  imageUrl: string | null | undefined
) {
  const normalizedValue = imageUrl?.trim()

  if (
    !normalizedValue ||
    normalizedValue === 'null' ||
    normalizedValue === 'undefined'
  ) {
    return null
  }

  if (
    normalizedValue.startsWith('http://') ||
    normalizedValue.startsWith('https://') ||
    normalizedValue.startsWith('data:') ||
    normalizedValue.startsWith('blob:') ||
    normalizedValue.startsWith('/')
  ) {
    return normalizedValue
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
  const normalizedPath = normalizedValue
    .replace(/^catalog-images\//, '')
    .replace(/^\/+/, '')

  if (!supabaseUrl) {
    return normalizedValue
  }

  return `${supabaseUrl}/storage/v1/object/public/catalog-images/${normalizedPath}`
}

export function filterInvoiceProducts(
  products: InvoiceCatalogItem[],
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

export function calculateInvoiceSubtotal(invoiceItems: InvoiceLineItem[]) {
  return invoiceItems.reduce(
    (sum, item) => sum + item.quantity * item.unit_price,
    0
  )
}

export function parseCashReceivedAmount(value: string) {
  const numericValue = Number(value)
  return Number.isNaN(numericValue) ? 0 : numericValue
}

export function calculateRemainingFromCustomer(
  paymentMethod: 'mada' | 'cash' | 'visa' | 'cod',
  finalTotal: number,
  numericCashReceived: number
) {
  if (paymentMethod !== 'cash' && paymentMethod !== 'cod') return 0
  return Math.max(finalTotal - numericCashReceived, 0)
}

export function calculateCashChange(
  paymentMethod: 'mada' | 'cash' | 'visa' | 'cod',
  numericCashReceived: number,
  finalTotal: number
) {
  if (paymentMethod !== 'cash') return 0
  return Math.max(numericCashReceived - finalTotal, 0)
}

export function addInvoiceLineItem(
  invoiceItems: InvoiceLineItem[],
  product: InvoiceCatalogItem
) {
  const normalizedItemId =
    typeof product.id === 'string' && product.id.trim() ? product.id.trim() : null
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
      item_id: normalizedItemId,
      item_name: product.name,
      item_type: product.type,
      quantity: 1,
      unit_price: product.price,
    },
  ]
}

export function increaseInvoiceLineItemQuantity(
  invoiceItems: InvoiceLineItem[],
  itemName: string
) {
  return invoiceItems.map((item) =>
    item.item_name === itemName
      ? { ...item, quantity: item.quantity + 1 }
      : item
  )
}

export function decreaseInvoiceLineItemQuantity(
  invoiceItems: InvoiceLineItem[],
  itemName: string
) {
  return invoiceItems.map((item) =>
    item.item_name === itemName
      ? { ...item, quantity: Math.max(1, item.quantity - 1) }
      : item
  )
}

export function removeInvoiceLineItem(
  invoiceItems: InvoiceLineItem[],
  itemName: string
) {
  return invoiceItems.filter((item) => item.item_name !== itemName)
}

export function createInvoicePrintHtml(params: {
  invoiceItems: InvoiceLineItem[]
  invoiceNumber?: string
  orderNumber?: string
  customerName: string
  customerPhone: string
  paymentMethod:
    | 'mada'
    | 'cash'
    | 'cod'
    | 'visa'
  paymentMethodLabel?: string
  cashReceived?: number
  numericCashReceived: number
  remainingFromCustomer: number
  cashChange: number
  subtotal: number
  discount: number
  tax: number
  finalTotal: number
  note: string
  now: Date
  digitalInvoiceSettings?: DigitalInvoiceTemplateSettings
}) {
  const {
    invoiceItems,
    invoiceNumber,
    orderNumber,
    customerName,
    customerPhone,
    paymentMethod,
    cashReceived,
    numericCashReceived,
    remainingFromCustomer,
    cashChange,
    subtotal,
    discount,
    tax,
    finalTotal,
    note,
    now,
    digitalInvoiceSettings,
  } = params

  return renderInvoiceHtmlFromPayload({
    brandName: digitalInvoiceSettings?.brandName,
    brandBackgroundColor: digitalInvoiceSettings?.brandBackgroundColor,
    brandTextColor: digitalInvoiceSettings?.brandTextColor,
    invoiceItems,
    invoiceNumber,
    orderNumber,
    customerName,
    customerPhone,
    addressLine1: digitalInvoiceSettings?.addressLine1,
    addressLine2: digitalInvoiceSettings?.addressLine2,
    whatsappNumber: digitalInvoiceSettings?.whatsappNumber,
    whatsappEnabled: digitalInvoiceSettings?.whatsappEnabled,
    googleReviewLink: digitalInvoiceSettings?.googleReviewLink,
    googleReviewEnabled: digitalInvoiceSettings?.googleReviewEnabled,
    mapLink: digitalInvoiceSettings?.mapLink,
    mapEnabled: digitalInvoiceSettings?.mapEnabled,
    instagramEnabled: digitalInvoiceSettings?.instagramEnabled,
    instagramLink: digitalInvoiceSettings?.instagramLink,
    tiktokEnabled: digitalInvoiceSettings?.tiktokEnabled,
    tiktokLink: digitalInvoiceSettings?.tiktokLink,
    paymentMethod,
    cashReceived: cashReceived ?? numericCashReceived,
    remainingFromCustomer,
    cashChange,
    branchName: digitalInvoiceSettings?.branchName,
    subtotal,
    discountAmount: discount,
    taxAmount: tax,
    finalTotal,
    note: note ?? digitalInvoiceSettings?.note,
    issuedAt: now.toISOString(),
  })
}
