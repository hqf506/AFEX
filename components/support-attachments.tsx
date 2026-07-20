'use client'

import Image from 'next/image'
import { useEffect, useMemo, useState } from 'react'
import { formatSupportFileSize, type SupportAttachment } from '@/lib/support/ui'

const ACCEPT = 'image/jpeg,image/png,image/webp,application/pdf'
const MAX_BYTES = 10 * 1024 * 1024

export function SupportAttachmentPicker({ files, onChange, disabled = false }: { files: File[]; onChange: (files: File[]) => void; disabled?: boolean }) {
  const [validationError, setValidationError] = useState<string | null>(null)
  const previews = useMemo(() => files.map((file) => file.type.startsWith('image/') ? URL.createObjectURL(file) : ''), [files])
  useEffect(() => {
    return () => previews.forEach((url) => { if (url) URL.revokeObjectURL(url) })
  }, [previews])
  function addFiles(selected: FileList | null) {
    const candidates = [...files, ...Array.from(selected || [])]
    const valid = candidates.filter((file) => ACCEPT.includes(file.type) && file.size > 0 && file.size <= MAX_BYTES)
    setValidationError(candidates.length > 5 ? 'يمكن اختيار خمسة ملفات كحد أقصى.' : valid.length !== candidates.length ? 'أحد الملفات غير مسموح أو يتجاوز 10 MB.' : null)
    onChange(valid.slice(0, 5))
  }
  return <div className="min-w-0 space-y-3"><label className="inline-flex h-10 cursor-pointer items-center rounded-xl border border-cyan-300/20 bg-cyan-300/[0.06] px-4 text-xs font-black text-cyan-100"><input type="file" multiple accept={ACCEPT} disabled={disabled || files.length >= 5} onChange={(event) => { addFiles(event.target.files); event.target.value = '' }} className="sr-only" />إرفاق صور أو PDF</label><p className="text-[11px] text-slate-500">حتى 5 ملفات، وبحد أقصى 10 MB للملف.</p>{validationError ? <p role="alert" className="text-xs font-bold text-red-200">{validationError}</p> : null}{files.length ? <div className="grid gap-2 sm:grid-cols-2">{files.map((file, index) => <div key={`${file.name}-${file.size}-${index}`} className="flex min-w-0 items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.035] p-2">{previews[index] ? <Image unoptimized src={previews[index]} alt="معاينة المرفق" width={48} height={48} className="h-12 w-12 rounded-xl object-cover" /> : <span className="grid h-12 w-12 place-items-center rounded-xl bg-red-400/10 text-xs font-black text-red-200">PDF</span>}<div className="min-w-0 flex-1"><p className="truncate text-xs font-bold text-slate-200">{file.name}</p><p className="mt-1 text-[11px] text-slate-500">{formatSupportFileSize(file.size)}</p></div><button type="button" disabled={disabled} onClick={() => onChange(files.filter((_, itemIndex) => itemIndex !== index))} className="rounded-lg px-2 py-1 text-xs font-black text-red-200">حذف</button></div>)}</div> : null}</div>
}

export function SupportAttachmentList({ attachments }: { attachments: SupportAttachment[] }) {
  const [opening, setOpening] = useState<string | null>(null)
  if (!attachments.length) return null
  async function openAttachment(id: string) {
    if (opening) return
    setOpening(id)
    try {
      const response = await fetch(`/api/support/attachments/${encodeURIComponent(id)}`, { cache: 'no-store' })
      const result = await response.json().catch(() => null)
      if (response.ok && result?.url) window.open(result.url, '_blank', 'noopener,noreferrer')
    } finally { setOpening(null) }
  }
  return <div className="grid gap-2 sm:grid-cols-2">{attachments.map((attachment) => <button key={attachment.id} type="button" disabled={Boolean(opening)} onClick={() => void openAttachment(attachment.id)} className="min-w-0 rounded-2xl border border-cyan-300/15 bg-cyan-300/[0.05] p-3 text-right transition hover:border-cyan-300/35 disabled:opacity-50"><span className="block truncate text-xs font-black text-cyan-100">{attachment.original_filename}</span><span className="mt-1 block text-[11px] text-slate-500">{attachment.mime_type === 'application/pdf' ? 'PDF' : 'صورة'} · {formatSupportFileSize(attachment.size_bytes)}</span></button>)}</div>
}

export async function uploadSupportAttachments(ticketId: string, files: File[], options: { messageId?: string; creation?: boolean; timeoutMs?: number }) {
  if (!files.length) return
  const controller = options.timeoutMs ? new AbortController() : null
  const timeout = controller ? window.setTimeout(() => controller.abort(), options.timeoutMs) : null
  const form = new FormData()
  files.forEach((file) => form.append('files', file))
  form.set('context', options.creation ? 'ticket_creation' : 'message')
  if (options.messageId) form.set('message_id', options.messageId)
  try {
    const response = await fetch(`/api/support/tickets/${encodeURIComponent(ticketId)}/attachments`, { method: 'POST', body: form, signal: controller?.signal })
    const result = await response.json().catch(() => null)
    if (!response.ok || !result?.success) throw new Error(result?.error || 'تعذر رفع المرفقات.')
  } finally {
    if (timeout !== null) window.clearTimeout(timeout)
  }
}
