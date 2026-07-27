import Link from 'next/link'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { AdminAlert, AdminEmptyState, AdminGlassSection } from '@/components/admin-ui'
import {
  isMissingCustomerIdentityColumnError,
  prepareCustomerIdentity,
} from '@/lib/customers'
import { isFullAdmin } from '@/lib/permissions'
import { createSupabaseServerClient } from '@/lib/supabase/server'

type CustomerRow = {
  id: string
  name: string | null
  email: string | null
  phone: string | null
  address: string | null
  city: string | null
  district: string | null
  postal_code: string | null
  country: string | null
  customer_code: string | null
  tax_number: string | null
  notes: string | null
  branch_id: string | null
  record_version: number | null
  firstVisitAt?: string | null
  lastActivityAt?: string | null
  visitsCount?: number
  totalSpent?: number
}

type CustomerStats = {
  firstVisit: string | null
  lastVisit: string | null
  visitsCount: number
  totalSpent: number
  points: number
}

type InvoiceStatsRow = {
  id: string | null
  order_id?: string | null
  invoice_number?: string | null
  customer_id: string | null
  created_at: string | null
  total: number | string | null
  payment_method?: string | null
  payment_status: string | null
  cash_received: number | string | null
  remaining_from_customer: number | string | null
}

type CustomerPurchaseRow = InvoiceStatsRow & {
  order_number: string | null
}

type OrderNumberRow = {
  id: string | null
  order_number: string | null
}

type AdminCustomersPageProps = {
  searchParams: Promise<{
    customerId?: string
    error?: string
    mode?: string
    saved?: string
    page?: string
    search?: string
  }>
}

const CUSTOMER_PAGE_SIZE = 25

const EMPTY_VALUE = '—'
const CUSTOMER_SELECT =
  'id, name, email, phone, address, city, district, postal_code, country, customer_code, tax_number, notes, branch_id'
const CUSTOMER_SELECT_WITH_VERSION = `${CUSTOMER_SELECT}, record_version`

function normalizeCustomerRow(row: Partial<CustomerRow> | null | undefined) {
  if (!row || typeof row.id !== 'string') return null

  return {
    id: row.id,
    name: row.name ?? null,
    email: row.email ?? null,
    phone: row.phone ?? null,
    address: row.address ?? null,
    city: row.city ?? null,
    district: row.district ?? null,
    postal_code: row.postal_code ?? null,
    country: row.country ?? null,
    customer_code: row.customer_code ?? null,
    tax_number: row.tax_number ?? null,
    notes: row.notes ?? null,
    branch_id: row.branch_id ?? null,
    record_version:
      typeof row.record_version === 'number' ? row.record_version : null,
  } satisfies CustomerRow
}

function normalizeCustomerRows(rows: unknown) {
  if (!Array.isArray(rows)) return []

  return rows
    .map((row) => normalizeCustomerRow(row as Partial<CustomerRow>))
    .filter((row): row is CustomerRow => Boolean(row))
}

function createEmptyCustomerStats(): CustomerStats {
  return {
    firstVisit: null,
    lastVisit: null,
    visitsCount: 0,
    totalSpent: 0,
    points: 0,
  }
}

function normalizeFormValue(value: FormDataEntryValue | null) {
  return typeof value === 'string' ? value.trim() || null : null
}

function readNumber(value: number | string | null | undefined) {
  const numericValue =
    typeof value === 'number'
      ? value
      : typeof value === 'string'
        ? Number(value)
        : 0

  return Number.isFinite(numericValue) ? numericValue : 0
}

function getInvoicePaidAmount(invoice: InvoiceStatsRow) {
  const paymentStatus = `${invoice.payment_status || ''}`.toLowerCase()

  if (paymentStatus === 'cancelled') {
    return 0
  }

  const total = Math.max(readNumber(invoice.total), 0)
  const remaining = Math.max(readNumber(invoice.remaining_from_customer), 0)

  if (remaining > 0) {
    return Math.min(total, Math.max(total - remaining, 0))
  }

  const cashReceived = Math.max(readNumber(invoice.cash_received), 0)

  if (cashReceived > 0) {
    return Math.min(total, cashReceived)
  }

  return paymentStatus === 'paid' ? total : 0
}

function getInvoiceRemainingAmount(invoice: InvoiceStatsRow) {
  const paymentStatus = `${invoice.payment_status || ''}`.toLowerCase()

  if (paymentStatus === 'cancelled') {
    return 0
  }

  return Math.max(readNumber(invoice.remaining_from_customer), 0)
}

function getPaymentStatusUi(value: string | null | undefined) {
  const status = `${value || ''}`.toLowerCase()

  if (status === 'paid') {
    return {
      label: 'مدفوع',
      className: 'border-emerald-300/25 bg-emerald-400/10 text-emerald-100',
    }
  }

  if (status === 'partial' || status === 'partially_paid') {
    return {
      label: 'جزئي',
      className: 'border-amber-300/25 bg-amber-400/10 text-amber-100',
    }
  }

  if (status === 'cancelled' || status === 'canceled') {
    return {
      label: 'ملغي',
      className: 'border-rose-300/25 bg-rose-500/10 text-rose-100',
    }
  }

  if (status === 'unpaid' || status === 'pending') {
    return {
      label: 'غير مدفوع',
      className: 'border-rose-300/25 bg-rose-500/10 text-rose-100',
    }
  }

  return {
    label: value || EMPTY_VALUE,
    className: 'border-slate-400/20 bg-slate-400/10 text-slate-300',
  }
}

