import 'server-only'
import { randomUUID } from 'node:crypto'

export const SUPPORT_ATTACHMENT_BUCKET = 'support-attachments'
export const SUPPORT_ATTACHMENT_MAX_BYTES = 10 * 1024 * 1024
export const SUPPORT_ATTACHMENT_MAX_COUNT = 5
export const SUPPORT_ATTACHMENT_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'] as const
export type SupportAttachmentMime = (typeof SUPPORT_ATTACHMENT_MIME_TYPES)[number]

const extensions: Record<SupportAttachmentMime, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'application/pdf': 'pdf',
}

export function sanitizeSupportFilename(value: string) {
  const cleaned = value.normalize('NFKC').replace(/[\\/\0-\x1f\x7f<>:"|?*]+/g, '-').replace(/\s+/g, ' ').trim()
  return (cleaned || 'مرفق').slice(0, 180)
}

export async function validateSupportAttachment(file: File) {
  if (!SUPPORT_ATTACHMENT_MIME_TYPES.includes(file.type as SupportAttachmentMime)) return null
  if (file.size < 1 || file.size > SUPPORT_ATTACHMENT_MAX_BYTES) return null
  const bytes = new Uint8Array(await file.slice(0, 12).arrayBuffer())
  const valid = file.type === 'image/jpeg'
    ? bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
    : file.type === 'image/png'
      ? bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47
      : file.type === 'image/webp'
        ? String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF' && String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP'
        : String.fromCharCode(...bytes.slice(0, 5)) === '%PDF-'
  return valid ? file.type as SupportAttachmentMime : null
}

export function supportAttachmentPath(tenantId: string, ticketId: string, mime: SupportAttachmentMime) {
  return `${tenantId}/${ticketId}/${randomUUID()}.${extensions[mime]}`
}
