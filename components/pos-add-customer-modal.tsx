'use client'

import { useEffect, useRef, useState } from 'react'
import { clearClientResourcesByPrefix } from '@/lib/client-resource-cache'
import { validateSaudiCustomerPhone } from '@/lib/customers'

export type CreatedPosCustomer = {
  id: string
  name: string
  phone: string
  lastPurchaseAmount?: number | null
  firstVisitAt?: string | null
  lastActivityAt?: string | null
  visitsCount?: number | null
  totalSpent?: number | null
}

type PosAddCustomerModalProps = {
  branchId: string | null
  initialName?: string
  initialPhone?: string
  onClose: () => void
  onCreated: (customer: CreatedPosCustomer) => void
}

export function PosAddCustomerModal({
  branchId,
  initialName = '',
  initialPhone = '',
  onClose,
  onCreated,
}: PosAddCustomerModalProps) {
  const initialNameParts = initialName.trim().split(/\s+/)
  const [firstName, setFirstName] = useState(initialNameParts[0] || '')
  const [lastName, setLastName] = useState(initialNameParts.slice(1).join(' '))
  const [phone, setPhone] = useState(initialPhone.trim())
  const [email, setEmail] = useState('')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [phoneError, setPhoneError] = useState('')
  const firstNameInputRef = useRef<HTMLInputElement | null>(null)
  const phoneValidation = validateSaudiCustomerPhone(phone)
  const displayedPhoneError =
    phoneError || (phoneValidation.valid ? '' : phoneValidation.message)

  useEffect(() => {
    const focusTimeoutId = window.setTimeout(() => {
      firstNameInputRef.current?.focus({ preventScroll: true })
    }, 0)

    return () => window.clearTimeout(focusTimeoutId)
  }, [])

  useEffect(() => {
    const previousOverflow = document.body.style.overflow
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !saving) {
        onClose()
      }
    }

    document.body.style.overflow = 'hidden'
    document.addEventListener('keydown', closeOnEscape)

    return () => {
      document.body.style.overflow = previousOverflow
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [onClose, saving])

  const closeModal = () => {
    if (!saving) onClose()
  }

  const handleCreateCustomer = async () => {
    if (saving) return

    const normalizedFirstName = firstName.trim()
    const normalizedLastName = lastName.trim()
    const name = `${normalizedFirstName} ${normalizedLastName}`.trim()
    const normalizedPhone = phone.trim()

    if (!normalizedFirstName) {
      setError('اسم العميل مطلوب.')
      return
    }

    if (!normalizedLastName) {
      setError('الاسم الأخير مطلوب')
      return
    }

    const validation = validateSaudiCustomerPhone(normalizedPhone)
    if (!validation.valid) {
      setPhoneError(validation.message)
      return
    }

    setSaving(true)
    setError('')
    setPhoneError('')

    try {
      const response = await fetch('/api/customers', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          phone: normalizedPhone,
          email: email.trim() || null,
          notes: notes.trim() || null,
          branchId,
        }),
      })
      const result = await response.json().catch(() => null)

      if (!response.ok || !result?.success || !result.customer) {
        if (
          typeof result?.code === 'string' &&
          result.code.startsWith('CUSTOMER_PHONE_') &&
          typeof result?.error === 'string'
        ) {
          setPhoneError(result.error)
          return
        }

        throw new Error('safe-customer-save-failure')
      }

      clearClientResourcesByPrefix('recent-customers:')
      clearClientResourcesByPrefix('customer-search:')
      onCreated(result.customer as CreatedPosCustomer)
    } catch {
      setError('تعذر حفظ بيانات العميل. لم يتم إنشاء الطلب بعد.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center overflow-y-auto bg-[#020817]/75 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))] backdrop-blur-xl [direction:rtl]"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) closeModal()
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-customer-title"
        className="pos-customer-sheet-enter flex max-h-[calc(100dvh-2rem)] w-full max-w-[450px] flex-col overflow-hidden rounded-[30px] bg-[rgba(2,8,23,0.94)] text-right shadow-[0_0_42px_rgba(34,211,238,0.16),0_28px_90px_rgba(0,0,0,0.42),inset_0_0_0_1px_rgba(34,211,238,0.20)]"
      >
        <div className="flex shrink-0 items-start justify-between gap-4 border-b border-cyan-300/10 p-4 sm:border-b-0 sm:pb-0 xl:px-5 xl:pt-5">
          <h3 id="add-customer-title" className="text-[26px] font-black text-white">
            إضافة عميل جديد
          </h3>
          <button
            type="button"
            onClick={closeModal}
            disabled={saving}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[16px] bg-[rgba(6,20,38,0.70)] text-xl font-black text-slate-300 shadow-[inset_0_0_0_1px_rgba(34,211,238,0.10)] transition hover:bg-red-400/10 hover:text-red-100 disabled:cursor-not-allowed disabled:opacity-50"
            aria-label="إغلاق"
          >
            ×
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:mt-5 sm:overflow-visible sm:pb-0 xl:px-5">
          <div className="grid gap-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="mb-2 block text-[13px] font-black text-slate-300">الاسم الأول</span>
                <input ref={firstNameInputRef} type="text" value={firstName} onChange={(event) => setFirstName(event.target.value)} disabled={saving} placeholder="اكتب الاسم الأول" className="h-[56px] w-full rounded-[20px] border-0 bg-[rgba(6,20,38,0.78)] px-4 text-right text-base font-bold text-white shadow-[inset_0_0_0_1px_rgba(34,211,238,0.16)] outline-none transition placeholder:text-slate-600 focus:shadow-[0_0_24px_rgba(34,211,238,0.12),inset_0_0_0_1px_rgba(34,211,238,0.34)] disabled:opacity-60" />
              </label>
              <label className="block">
                <span className="mb-2 block text-[13px] font-black text-slate-300">الاسم الأخير</span>
                <input type="text" value={lastName} onChange={(event) => setLastName(event.target.value)} disabled={saving} placeholder="اكتب الاسم الأخير" className="h-[56px] w-full rounded-[20px] border-0 bg-[rgba(6,20,38,0.78)] px-4 text-right text-base font-bold text-white shadow-[inset_0_0_0_1px_rgba(34,211,238,0.16)] outline-none transition placeholder:text-slate-600 focus:shadow-[0_0_24px_rgba(34,211,238,0.12),inset_0_0_0_1px_rgba(34,211,238,0.34)] disabled:opacity-60" />
              </label>
            </div>
            <label className="block">
              <span className="mb-2 block text-[13px] font-black text-slate-300">رقم الجوال</span>
              <input type="tel" value={phone} onChange={(event) => { setPhone(event.target.value); setPhoneError('') }} disabled={saving} placeholder="05xxxxxxxx" inputMode="tel" autoComplete="tel" aria-invalid={Boolean(displayedPhoneError)} aria-describedby="new-customer-phone-error" className="h-[56px] w-full rounded-[20px] border-0 bg-[rgba(6,20,38,0.78)] px-4 text-right text-base font-bold text-white shadow-[inset_0_0_0_1px_rgba(34,211,238,0.16)] outline-none transition placeholder:text-slate-600 focus:shadow-[0_0_24px_rgba(34,211,238,0.12),inset_0_0_0_1px_rgba(34,211,238,0.34)] disabled:opacity-60" />
              {displayedPhoneError ? <span id="new-customer-phone-error" className="mt-2 block break-words text-sm font-bold leading-6 text-red-200">{displayedPhoneError}</span> : null}
            </label>
            <label className="block">
              <span className="mb-2 block text-[13px] font-black text-slate-300">البريد الإلكتروني <span className="mr-2 text-xs text-slate-500">اختياري</span></span>
              <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} disabled={saving} placeholder="customer@example.com" autoComplete="email" className="h-[56px] w-full rounded-[20px] border-0 bg-[rgba(6,20,38,0.78)] px-4 text-right text-base font-bold text-white shadow-[inset_0_0_0_1px_rgba(34,211,238,0.16)] outline-none transition placeholder:text-slate-600 focus:shadow-[0_0_24px_rgba(34,211,238,0.12),inset_0_0_0_1px_rgba(34,211,238,0.34)] disabled:opacity-60" />
            </label>
            <label className="block">
              <span className="mb-2 block text-[13px] font-black text-slate-300">ملاحظات <span className="mr-2 text-xs text-slate-500">اختياري</span></span>
              <textarea value={notes} onChange={(event) => setNotes(event.target.value)} disabled={saving} placeholder="أضف ملاحظة قصيرة" className="min-h-[80px] w-full resize-none rounded-[20px] border-0 bg-[rgba(6,20,38,0.78)] px-4 py-3 text-right text-[15px] font-bold text-white shadow-[inset_0_0_0_1px_rgba(34,211,238,0.16)] outline-none transition placeholder:text-slate-600 focus:shadow-[0_0_24px_rgba(34,211,238,0.12),inset_0_0_0_1px_rgba(34,211,238,0.34)] disabled:opacity-60" />
            </label>
          </div>
          {error ? <div className="mt-3 rounded-[18px] border border-red-300/18 bg-red-400/10 px-4 py-3 text-sm font-bold text-red-100">{error}</div> : null}
        </div>

        <div className="grid shrink-0 gap-3 border-t border-cyan-300/10 bg-[rgba(2,8,23,0.98)] px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-4 sm:mt-5 sm:grid-cols-2 sm:border-t-0 sm:bg-transparent sm:pb-4 xl:px-5 xl:pb-5">
          <button type="button" onClick={handleCreateCustomer} disabled={saving || !phoneValidation.valid} className="min-h-[52px] rounded-[18px] bg-[#22D3EE] px-5 text-[15px] font-black text-slate-950 shadow-[0_0_24px_rgba(34,211,238,0.18)] transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400 disabled:shadow-none active:scale-[0.98]">{saving ? 'جار الحفظ...' : 'حفظ العميل'}</button>
          <button type="button" onClick={closeModal} disabled={saving} className="min-h-[52px] rounded-[18px] bg-[rgba(6,20,38,0.56)] px-5 text-[15px] font-black text-slate-300 shadow-[inset_0_0_0_1px_rgba(34,211,238,0.10)] transition hover:bg-red-400/10 hover:text-red-100 disabled:cursor-not-allowed disabled:opacity-50 active:scale-[0.98]">إلغاء</button>
        </div>
      </div>
    </div>
  )
}
