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
  const dialogRef = useRef<HTMLDivElement | null>(null)
  const previouslyFocusedRef = useRef<HTMLElement | null>(null)
  const phoneValidation = validateSaudiCustomerPhone(phone)
  const displayedPhoneError =
    phoneError || (phoneValidation.valid ? '' : phoneValidation.message)

  useEffect(() => {
    previouslyFocusedRef.current = document.activeElement as HTMLElement | null
    const focusTimeoutId = window.setTimeout(() => {
      firstNameInputRef.current?.focus({ preventScroll: true })
    }, 0)

    return () => {
      window.clearTimeout(focusTimeoutId)
      previouslyFocusedRef.current?.focus({ preventScroll: true })
    }
  }, [])

  useEffect(() => {
    const previousOverflow = document.body.style.overflow
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !saving) {
        onClose()
      }

      if (event.key === 'Tab') {
        const focusable = dialogRef.current?.querySelectorAll<HTMLElement>(
          'button:not(:disabled), input:not(:disabled), textarea:not(:disabled), [href], [tabindex]:not([tabindex="-1"])'
        )
        if (!focusable?.length) return
        const first = focusable[0]
        const last = focusable[focusable.length - 1]
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault()
          last.focus()
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault()
          first.focus()
        }
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
      className="pos-add-customer-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) closeModal()
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-customer-title"
        className="pos-add-customer-dialog pos-customer-sheet-enter"
      >
        <div className="pos-add-customer-header">
          <h3 id="add-customer-title">
            إضافة عميل جديد
          </h3>
          <button
            type="button"
            onClick={closeModal}
            disabled={saving}
            className="pos-add-customer-close"
            aria-label="إغلاق"
          >
            ×
          </button>
        </div>

        <div className="pos-add-customer-body">
          <div className="grid gap-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="pos-add-customer-label">الاسم الأول</span>
                <input ref={firstNameInputRef} type="text" value={firstName} onChange={(event) => setFirstName(event.target.value)} disabled={saving} placeholder="اكتب الاسم الأول" className="pos-add-customer-field" />
              </label>
              <label className="block">
                <span className="pos-add-customer-label">الاسم الأخير</span>
                <input type="text" value={lastName} onChange={(event) => setLastName(event.target.value)} disabled={saving} placeholder="اكتب الاسم الأخير" className="pos-add-customer-field" />
              </label>
            </div>
            <label className="block">
              <span className="pos-add-customer-label">رقم الجوال</span>
              <input type="tel" value={phone} onChange={(event) => { setPhone(event.target.value); setPhoneError('') }} disabled={saving} placeholder="05xxxxxxxx" inputMode="tel" autoComplete="tel" aria-invalid={Boolean(displayedPhoneError)} aria-describedby="new-customer-phone-error" className="pos-add-customer-field" />
              {displayedPhoneError ? <span id="new-customer-phone-error" className="pos-add-customer-validation">{displayedPhoneError}</span> : null}
            </label>
            <label className="block">
              <span className="pos-add-customer-label">البريد الإلكتروني <span>اختياري</span></span>
              <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} disabled={saving} placeholder="customer@example.com" autoComplete="email" className="pos-add-customer-field" />
            </label>
            <label className="block">
              <span className="pos-add-customer-label">ملاحظات <span>اختياري</span></span>
              <textarea value={notes} onChange={(event) => setNotes(event.target.value)} disabled={saving} placeholder="أضف ملاحظة قصيرة" className="pos-add-customer-field is-textarea" />
            </label>
          </div>
          {error ? <div className="pos-add-customer-error" role="alert">{error}</div> : null}
        </div>

        <div className="pos-add-customer-actions">
          <button type="button" onClick={handleCreateCustomer} disabled={saving || !phoneValidation.valid} className="pos-add-customer-save">{saving ? 'جار الحفظ...' : 'حفظ العميل'}</button>
          <button type="button" onClick={closeModal} disabled={saving} className="pos-add-customer-cancel">إلغاء</button>
        </div>
      </div>
    </div>
  )
}
