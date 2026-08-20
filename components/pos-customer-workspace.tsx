'use client'

import Link from 'next/link'
import type { RefObject, ReactNode } from 'react'
import type { SelectedCustomerProfile } from '@/lib/customers'

export type PosCustomerRecord = {
  id: string
  name: string
  phone: string
  lastPurchaseAmount?: number | null
  firstVisitAt?: string | null
  lastActivityAt?: string | null
  visitsCount?: number | null
  totalSpent?: number | null
}

type Props = {
  customers: PosCustomerRecord[]
  loading: boolean
  error: string
  searchActive: boolean
  selectedCustomerId: string | null
  selectedCustomerProfile: SelectedCustomerProfile | null
  profileLoading: boolean
  profileError: string
  customerName: string
  customerPhone: string
  canLoadMore: boolean
  backHref: string
  phoneInputRef: RefObject<HTMLInputElement | null>
  addButtonRef: RefObject<HTMLButtonElement | null>
  onNameChange: (value: string) => void
  onPhoneChange: (value: string) => void
  onSelect: (customer: PosCustomerRecord) => void
  onChangeCustomer: () => void
  onRemoveCustomer: () => void
  onAddCustomer: () => void
  onLoadMore: () => void
  onRetry: () => void
  onProfileRetry: () => void
  onContinue: () => void
}

const missingValue = 'غير مسجل'

function formatCurrency(value: number) {
  return new Intl.NumberFormat('ar-SA', {
    style: 'currency', currency: 'SAR', minimumFractionDigits: 2, maximumFractionDigits: 2,
  }).format(value)
}

function formatRiyadhDate(value: string | null) {
  if (!value) return missingValue
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return missingValue
  return new Intl.DateTimeFormat('ar-SA-u-ca-gregory', {
    timeZone: 'Asia/Riyadh', year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  }).format(date)
}

function DetailIcon({ children }: { children: ReactNode }) {
  return <span className="afex-customer-detail-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{children}</svg></span>
}

function DetailRow({ icon, label, value, ltr = false }: { icon: ReactNode; label: string; value: ReactNode; ltr?: boolean }) {
  const valueTitle = typeof value === 'string' || typeof value === 'number' ? String(value) : undefined
  return <div className="afex-customer-detail-row">{icon}<span>{label}</span><strong dir={ltr ? 'ltr' : undefined} title={valueTitle}>{value}</strong></div>
}

