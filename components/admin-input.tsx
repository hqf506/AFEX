'use client'

import type {
  InputHTMLAttributes,
  TextareaHTMLAttributes,
} from 'react'

type AdminInputProps = InputHTMLAttributes<HTMLInputElement>
type AdminTextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement>

export function AdminInput({
  className = '',
  ...props
}: AdminInputProps) {
  return <input {...props} className={`field-input ${className}`} />
}

export function AdminTextarea({
  className = '',
  ...props
}: AdminTextareaProps) {
  return <textarea {...props} className={`field-input ${className}`} />
}
