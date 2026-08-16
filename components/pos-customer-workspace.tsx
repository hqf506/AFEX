'use client'

import Link from 'next/link'
import type { RefObject } from 'react'

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
  customerName: string
  customerPhone: string
  canLoadMore: boolean
  employeeName: string
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
  onContinue: () => void
}

function maskPhone(phone: string) {
  const digits = phone.replace(/\D/g, '')
  if (digits.length < 4) return '••••'
  return `••• ••• ${digits.slice(-4)}`
}

export function PosCustomerWorkspace({
  customers,
  loading,
  error,
  searchActive,
  selectedCustomerId,
  customerName,
  customerPhone,
  canLoadMore,
  employeeName,
  backHref,
  phoneInputRef,
  addButtonRef,
  onNameChange,
  onPhoneChange,
  onSelect,
  onChangeCustomer,
  onRemoveCustomer,
  onAddCustomer,
  onLoadMore,
  onContinue,
}: Props) {
  const selected = selectedCustomerId
    ? customers.find((customer) => customer.id === selectedCustomerId) || {
        id: selectedCustomerId,
        name: customerName,
        phone: customerPhone,
      }
    : null

  return (
    <main className="afex-customer-workspace" dir="rtl">
      <header className="afex-customer-header">
        <div>
          <p className="afex-customer-eyebrow">عملية بيع جديدة</p>
          <h1>اختيار العميل</h1>
          <p>ابحث بالاسم أو رقم الجوال، ثم اختر السجل الصحيح صراحةً.</p>
        </div>
        <div className="afex-customer-operator" aria-label={`الموظف الحالي ${employeeName}`}>
          <span>{employeeName.slice(0, 1)}</span>
          <div><b>{employeeName}</b><small>نقطة البيع</small></div>
        </div>
      </header>

      <div className="afex-customer-layout">
        <aside className="afex-customer-ticket" aria-label="ملخص العميل في الطلب">
          <div className="afex-customer-ticket-heading">
            <div><span>التذكرة الحالية</span><strong>العميل</strong></div>
            <span className={selected ? 'is-ready' : ''}>{selected ? 'محدد' : 'مطلوب'}</span>
          </div>
          {selected ? (
            <div className="afex-selected-customer">
              <div className="afex-customer-avatar" aria-hidden="true">{selected.name.slice(0, 1)}</div>
              <div className="afex-selected-customer-copy">
                <strong>{selected.name}</strong>
                <span dir="ltr">{maskPhone(selected.phone)}</span>
                <small>سيُربط الطلب بمعرّف العميل المحدد</small>
              </div>
              <span className="afex-selected-check" aria-label="تم الاختيار">✓</span>
            </div>
          ) : (
            <div className="afex-customer-ticket-empty">
              <span aria-hidden="true">◎</span>
              <strong>لم يتم اختيار عميل</strong>
              <p>اختر سجلًا من النتائج قبل المتابعة إلى السلة.</p>
            </div>
          )}
          <div className="afex-customer-ticket-actions">
            {selected ? <button type="button" onClick={onChangeCustomer}>تغيير العميل</button> : null}
            {selected ? <button type="button" className="is-danger" onClick={onRemoveCustomer}>إزالة</button> : null}
          </div>
          <div className="afex-customer-ticket-footer">
            <Link href={backHref}>العودة إلى نقطة البيع</Link>
            <button type="button" onClick={onContinue} disabled={!selected}>متابعة إلى السلة</button>
          </div>
        </aside>

        <section className="afex-customer-panel" aria-label="البحث عن العملاء">
          <div className="afex-customer-search-heading">
            <div><h2>{selected ? 'تغيير العميل' : 'اختر العميل'}</h2><p>النتائج تشمل عملاء المنشأة المسموح بهم دون إعادة تقييدهم بالفرع.</p></div>
            <button ref={addButtonRef} type="button" onClick={onAddCustomer}>+ إضافة عميل</button>
          </div>
          <div className="afex-customer-search-grid">
            <label>
              <span>رقم الجوال</span>
              <input ref={phoneInputRef} type="tel" value={customerPhone} onChange={(event) => onPhoneChange(event.target.value)} placeholder="05xxxxxxxx" inputMode="tel" autoComplete="tel" />
            </label>
            <label>
              <span>اسم العميل</span>
              <input type="search" value={customerName} onChange={(event) => onNameChange(event.target.value)} placeholder="ابحث بالاسم" autoComplete="off" />
            </label>
          </div>

          <div className="afex-customer-results-heading">
            <strong>{searchActive ? 'نتائج البحث' : 'العملاء الأخيرون'}</strong>
            <span>{loading ? 'جارٍ البحث…' : `${customers.length} سجل`}</span>
          </div>

          <div className="afex-customer-results" aria-live="polite" aria-busy={loading}>
            {loading ? Array.from({ length: 3 }, (_, index) => <div className="afex-customer-skeleton" key={index} />) : null}
            {!loading && error ? <div className="afex-customer-state is-error"><strong>تعذر تحميل العملاء</strong><p>{error}</p></div> : null}
            {!loading && !error && customers.length === 0 ? (
              <div className="afex-customer-state"><strong>{searchActive ? 'لا توجد نتائج مطابقة' : 'لا يوجد عملاء حديثون'}</strong><p>يمكنك تعديل البحث أو إنشاء عميل جديد بأمان.</p><button type="button" onClick={onAddCustomer}>إضافة عميل جديد</button></div>
            ) : null}
            {!loading && !error ? customers.map((customer) => {
              const isSelected = selectedCustomerId === customer.id
              return (
                <button key={customer.id} type="button" className={`afex-customer-result ${isSelected ? 'is-selected' : ''}`} onClick={() => onSelect(customer)} aria-pressed={isSelected}>
                  <span className="afex-customer-avatar" aria-hidden="true">{customer.name.slice(0, 1)}</span>
                  <span className="afex-customer-result-copy"><strong>{customer.name}</strong><span dir="ltr">{maskPhone(customer.phone)}</span><small>{customer.visitsCount ?? 0} زيارات</small></span>
                  <span className="afex-customer-result-action">{isSelected ? '✓ تم الاختيار' : 'اختيار'}</span>
                </button>
              )
            }) : null}
          </div>
          {canLoadMore ? <button type="button" className="afex-customer-load-more" onClick={onLoadMore}>عرض المزيد</button> : null}
        </section>
      </div>

      <div className="afex-customer-mobile-action">
        <button type="button" onClick={onContinue} disabled={!selected}>متابعة إلى السلة</button>
      </div>
    </main>
  )
}
