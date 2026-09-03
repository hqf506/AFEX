'use client'

import { useEffect, useRef } from 'react'
import { PosButton } from './pos-shell-primitives'

export function PosSaleHomeConfirmationDialog({ open, onCancel, onConfirm }: { open: boolean; onCancel: () => void; onConfirm: () => void }) {
  const dialogRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    dialogRef.current?.focus()
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') onCancel() }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [onCancel, open])
  if (!open) return null
  return <div className="afex-pos-dialog-backdrop" role="presentation" onMouseDown={onCancel}>
    <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="afex-sale-home-title" tabIndex={-1} className="afex-pos-dialog" onMouseDown={(event) => event.stopPropagation()}>
      <span className="afex-pos-dialog-handle" aria-hidden="true" />
      <h2 id="afex-sale-home-title">العودة إلى نقطة البيع؟</h2>
      <p>ستبقى مسودة عملية البيع محفوظة ويمكنك متابعتها لاحقًا.</p>
      <PosButton tone="primary" onClick={onConfirm}>العودة إلى نقطة البيع</PosButton>
      <PosButton onClick={onCancel}>متابعة عملية البيع</PosButton>
    </div>
  </div>
}