function buildCustomerStatsMap(invoices: InvoiceStatsRow[]) {
  const statsByCustomerId = new Map<string, CustomerStats>()

  for (const invoice of invoices) {
    const customerId =
      typeof invoice.customer_id === 'string' ? invoice.customer_id : ''

    if (!customerId) {
      continue
    }

    const current =
      statsByCustomerId.get(customerId) || createEmptyCustomerStats()
    const createdAt =
      typeof invoice.created_at === 'string' ? invoice.created_at : null
    const createdTime = createdAt ? new Date(createdAt).getTime() : NaN
    const firstVisitTime = current.firstVisit
      ? new Date(current.firstVisit).getTime()
      : NaN
    const lastVisitTime = current.lastVisit
      ? new Date(current.lastVisit).getTime()
      : NaN

    if (
      createdAt &&
      !Number.isNaN(createdTime) &&
      (Number.isNaN(firstVisitTime) || createdTime < firstVisitTime)
    ) {
      current.firstVisit = createdAt
    }

    if (
      createdAt &&
      !Number.isNaN(createdTime) &&
      (Number.isNaN(lastVisitTime) || createdTime > lastVisitTime)
    ) {
      current.lastVisit = createdAt
    }

    current.visitsCount += 1
    current.totalSpent += getInvoicePaidAmount(invoice)
    statsByCustomerId.set(customerId, current)
  }

  return statsByCustomerId
}

function formatCurrency(value: number | null | undefined) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return EMPTY_VALUE
  }

  const amount = new Intl.NumberFormat('ar-SA', {
    maximumFractionDigits: 2,
  }).format(value)

  return `${amount} ريال`
}

function formatDate(value: string | null | undefined) {
  if (!value) return EMPTY_VALUE

  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return EMPTY_VALUE
  }

  return new Intl.DateTimeFormat('ar-SA', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(date)
}

async function getCurrentTenantContext() {
  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { supabase, tenantId: '', error: 'تعذر التحقق من جلسة المستخدم' }
  }

  const { data: profile, error } = await supabase
    .from('profiles')
    .select('tenant_id, role')
    .eq('id', user.id)
    .maybeSingle()

  const tenantId =
    typeof profile?.tenant_id === 'string' ? profile.tenant_id : ''
  const role = typeof profile?.role === 'string' ? profile.role : ''

  if (error) {
    return { supabase, tenantId: '', error: 'تعذر تحميل بيانات المنشأة' }
  }

  if (!isFullAdmin(role)) {
    return { supabase, tenantId: '', error: 'غير مصرح لك بالوصول' }
  }

  if (!tenantId) {
    return { supabase, tenantId: '', error: 'تعذر تحديد المنشأة' }
  }

  return { supabase, tenantId, error: '' }
}

async function updateCustomer(formData: FormData) {
  'use server'

  const customerId = normalizeFormValue(formData.get('customerId'))
  const { supabase, tenantId, error } = await getCurrentTenantContext()

  if (error || !tenantId || !customerId) {
    redirect(error === 'غير مصرح لك بالوصول' ? '/' : '/admin/customers?error=save')
  }

  const name = normalizeFormValue(formData.get('name'))
  const email = normalizeFormValue(formData.get('email'))
  const phone = normalizeFormValue(formData.get('phone'))
  const customerIdentity = prepareCustomerIdentity(phone)
  const expectedRecordVersionValue = normalizeFormValue(
    formData.get('recordVersion')
  )
  const expectedRecordVersion = expectedRecordVersionValue
    ? Number(expectedRecordVersionValue)
    : null
  const address = normalizeFormValue(formData.get('address'))
  const city = normalizeFormValue(formData.get('city'))
  const district = normalizeFormValue(formData.get('district'))
  const postal_code = normalizeFormValue(formData.get('postal_code'))
  const country = normalizeFormValue(formData.get('country'))
  const customer_code = normalizeFormValue(formData.get('customer_code'))
  const tax_number = normalizeFormValue(formData.get('tax_number'))
  const notes = normalizeFormValue(formData.get('notes'))

  if (!customerIdentity.ok) {
    redirect(`/admin/customers?customerId=${customerId}&error=save`)
  }

  const fullUpdatePayload = {
    name,
    email,
    phone: customerIdentity.identity.phone,
    address,
    city,
    district,
    postal_code,
    country,
    customer_code,
    tax_number,
    notes,
  }

  let updateQuery = supabase
    .from('customers')
    .update(fullUpdatePayload)
    .eq('id', customerId)
    .eq('tenant_id', tenantId)

  if (
    expectedRecordVersion !== null &&
    Number.isSafeInteger(expectedRecordVersion) &&
    expectedRecordVersion >= 1
  ) {
    updateQuery = updateQuery.eq('record_version', expectedRecordVersion)
  }

  const { data, error: updateError } = await updateQuery
    .select('id')
    .maybeSingle()

  if (!updateError && !data && expectedRecordVersion !== null) {
    redirect(`/admin/customers?customerId=${customerId}&error=conflict`)
  }

  if (updateError || !data) {
    redirect(`/admin/customers?customerId=${customerId}&error=save`)
  }

  redirect('/admin/customers?saved=1')
}

