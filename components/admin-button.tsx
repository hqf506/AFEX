'use client'

import type { ButtonHTMLAttributes } from 'react'

type AdminButtonVariant =
  | 'primary'
  | 'secondary'
  | 'danger'
  | 'active'
  | 'inactive'
  | 'soft'

type AdminButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: AdminButtonVariant
}

const VARIANT_CLASS_MAP: Record<AdminButtonVariant, string> = {
  primary: 'primary-btn',
  secondary: 'secondary-btn',
  danger:
    'inline-flex items-center justify-center rounded-2xl border border-red-300 bg-white px-4 py-2.5 text-sm font-bold text-red-600 transition hover:border-red-400 disabled:opacity-60',
  active:
    'inline-flex items-center justify-center rounded-2xl border border-amber-300 bg-white px-4 py-2.5 text-sm font-bold text-amber-700 transition hover:border-amber-400 disabled:opacity-60',
  inactive:
    'inline-flex items-center justify-center rounded-2xl border border-emerald-300 bg-white px-4 py-2.5 text-sm font-bold text-emerald-700 transition hover:border-emerald-400 disabled:opacity-60',
  soft: 'soft-btn',
}

export function AdminButton({
  variant = 'secondary',
  className = '',
  type = 'button',
  disabled = false,
  children,
  ...props
}: AdminButtonProps) {
  return (
    <button
      {...props}
      type={type}
      disabled={disabled}
      className={`${VARIANT_CLASS_MAP[variant]} ${
        disabled ? 'cursor-not-allowed opacity-60' : ''
      } ${className}`}
    >
      {children}
    </button>
  )
}
