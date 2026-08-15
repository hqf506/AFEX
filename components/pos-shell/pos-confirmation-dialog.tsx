'use client'

import { useEffect, useRef } from 'react'
import { PosButton } from './pos-shell-primitives'

export function PosConfirmationDialog({
  open,
  loading,
  onCancel,
  onConfirm,
}: {
  open: boolean
  loading: boolean
  onCancel: () => void
  onConfirm: () => void
}) {
  const dialogRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    dialogRef.current?.focus()
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !loading) onCancel()
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [loading, onCancel, open])

  if (!open) return null

  return (
    <div className="afex-pos-dialog-backdrop" role="presentation" onMouseDown={() => !loading && onCancel()}>
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="afex-end-pos-title"
        tabIndex={-1}
        className="afex-pos-dialog"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <span className="afex-pos-dialog-handle" aria-hidden="true" />
        <h2 id="afex-end-pos-title">إنهاء وضع POS؟</h2>
        <p>سيتم إبطال جلسة موظف نقطة البيع الحالية.</p>
        <section>
          <strong>ما الذي سيحدث؟</strong>
          <ul>
            <li>العودة إلى شاشة تسجيل دخول POS</li>
            <li>إبطال جلسة الموظف الحالية</li>
            <li>تتطلب استعادة صلاحية الإدارة إعادة مصادقة موثوقة</li>
          </ul>
        </section>
        <PosButton tone="danger" loading={loading} onClick={onConfirm}>إنهاء وضع POS</PosButton>
        <PosButton disabled={loading} onClick={onCancel}>إلغاء</PosButton>
        <small>جلسة POS وهوية المؤسسة سلطتان منفصلتان؛ يطبّق الإنهاء عقد إعادة المصادقة الحالي.</small>
      </div>
    </div>
  )
}