export default async function AdminCustomersPage({
  searchParams,
}: AdminCustomersPageProps) {
  const {
    customerId = '',
    error: saveError,
    mode = '',
    saved,
    page: rawPage,
    search: rawSearch = '',
  } = await searchParams
  const { supabase, tenantId, error } = await getCurrentTenantContext()

  if (error === 'غير مصرح لك بالوصول') {
    redirect('/')
  }

  let customers: CustomerRow[] = []
  let selectedCustomer: CustomerRow | null = null
  let selectedCustomerPurchases: CustomerPurchaseRow[] = []
  let customerStatsById = new Map<string, CustomerStats>()
  let errorMessage = error
  const requestedPage = Math.max(1, Math.floor(Number(rawPage) || 1))
  const search = rawSearch.trim().slice(0, 120)
  let currentPage = requestedPage
  let totalCustomers = 0

  if (tenantId) {
    const requestHeaders = await headers()
    const host = requestHeaders.get('x-forwarded-host') || requestHeaders.get('host')
    const protocol = requestHeaders.get('x-forwarded-proto') || 'http'
    const params = new URLSearchParams({
      page: String(requestedPage),
      pageSize: String(CUSTOMER_PAGE_SIZE),
      view: 'admin',
    })
    if (search) params.set('q', search)
    const customersResponse = host
      ? await fetch(`${protocol}://${host}/api/customers?${params}`, {
          headers: { cookie: requestHeaders.get('cookie') || '' },
          cache: 'no-store',
        })
      : null
    const customersResult = customersResponse
      ? await customersResponse.json().catch(() => null)
      : null

    if (!customersResponse?.ok || !customersResult?.success) {
      errorMessage = 'تعذر تحميل العملاء'
    } else {
      customers = normalizeCustomerRows(customersResult.customers).map((customer, index) => ({
        ...customer,
        ...(customersResult.customers[index] || {}),
      }))
      totalCustomers = Number(customersResult.total) || 0
      currentPage = Number(customersResult.page) || requestedPage
      customerStatsById = new Map(
        customers.map((customer) => [
          customer.id,
          {
            firstVisit: customer.firstVisitAt || null,
            lastVisit: customer.lastActivityAt || null,
            visitsCount: Number(customer.visitsCount) || 0,
            totalSpent: Number(customer.totalSpent) || 0,
            points: 0,
          },
        ])
      )
      }

    if (customerId) {
      const customerResult = await supabase
        .from('customers')
        .select(CUSTOMER_SELECT_WITH_VERSION)
        .eq('id', customerId)
        .eq('tenant_id', tenantId)
        .maybeSingle()
      let customerData = customerResult.data as Partial<CustomerRow> | null
      let customerError = customerResult.error

      if (
        isMissingCustomerIdentityColumnError(
          customerError,
          'record_version'
        )
      ) {
        const legacyCustomerResult = await supabase
          .from('customers')
          .select(CUSTOMER_SELECT)
          .eq('id', customerId)
          .eq('tenant_id', tenantId)
          .maybeSingle()

        customerData = legacyCustomerResult.data as Partial<CustomerRow> | null
        customerError = legacyCustomerResult.error
      }

      if (!customerError && customerData) {
        selectedCustomer = normalizeCustomerRow(customerData as Partial<CustomerRow>)

        if (selectedCustomer) {
          const { data: purchasesData, error: purchasesError } = await supabase
            .from('invoices')
            .select(
              'id, order_id, invoice_number, customer_id, created_at, total, payment_method, payment_status, cash_received, remaining_from_customer'
            )
            .eq('tenant_id', tenantId)
            .eq('customer_id', selectedCustomer.id)
            .order('created_at', { ascending: false })

          if (purchasesError) {
            errorMessage = errorMessage || 'تعذر تحميل مشتريات العميل'
          } else {
            const purchases = Array.isArray(purchasesData)
              ? (purchasesData as InvoiceStatsRow[])
              : []
            const orderIds = purchases
              .map((purchase) =>
                typeof purchase.order_id === 'string' ? purchase.order_id : ''
              )
              .filter(Boolean)

            let orderNumberById = new Map<string, string>()

            if (orderIds.length > 0) {
              const { data: ordersData } = await supabase
                .from('orders')
                .select('id, order_number')
                .eq('tenant_id', tenantId)
                .in('id', orderIds)

              orderNumberById = new Map(
                (Array.isArray(ordersData)
                  ? (ordersData as OrderNumberRow[])
                  : []
                )
                  .filter((order) => order.id && order.order_number)
                  .map((order) => [order.id as string, order.order_number as string])
              )
            }

            selectedCustomerPurchases = purchases.map((purchase) => ({
              ...purchase,
              order_number:
                typeof purchase.order_id === 'string'
                  ? orderNumberById.get(purchase.order_id) || null
                  : null,
            }))
            customerStatsById.set(
              selectedCustomer.id,
              buildCustomerStatsMap(purchases).get(selectedCustomer.id) ||
                createEmptyCustomerStats()
            )
          }
        }
      }
    }
  }

  const drawerOpen = Boolean(customerId && selectedCustomer)
  const drawerEditMode = drawerOpen && mode === 'edit'
  const drawerPurchasesMode = drawerOpen && mode === 'purchases'
  const selectedCustomerStats = selectedCustomer
    ? customerStatsById.get(selectedCustomer.id) || createEmptyCustomerStats()
    : createEmptyCustomerStats()

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#030714] text-white">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute right-[-12rem] top-[-10rem] h-[34rem] w-[34rem] rounded-full bg-cyan-400/16 blur-[130px]" />
        <div className="absolute left-[-16rem] top-[16rem] h-[36rem] w-[36rem] rounded-full bg-emerald-400/10 blur-[140px]" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(34,211,238,0.09),transparent_34%),linear-gradient(rgba(255,255,255,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.024)_1px,transparent_1px)] bg-[size:auto,72px_72px,72px_72px] opacity-80" />
      </div>

      <div className="relative z-10 mx-auto max-w-7xl space-y-5 px-3 py-4 sm:px-4 lg:px-6">
        <header className="overflow-hidden rounded-[28px] border border-cyan-300/15 bg-white/[0.055] p-5 text-right shadow-[0_24px_90px_rgba(0,0,0,0.32)] backdrop-blur-xl md:p-6">
          <div className="flex items-center gap-4">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-cyan-300/20 bg-cyan-300/10 text-cyan-200 shadow-[0_0_28px_rgba(34,211,238,0.14)]">
              <svg
                viewBox="0 0 24 24"
                className="h-7 w-7"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M16 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2" />
                <circle cx="9.5" cy="7" r="3.5" />
                <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
                <path d="M16 3.13a3.5 3.5 0 0 1 0 6.74" />
              </svg>
            </div>
            <div>
              <p className="text-xs font-black uppercase tracking-[0.24em] text-cyan-300/80">
                عملاء AFEX
              </p>
              <h1 className="mt-2 text-3xl font-black text-white">العملاء</h1>
              <p className="mt-2 max-w-2xl text-sm font-medium leading-6 text-slate-300">
                قائمة العملاء المسجلين داخل المنشأة
              </p>
            </div>
          </div>
        </header>

        {saved === '1' ? (
          <AdminAlert tone="success">تم حفظ بيانات العميل بنجاح</AdminAlert>
        ) : null}

        {saveError ? (
          <AdminAlert tone="error">تعذر حفظ بيانات العميل</AdminAlert>
        ) : null}

        {customerId && !selectedCustomer && !errorMessage ? (
          <AdminAlert tone="warning">
            لم يتم العثور على العميل أو لا يتبع هذه المنشأة
          </AdminAlert>
        ) : null}

        {errorMessage ? (
          <AdminAlert tone="error">{errorMessage}</AdminAlert>
        ) : null}

        <AdminGlassSection>
          <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div className="text-right">
              <p className="text-xs font-black uppercase tracking-[0.24em] text-cyan-300/80">
                قائمة العملاء
              </p>
              <h2 className="mt-2 text-2xl font-black text-white">
                العملاء الحاليون
              </h2>
              <p className="mt-1 text-sm text-slate-400">
                عرض العملاء المحفوظين في جدول العملاء الحقيقي
              </p>
            </div>

            <span className="inline-flex h-11 items-center justify-center rounded-2xl border border-cyan-300/20 bg-cyan-300/10 px-4 text-sm font-black text-cyan-100">
              {totalCustomers} عميل
            </span>
          </div>

          <form action="/admin/customers" method="get" className="mb-4 grid grid-cols-[minmax(0,1fr)_auto] gap-2 md:max-w-xl">
            <label className="min-w-0">
              <span className="sr-only">بحث في العملاء</span>
              <input
                type="search"
                name="search"
                defaultValue={search}
                placeholder="اسم العميل أو رقم الجوال"
                className="h-12 w-full min-w-0 rounded-2xl border border-cyan-300/15 bg-[#07111f] px-4 text-right text-sm font-bold text-white outline-none placeholder:text-slate-500 focus:border-cyan-300/50 focus:ring-2 focus:ring-cyan-300/15"
              />
            </label>
            <button type="submit" className="h-12 rounded-2xl bg-cyan-300 px-4 text-xs font-black text-slate-950">
              بحث
            </button>
          </form>

          {customers.length === 0 ? (
            <AdminEmptyState
              title="لا يوجد عملاء حتى الآن."
              description="سيظهر العملاء هنا بعد إنشاء طلبات مرتبطة ببيانات عميل."
            />
          ) : (
            <div className="overflow-x-auto rounded-2xl border border-white/10 bg-[#06111f]/65">
              <table data-responsive-table="customers" className="responsive-admin-table w-full min-w-[1120px] table-fixed text-right">
                <colgroup>
                  <col className="w-[20%]" />
                  <col className="w-[16%]" />
                  <col className="w-[13%]" />
                  <col className="w-[13%]" />
                  <col className="w-[12%]" />
                  <col className="w-[14%]" />
                  <col className="w-[12%]" />
                </colgroup>
                <thead className="bg-[#091424]">
                  <tr className="text-xs font-black uppercase tracking-[0.16em] text-slate-400">
                    <th className="px-3 py-4">العميل</th>
                    <th className="px-3 py-4">جهات الاتصال</th>
                    <th className="px-3 py-4">الزيارة الأولى</th>
                    <th className="px-3 py-4">الزيارة الأخيرة</th>
                    <th className="px-3 py-4">مجموع الزيارات</th>
                    <th className="px-3 py-4">إجمالي الصرف</th>
                    <th className="px-3 py-4">رصيد النقاط</th>
                  </tr>
                </thead>
                <tbody>
                  {customers.map((customer) => {
                    const stats =
                      customerStatsById.get(customer.id) ||
                      createEmptyCustomerStats()
                    const customerHref = `/admin/customers?customerId=${customer.id}`

                    return (
                      <tr
                        key={customer.id}
                        className="group cursor-pointer border-b border-white/[0.08] bg-slate-500/[0.045] transition duration-200 hover:bg-cyan-300/[0.055] hover:shadow-[inset_0_0_0_1px_rgba(34,211,238,0.10),0_0_26px_rgba(34,211,238,0.08)] last:border-b-0"
                      >
                        <td className="p-0 max-md:!block max-md:!border-0 max-md:before:!hidden">
                          <Link
                            href={customerHref}
                            className="hidden truncate px-3 py-4 text-sm font-black text-white transition group-hover:text-cyan-100 md:block"
                          >
                            {customer.name || 'بدون اسم'}
                          </Link>
                          <Link data-mobile-customer-card href={customerHref} className="block min-w-0 p-4 md:hidden">
                            <div className="flex min-w-0 items-start justify-between gap-3">
                              <div className="min-w-0">
                                <p className="truncate text-base font-black text-white">{customer.name || 'بدون اسم'}</p>
                                <p dir="ltr" className="mt-1 truncate text-right text-sm font-bold text-cyan-100">{customer.phone || EMPTY_VALUE}</p>
                              </div>
                              <span className="shrink-0 rounded-full border border-cyan-300/20 bg-cyan-300/10 px-3 py-1 text-[11px] font-black text-cyan-100">عرض</span>
                            </div>
                            <div className="mt-4 grid grid-cols-2 gap-2">
                              <span className="rounded-xl border border-white/[0.07] bg-black/20 p-3"><span className="block text-[10px] font-bold text-slate-500">عدد الطلبات</span><span className="mt-1 block text-sm font-black text-white">{stats.visitsCount}</span></span>
                              <span className="rounded-xl border border-white/[0.07] bg-black/20 p-3"><span className="block text-[10px] font-bold text-slate-500">إجمالي الإنفاق</span><span className="mt-1 block text-sm font-black text-emerald-200">{formatCurrency(stats.totalSpent)}</span></span>
                            </div>
                            <span className="mt-3 block text-[11px] font-bold text-slate-500">آخر نشاط: {formatDate(stats.lastVisit)}</span>
                          </Link>
                        </td>
                        <td className="p-0 max-md:!hidden">
                          <Link
                            href={customerHref}
                            className="block truncate px-3 py-4 text-sm font-bold text-slate-200 transition group-hover:text-cyan-50"
                          >
                            {customer.phone || EMPTY_VALUE}
                          </Link>
                        </td>
                        <td className="p-0 max-md:!hidden">
                          <Link
                            href={customerHref}
                            className="block px-3 py-4 text-sm font-bold text-slate-300 transition group-hover:text-slate-100"
                          >
                            {formatDate(stats.firstVisit)}
                          </Link>
                        </td>
                        <td className="p-0 max-md:!hidden">
                          <Link
                            href={customerHref}
                            className="block px-3 py-4 text-sm font-bold text-slate-300 transition group-hover:text-slate-100"
                          >
                            {formatDate(stats.lastVisit)}
                          </Link>
                        </td>
                        <td className="p-0 max-md:!hidden">
                          <Link
                            href={customerHref}
                            className="block px-3 py-4 text-sm font-black text-slate-200 transition group-hover:text-cyan-50"
                          >
                            {stats.visitsCount}
                          </Link>
                        </td>
                        <td className="p-0 max-md:!hidden">
                          <Link
                            href={customerHref}
                            className="block px-3 py-4 text-sm font-black text-slate-200 transition group-hover:text-cyan-50"
                          >
                            {formatCurrency(stats.totalSpent)}
                          </Link>
                        </td>
                        <td className="p-0 max-md:!hidden">
                          <Link
                            href={customerHref}
                            className="block px-3 py-4 text-sm font-black text-cyan-100 transition group-hover:text-cyan-50"
                          >
                            {stats.points}
                          </Link>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
          {totalCustomers > CUSTOMER_PAGE_SIZE ? (
            <div data-responsive-pagination className="mt-5 flex items-center justify-center gap-3" dir="rtl">
              <Link
                href={`/admin/customers?page=${Math.max(1, currentPage - 1)}${search ? `&search=${encodeURIComponent(search)}` : ''}`}
                aria-disabled={currentPage <= 1}
                className={`inline-flex h-10 items-center rounded-xl border border-cyan-300/15 px-4 text-xs font-black ${currentPage <= 1 ? 'pointer-events-none opacity-40' : 'bg-cyan-300/10 text-cyan-100 hover:bg-cyan-300/15'}`}
              >
                السابق
              </Link>
              <span className="text-xs font-black text-slate-300">
                صفحة {currentPage} من {Math.ceil(totalCustomers / CUSTOMER_PAGE_SIZE)}
              </span>
              <Link
                href={`/admin/customers?page=${Math.min(Math.ceil(totalCustomers / CUSTOMER_PAGE_SIZE), currentPage + 1)}${search ? `&search=${encodeURIComponent(search)}` : ''}`}
                aria-disabled={currentPage >= Math.ceil(totalCustomers / CUSTOMER_PAGE_SIZE)}
                className={`inline-flex h-10 items-center rounded-xl border border-cyan-300/15 px-4 text-xs font-black ${currentPage >= Math.ceil(totalCustomers / CUSTOMER_PAGE_SIZE) ? 'pointer-events-none opacity-40' : 'bg-cyan-300/10 text-cyan-100 hover:bg-cyan-300/15'}`}
              >
                التالي
              </Link>
            </div>
          ) : null}
        </AdminGlassSection>
      </div>

      {drawerOpen && selectedCustomer ? (
        <div className="fixed inset-0 z-[100] bg-slate-950/60 backdrop-blur-[2px]">
          <Link
            href="/admin/customers"
            className="absolute inset-0"
            aria-label="إغلاق"
          />
          <div className="absolute inset-y-0 right-0 flex min-h-0 w-full justify-end">
            <form data-admin-drawer data-mobile-customer-drawer
              action={updateCustomer}
              className="animate-[customers-drawer-in_420ms_cubic-bezier(0.16,1,0.3,1)] relative flex h-full min-h-0 w-full max-w-xl flex-col overflow-hidden border-l border-cyan-300/15 bg-[radial-gradient(circle_at_50%_8%,rgba(34,211,238,0.12),transparent_34%),linear-gradient(180deg,#07111d_0%,#050b16_100%)] text-right shadow-[0_24px_90px_rgba(0,0,0,0.45)]"
            >
              <input type="hidden" name="customerId" value={selectedCustomer.id} />
              {typeof selectedCustomer.record_version === 'number' ? (
                <input
                  type="hidden"
                  name="recordVersion"
                  value={selectedCustomer.record_version}
                />
              ) : null}

              <header className="shrink-0 px-4 pt-4 sm:px-6 sm:pt-6 lg:px-8 lg:pt-8">

              {drawerEditMode ? null : drawerPurchasesMode ? (
                <div className="mb-6 flex justify-start">
                  <Link
                    href={`/admin/customers?customerId=${selectedCustomer.id}`}
                    className="inline-flex h-10 items-center justify-center rounded-xl border border-cyan-300/20 bg-cyan-300/10 px-4 text-xs font-black text-cyan-100 transition hover:bg-cyan-300/15"
                  >
                    رجوع لبيانات العميل
                  </Link>
                </div>
              ) : (
                <div className="mb-6 flex items-center justify-between gap-2 rounded-2xl border border-white/10 bg-white/[0.035] p-2 text-xs font-black text-slate-300">
                  <Link
                    href="/admin/customers"
                    className="inline-flex h-9 items-center justify-center rounded-xl px-3 text-slate-400 transition hover:bg-cyan-300/10 hover:text-cyan-100"
                  >
                    قاعدة بيانات العملاء &gt;
                  </Link>
                  <Link
                    href={`/admin/customers?customerId=${selectedCustomer.id}&mode=edit`}
                    className="inline-flex h-9 items-center justify-center rounded-xl px-4 text-cyan-100 transition hover:bg-cyan-300/10 hover:shadow-[0_0_24px_rgba(34,211,238,0.12)]"
                  >
                    تعديل الملف الشخصي
                  </Link>

                  <details className="group relative">
                    <summary className="flex h-9 cursor-pointer list-none items-center justify-center rounded-xl px-4 text-slate-300 transition hover:bg-cyan-300/10 hover:text-cyan-100 hover:shadow-[0_0_24px_rgba(34,211,238,0.12)] [&::-webkit-details-marker]:hidden">
                      المزيد
                      <span className="mr-2 text-[10px] transition group-open:rotate-180">
                        ▼
                      </span>
                    </summary>
                    <div className="absolute left-0 top-11 z-20 w-52 overflow-hidden rounded-2xl border border-cyan-300/15 bg-[#07111f]/95 p-1 text-right shadow-[0_18px_45px_rgba(0,0,0,0.35),0_0_28px_rgba(34,211,238,0.08)] backdrop-blur-xl">
                      <Link
                        href={`/admin/customers?customerId=${selectedCustomer.id}&mode=purchases`}
                        className="block h-10 w-full rounded-xl px-3 py-3 text-right text-xs font-black text-slate-300 transition hover:bg-cyan-300/10 hover:text-cyan-100"
                      >
                        عرض لائحة المشتريات
                      </Link>
                      {['تعديل رصيد النقاط', 'حذف العميل'].map((item) => (
                        <button
                          key={item}
                          type="button"
                          className="block h-10 w-full rounded-xl px-3 text-right text-xs font-black text-slate-300 transition hover:bg-cyan-300/10 hover:text-cyan-100"
                        >
                          {item}
                        </button>
                      ))}
                    </div>
                  </details>
                </div>
              )}

              <div className="mb-8 flex items-start justify-between gap-4">
                <div className="pt-3">
                  <span className="inline-flex rounded-full border border-cyan-300/20 bg-cyan-300/10 px-3 py-1 text-xs font-black tracking-[0.18em] text-cyan-200">
                    {drawerEditMode
                      ? 'تعديل العميل'
                      : drawerPurchasesMode
                        ? 'مشتريات العميل'
                        : 'تفاصيل العميل'}
                  </span>
                  <h2 className="mt-4 text-3xl font-black text-white">
                    {drawerEditMode
                      ? 'تعديل بيانات العميل'
                      : drawerPurchasesMode
                        ? 'لائحة مشتريات العميل'
                        : 'بيانات العميل'}
                  </h2>
                  <p className="mt-2 text-sm font-medium leading-6 text-slate-400">
                    {drawerEditMode
                      ? 'تحديث بيانات العميل داخل النظام'
                      : drawerPurchasesMode
                        ? 'جميع الطلبات والفواتير المرتبطة بهذا العميل'
                      : 'عرض بيانات العميل داخل النظام'}
                  </p>
                </div>

                {drawerEditMode ? (
                  <Link
                    href={`/admin/customers?customerId=${selectedCustomer.id}`}
                    className="inline-flex h-12 min-w-12 shrink-0 items-center justify-center rounded-full border border-cyan-300/20 bg-cyan-300/10 px-3 text-sm font-black text-cyan-100 shadow-[0_16px_45px_rgba(0,0,0,0.28)] transition hover:bg-cyan-300/15"
                    aria-label="الرجوع إلى بيانات العميل"
                  >
                    رجوع
                  </Link>
                ) : (
                  <Link
                    href="/admin/customers"
                    className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/[0.045] text-2xl font-light text-slate-200 shadow-[0_16px_45px_rgba(0,0,0,0.28)] transition hover:bg-white/[0.07] hover:text-white"
                    aria-label="إغلاق"
                  >
                    ×
                  </Link>
                )}
              </div>
              </header>

              <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-4 sm:px-6 sm:pb-6 lg:px-8 lg:pb-8">
              {drawerPurchasesMode ? (
                <div className="space-y-3">
                  {selectedCustomerPurchases.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-cyan-300/20 bg-cyan-300/5 p-6 text-center text-sm font-black text-slate-300">
                      لا توجد مشتريات لهذا العميل
                    </div>
                  ) : (
                    selectedCustomerPurchases.map((purchase) => {
                      const invoiceNumber =
                        purchase.invoice_number || EMPTY_VALUE
                      const orderNumber = purchase.order_number || EMPTY_VALUE
                      const paidAmount = getInvoicePaidAmount(purchase)
                      const remainingAmount = getInvoiceRemainingAmount(purchase)
                      const paymentStatusUi = getPaymentStatusUi(
                        purchase.payment_status
                      )

                      return (
                        <div
                          key={purchase.id || `${invoiceNumber}-${purchase.created_at}`}
                          className="rounded-2xl border border-white/10 bg-white/[0.035] p-4 text-right shadow-[0_16px_45px_rgba(0,0,0,0.16)]"
                        >
                          <div className="flex items-start justify-between gap-4 border-b border-white/10 pb-3">
                            <div>
                              <p className="text-xs font-black text-slate-500">
                                رقم الفاتورة
                              </p>
                              <p className="mt-1 text-sm font-black text-white">
                                {invoiceNumber}
                              </p>
                            </div>
                            <div className="text-left">
                              <p className="text-xs font-black text-slate-500">
                                رقم الطلب
                              </p>
                              <p className="mt-1 text-sm font-black text-cyan-100">
                                {orderNumber}
                              </p>
                            </div>
                          </div>

                          <div className="mt-3 grid grid-cols-2 gap-3 text-xs sm:grid-cols-3">
                            {[
                              ['التاريخ', formatDate(purchase.created_at)],
                              ['الحالة', paymentStatusUi.label],
                              [
                                'طريقة الدفع',
                                purchase.payment_method || EMPTY_VALUE,
                              ],
                              ['الإجمالي', formatCurrency(readNumber(purchase.total))],
                              ['المدفوع', formatCurrency(paidAmount)],
                              ['المتبقي', formatCurrency(remainingAmount)],
                            ].map(([label, value]) => (
                              <div key={label} className="min-w-0">
                                <p className="font-black text-slate-500">
                                  {label}
                                </p>
                                {label === 'الحالة' ? (
                                  <span
                                    className={`mt-1 inline-flex rounded-full border px-2.5 py-1 font-black ${paymentStatusUi.className}`}
                                  >
                                    {value}
                                  </span>
                                ) : (
                                  <p className="mt-1 truncate font-black text-slate-200">
                                    {value}
                                  </p>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      )
                    })
                  )}
                </div>
              ) : drawerEditMode ? (
                <div className="space-y-6">
                  <div className="flex flex-col items-center border-b border-white/10 pb-6 text-center">
                    <div className="flex h-20 w-20 items-center justify-center rounded-full border border-cyan-300/20 bg-cyan-300/10 text-3xl font-black text-cyan-100 shadow-[0_0_34px_rgba(34,211,238,0.16)]">
                      {(selectedCustomer.name || selectedCustomer.phone || '?').slice(0, 1)}
                    </div>
                  </div>

                  <div className="space-y-4">
                    {[
                      {
                        label: 'الاسم',
                        name: 'name',
                        value: selectedCustomer.name || '',
                      },
                      {
                        label: 'البريد الإلكتروني',
                        name: 'email',
                        value: selectedCustomer.email || '',
                      },
                      {
                        label: 'الهاتف',
                        name: 'phone',
                        value: selectedCustomer.phone || '',
                      },
                      {
                        label: 'العنوان',
                        name: 'address',
                        value: selectedCustomer.address || '',
                      },
                    ].map((field) => (
                      <label key={field.label} className="block">
                        <span className="mb-2 block text-xs font-black text-slate-300">
                          {field.label}
                        </span>
                        <div className="relative">
                          <span className="pointer-events-none absolute right-4 top-1/2 h-2 w-2 -translate-y-1/2 rounded-full bg-cyan-300/55 shadow-[0_0_14px_rgba(34,211,238,0.28)]" />
                          <input
                            name={field.name}
                            defaultValue={field.value}
                            placeholder={field.label}
                            className="h-14 w-full rounded-[18px] border border-[#263447] bg-[#0b1422]/90 py-3 pl-4 pr-10 text-right text-sm font-bold text-slate-100 outline-none transition placeholder:text-slate-500 hover:border-cyan-300/25 hover:bg-[#0d1828] focus:border-cyan-300/50 focus:bg-[#0d1828] focus:ring-2 focus:ring-cyan-300/10"
                          />
                        </div>
                      </label>
                    ))}

                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      {[
                        ['المدينة', 'city', selectedCustomer.city || ''],
                        ['المقاطعة', 'district', selectedCustomer.district || ''],
                        [
                          'الرمز البريدي',
                          'postal_code',
                          selectedCustomer.postal_code || '',
                        ],
                        ['الدولة', 'country', selectedCustomer.country || ''],
                      ].map(([label, name, value]) => (
                        <label key={label} className="block">
                          <span className="mb-2 block text-xs font-black text-slate-300">
                            {label}
                          </span>
                          <div className="relative">
                            <span className="pointer-events-none absolute right-4 top-1/2 h-2 w-2 -translate-y-1/2 rounded-full bg-cyan-300/35" />
                            <input
                              name={name}
                              defaultValue={value}
                              placeholder={label}
                              className="h-14 w-full rounded-[18px] border border-[#263447] bg-[#0b1422]/90 py-3 pl-4 pr-10 text-right text-sm font-bold text-slate-100 outline-none transition placeholder:text-slate-500 hover:border-cyan-300/25 hover:bg-[#0d1828] focus:border-cyan-300/50 focus:bg-[#0d1828] focus:ring-2 focus:ring-cyan-300/10"
                            />
                          </div>
                        </label>
                      ))}
                    </div>

                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      {[
                        [
                          'رمز العميل',
                          'customer_code',
                          selectedCustomer.customer_code || '',
                        ],
                        [
                          'الرقم الضريبي',
                          'tax_number',
                          selectedCustomer.tax_number || '',
                        ],
                      ].map(([label, name, value]) => (
                        <label key={label} className="block">
                          <span className="mb-2 block text-xs font-black text-slate-300">
                            {label}
                          </span>
                          <div className="relative">
                            <span className="pointer-events-none absolute right-4 top-1/2 h-2 w-2 -translate-y-1/2 rounded-full bg-cyan-300/35" />
                            <input
                              name={name}
                              defaultValue={value}
                              placeholder={label}
                              className="h-14 w-full rounded-[18px] border border-[#263447] bg-[#0b1422]/90 py-3 pl-4 pr-10 text-right text-sm font-bold text-slate-100 outline-none transition placeholder:text-slate-500 hover:border-cyan-300/25 hover:bg-[#0d1828] focus:border-cyan-300/50 focus:bg-[#0d1828] focus:ring-2 focus:ring-cyan-300/10"
                            />
                          </div>
                        </label>
                      ))}
                    </div>

                    <label className="block">
                      <span className="mb-2 block text-xs font-black text-slate-300">
                        ملاحظة
                      </span>
                      <textarea
                        name="notes"
                        defaultValue={selectedCustomer.notes || ''}
                        placeholder="ملاحظة"
                        rows={4}
                        className="w-full resize-none rounded-[18px] border border-[#263447] bg-[#0b1422]/90 px-4 py-3 text-right text-sm font-bold text-slate-100 outline-none transition placeholder:text-slate-500 hover:border-cyan-300/25 hover:bg-[#0d1828] focus:border-cyan-300/50 focus:bg-[#0d1828] focus:ring-2 focus:ring-cyan-300/10"
                      />
                    </label>

                  </div>
                </div>
              ) : (
                <div>
                  <div className="flex flex-col items-center border-b border-white/10 pb-7 text-center">
                    <div className="flex h-20 w-20 items-center justify-center rounded-full border border-cyan-300/20 bg-cyan-300/10 text-3xl font-black text-cyan-100 shadow-[0_0_34px_rgba(34,211,238,0.16)]">
                      {(selectedCustomer.name || selectedCustomer.phone || '?').slice(0, 1)}
                    </div>
                    <h3 className="mt-5 text-2xl font-black text-white">
                      {selectedCustomer.name || 'بدون اسم'}
                    </h3>
                    <div className="mt-5 space-y-3 text-sm font-bold text-slate-300">
                      <p className="flex min-h-6 items-center justify-center gap-3">
                        <svg
                          viewBox="0 0 24 24"
                          className="h-4 w-4 shrink-0 text-slate-400"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.8"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          aria-hidden="true"
                        >
                          <path d="m22 7-8.991 5.727a2 2 0 0 1-2.009 0L2 7" />
                          <rect x="2" y="4" width="20" height="16" rx="2" />
                        </svg>
                        <span className="min-w-0 truncate">
                          {selectedCustomer.email || EMPTY_VALUE}
                        </span>
                      </p>
                      <p className="flex min-h-6 items-center justify-center gap-3">
                        <svg
                          viewBox="0 0 24 24"
                          className="h-4 w-4 shrink-0 text-slate-400"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.8"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          aria-hidden="true"
                        >
                          <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.79 19.79 0 0 1 2.11 4.2 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
                        </svg>
                        <span className="min-w-0 truncate">
                          {selectedCustomer.phone || EMPTY_VALUE}
                        </span>
                      </p>
                    </div>
                  </div>

                  <div>
                    <div className="grid grid-cols-2 border-b border-white/10">
                      {[
                        [
                          'الزيارة الأولى',
                          formatDate(selectedCustomerStats.firstVisit),
                          'M8 7V3m8 4V3M5 11h14M5 5h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z',
                        ],
                        [
                          'الزيارة الأخيرة',
                          formatDate(selectedCustomerStats.lastVisit),
                          'M9 11l3 3L22 4M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h11',
                        ],
                      ].map(([label, value, path]) => (
                        <div
                          key={label}
                          className="flex items-center justify-center gap-3 border-l border-white/10 px-4 py-5 last:border-l-0"
                        >
                          <svg
                            viewBox="0 0 24 24"
                            className="h-5 w-5 shrink-0 text-slate-400"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.8"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            aria-hidden="true"
                          >
                            <path d={path} />
                          </svg>
                          <div className="text-right">
                            <p className="text-sm font-black leading-6 text-slate-100">
                              {value}
                            </p>
                            <p className="mt-1 text-xs font-bold text-slate-400">
                              {label}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>

                    <div>
                      {[
                        [
                          'إجمالي الصرف',
                          formatCurrency(selectedCustomerStats.totalSpent),
                          'M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7H14a3.5 3.5 0 0 1 0 7H6',
                        ],
                        [
                          'مجموع الزيارات',
                          String(selectedCustomerStats.visitsCount),
                          'M6 2l1.5 4H21l-3.5 10h-11L3 6h4.5M9 22a1 1 0 1 0 0-2 1 1 0 0 0 0 2Zm8 0a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z',
                        ],
                        [
                          'النقاط',
                          String(selectedCustomerStats.points),
                          'M12 2l2.9 6.1 6.7.9-4.9 4.7 1.2 6.6L12 17.9 6.1 21.3l1.2-6.6L2.4 9l6.7-.9L12 2Z',
                        ],
                      ].map(([label, value, path]) => (
                        <div
                          key={label}
                          className="flex min-h-[78px] items-center gap-4 border-b border-white/10 py-4 last:border-b-0"
                        >
                          <svg
                            viewBox="0 0 24 24"
                            className="h-5 w-5 shrink-0 text-slate-400"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.8"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            aria-hidden="true"
                          >
                            <path d={path} />
                          </svg>
                          <div className="text-right">
                            <p className="text-base font-black leading-6 text-slate-100">
                              {value}
                            </p>
                            <p className="mt-1 text-xs font-bold text-slate-400">
                              {label}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
              </div>

              {drawerEditMode ? (
                <footer dir="ltr" className="grid shrink-0 grid-cols-2 gap-2 border-t border-white/10 bg-[#050b16]/95 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur-xl sm:flex sm:justify-start sm:px-6 lg:px-8">
                  <button type="submit" className="inline-flex h-12 items-center justify-center rounded-2xl bg-gradient-to-l from-cyan-300 to-emerald-300 px-6 text-sm font-black text-slate-950 shadow-[0_0_35px_rgba(34,211,238,0.22)] transition hover:scale-[1.01]">حفظ</button>
                  <Link href={`/admin/customers?customerId=${selectedCustomer.id}`} className="inline-flex h-12 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.045] px-6 text-sm font-black text-slate-200 transition hover:bg-white/[0.07]">إلغاء</Link>
                </footer>
              ) : null}

            </form>
          </div>
        </div>
      ) : null}

      <style>{`
        @keyframes customers-drawer-in {
          from {
            opacity: 0;
            transform: translate3d(100%, 0, 0);
          }

          to {
            opacity: 1;
            transform: translate3d(0, 0, 0);
          }
        }
      `}</style>
    </div>
  )
}