function CustomerProfile({ profile }: { profile: SelectedCustomerProfile }) {
  const noOrders = profile.visitCount === 0
  return (
    <div className="afex-customer-profile-scroll" data-customer-profile-scroll>
      <div className="afex-customer-detail-group">
        <DetailRow label="رقم الجوال" value={profile.phone} ltr icon={<DetailIcon><path d="M22 16.9v3a2 2 0 0 1-2.18 2 19.8 19.8 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.12 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.12.9.33 1.78.62 2.63a2 2 0 0 1-.45 2.11L8 9.73a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.85.29 1.73.5 2.63.62A2 2 0 0 1 22 16.9Z" /></DetailIcon>} />
        <DetailRow label="البريد الإلكتروني" value={profile.email || missingValue} ltr={Boolean(profile.email)} icon={<DetailIcon><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 7 9 6 9-6" /></DetailIcon>} />
        <DetailRow label="المدينة" value={profile.city || missingValue} icon={<DetailIcon><path d="M20 10c0 5-8 12-8 12S4 15 4 10a8 8 0 1 1 16 0Z" /><circle cx="12" cy="10" r="2.5" /></DetailIcon>} />
        <DetailRow label="العنوان" value={profile.address || missingValue} icon={<DetailIcon><path d="m3 11 9-8 9 8" /><path d="M5 10v10h14V10M9 20v-6h6v6" /></DetailIcon>} />
        <DetailRow label="ملاحظات" value={profile.notes || missingValue} icon={<DetailIcon><path d="M4 4h16v14H7l-3 3V4Z" /><path d="M8 9h8M8 13h5" /></DetailIcon>} />
      </div>
      <div className="afex-customer-detail-group" aria-label="بيانات السجل">
        <DetailRow label="رقم العميل" value={profile.customerNumber || missingValue} ltr={Boolean(profile.customerNumber)} icon={<DetailIcon><path d="M15 4h4a2 2 0 0 1 2 2v14H3V6a2 2 0 0 1 2-2h4" /><path d="M9 2h6v5H9zM8 12h8M8 16h5" /></DetailIcon>} />
        <DetailRow label="تاريخ التسجيل" value={formatRiyadhDate(profile.createdAt)} icon={<DetailIcon><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M16 3v4M8 3v4M3 10h18" /></DetailIcon>} />
      </div>
      {profile.visitCount !== null || profile.totalSpending !== null || noOrders || profile.lastOrderNumber || profile.lastOrderAt ? (
        <div className="afex-customer-detail-group" aria-label="نشاط العميل">
          {profile.visitCount !== null ? <DetailRow label="عدد الزيارات" value={`${profile.visitCount}`} icon={<DetailIcon><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" /></DetailIcon>} /> : null}
          {profile.totalSpending !== null ? <DetailRow label="إجمالي المشتريات" value={formatCurrency(profile.totalSpending)} icon={<DetailIcon><circle cx="12" cy="12" r="9" /><path d="M8 12h8M12 8v8" /></DetailIcon>} /> : null}
          {noOrders || profile.lastOrderNumber || profile.lastOrderAt ? <DetailRow label="آخر طلب" value={noOrders ? 'لا يوجد' : `${profile.lastOrderNumber || missingValue} · ${formatRiyadhDate(profile.lastOrderAt)}`} icon={<DetailIcon><path d="M6 2h12v20l-3-2-3 2-3-2-3 2V2Z" /><path d="M9 7h6M9 11h6" /></DetailIcon>} /> : null}
        </div>
      ) : null}
    </div>
  )
}

export function PosCustomerWorkspace({ customers, loading, error, searchActive, selectedCustomerId, selectedCustomerProfile, profileLoading, profileError, customerName, customerPhone, canLoadMore, backHref, phoneInputRef, addButtonRef, onNameChange, onPhoneChange, onSelect, onChangeCustomer, onRemoveCustomer, onAddCustomer, onLoadMore, onRetry, onProfileRetry, onContinue }: Props) {
  const selected = selectedCustomerId ? customers.find((customer) => customer.id === selectedCustomerId) || { id: selectedCustomerId, name: selectedCustomerProfile?.name || customerName, phone: selectedCustomerProfile?.phone || customerPhone } : null

  return (
    <main className="afex-customer-workspace" dir="rtl">
      <div className="afex-customer-layout">
        <aside className="afex-customer-ticket" aria-label="ملف العميل المحدد">
          <div className="afex-customer-ticket-heading"><div><span>العميل المحدد</span><strong>بيانات العميل</strong></div><span className={selected ? 'is-ready' : ''}>{selected ? 'محدد' : 'مطلوب'}</span></div>
          {selected ? (
            <div className="afex-customer-profile">
              <div className="afex-customer-profile-header"><div className="afex-customer-avatar" aria-hidden="true">{selected.name.slice(0, 1)}</div><div><strong>{selectedCustomerProfile?.name || selected.name}</strong><span dir="ltr">{selectedCustomerProfile?.customerNumber || missingValue}</span><small dir="ltr">{selectedCustomerProfile?.phone || selected.phone}</small></div><span className="afex-selected-check" aria-label="تم الاختيار">✓</span></div>
              {profileLoading ? <div className="afex-customer-profile-scroll" aria-label="جارٍ تحميل بيانات العميل" aria-busy="true">{Array.from({ length: 7 }, (_, index) => <div className="afex-customer-profile-skeleton" key={index} />)}</div> : null}
              {!profileLoading && profileError ? <div className="afex-customer-profile-error" role="alert"><strong>تعذر تحميل ملف العميل</strong><p>{profileError}</p><button type="button" onClick={onProfileRetry}>إعادة المحاولة</button></div> : null}
              {!profileLoading && !profileError && selectedCustomerProfile ? <CustomerProfile profile={selectedCustomerProfile} /> : null}
              <div className="afex-customer-ticket-actions"><button type="button" onClick={onChangeCustomer}>تغيير العميل</button><button type="button" className="is-danger" onClick={onRemoveCustomer}>إزالة العميل</button></div>
            </div>
          ) : <div className="afex-customer-ticket-empty"><span aria-hidden="true">◎</span><strong>لم يتم اختيار عميل</strong><p>اختر سجلًا من النتائج قبل المتابعة إلى السلة.</p><button type="button" onClick={onChangeCustomer}>اختيار العميل</button></div>}
          <div className="afex-customer-ticket-footer"><Link href={backHref}>العودة إلى نقطة البيع</Link><button type="button" onClick={onContinue} disabled={!selected}>متابعة إلى السلة</button></div>
        </aside>

        <section className="afex-customer-panel" aria-label="البحث عن العملاء">
          <div className="afex-customer-search-heading"><div><h2>{selected ? 'تغيير العميل' : 'اختر العميل'}</h2><p>النتائج تشمل عملاء المنشأة المسموح بهم دون إعادة تقييدهم بالفرع.</p></div><button ref={addButtonRef} type="button" onClick={onAddCustomer}>+ إضافة عميل</button></div>
          <div className="afex-customer-search-grid"><label><span>رقم الجوال</span><input ref={phoneInputRef} type="tel" value={customerPhone} onChange={(event) => onPhoneChange(event.target.value)} placeholder="05xxxxxxxx" inputMode="tel" autoComplete="tel" /></label><label><span>اسم العميل</span><input type="search" value={customerName} onChange={(event) => onNameChange(event.target.value)} placeholder="ابحث بالاسم" autoComplete="off" /></label></div>
          <div className="afex-customer-results-heading"><strong>{searchActive ? 'نتائج البحث' : 'العملاء الأخيرون'}</strong><span>{loading ? 'جارٍ البحث…' : `${customers.length} سجل`}</span></div>
          <div className="afex-customer-results" aria-live="polite" aria-busy={loading}>
            {loading ? Array.from({ length: 3 }, (_, index) => <div className="afex-customer-skeleton" key={index} />) : null}
            {!loading && error ? <div className="afex-customer-state is-error"><strong>تعذر تحميل العملاء</strong><p>{error}</p><button type="button" onClick={onRetry}>إعادة المحاولة</button></div> : null}
            {!loading && !error && customers.length === 0 ? <div className="afex-customer-state"><strong>{searchActive ? 'لا توجد نتائج مطابقة' : 'لا يوجد عملاء حديثون'}</strong><p>يمكنك تعديل البحث أو إنشاء عميل جديد بأمان.</p><button type="button" onClick={onAddCustomer}>إضافة عميل جديد</button></div> : null}
            {!loading && !error ? customers.map((customer) => { const isSelected = selectedCustomerId === customer.id; return <button key={customer.id} type="button" className={`afex-customer-result ${isSelected ? 'is-selected' : ''}`} onClick={() => onSelect(customer)} aria-pressed={isSelected}><span className="afex-customer-avatar" aria-hidden="true">{customer.name.slice(0, 1)}</span><span className="afex-customer-result-copy"><strong>{customer.name}</strong><span dir="ltr">{customer.phone}</span><small>{customer.visitsCount === null || customer.visitsCount === undefined ? 'سجل عميل' : `${customer.visitsCount} زيارات`}</small></span><span className="afex-customer-result-action">{isSelected ? '✓ تم الاختيار' : 'اختيار'}</span></button> }) : null}
          </div>
          {canLoadMore ? <button type="button" className="afex-customer-load-more" onClick={onLoadMore}>عرض المزيد</button> : null}
        </section>
      </div>
    </main>
  )
}
