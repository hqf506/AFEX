'use client'

import type { ButtonHTMLAttributes, ReactNode } from 'react'
import Link from 'next/link'

export function PosButton({
  loading = false,
  tone = 'default',
  children,
  className = '',
  disabled,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  loading?: boolean
  tone?: 'default' | 'danger' | 'primary'
}) {
  return (
    <button
      {...props}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={`afex-pos-button afex-pos-button--${tone} ${className}`}
    >
      {loading ? 'جارٍ التنفيذ...' : children}
    </button>
  )
}

export function PosBadge({ children }: { children: ReactNode }) {
  return <span className="afex-pos-badge">{children}</span>
}

export function PosNavigationItem({
  href,
  label,
  icon,
  active = false,
  disabled = false,
  onClick,
}: {
  href?: string
  label: string
  icon: ReactNode
  active?: boolean
  disabled?: boolean
  onClick?: () => void
}) {
  const content = (
    <>
      <span className="afex-pos-nav-icon" aria-hidden="true">{icon}</span>
      <span>{label}</span>
    </>
  )

  if (disabled || !href) {
    return <span className="afex-pos-nav-item is-disabled" aria-disabled="true">{content}</span>
  }

  return (
    <Link
      href={href}
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
      className={`afex-pos-nav-item ${active ? 'is-active' : ''}`}
    >
      {content}
    </Link>
  )
}
