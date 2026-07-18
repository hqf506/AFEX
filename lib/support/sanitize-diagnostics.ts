const ALLOWED_KEYS = new Set([
  'page_path',
  'route',
  'timestamp',
  'environment',
  'app_version',
  'browser',
  'operating_system',
  'device_type',
  'role',
  'tenant',
  'branch',
  'authenticated_user',
  'error_reference',
  'error_code',
  'request_method',
  'safe_message',
])

const MAX_DIAGNOSTIC_BYTES = 8 * 1024
const MAX_VALUE_LENGTH = 500

export function sanitizeDiagnostics(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}

  const result: Record<string, string> = {}
  for (const [key, rawValue] of Object.entries(value)) {
    if (!ALLOWED_KEYS.has(key)) continue
    if (typeof rawValue !== 'string' && typeof rawValue !== 'number' && typeof rawValue !== 'boolean') continue
    result[key] = String(rawValue).slice(0, MAX_VALUE_LENGTH)
  }

  while (Buffer.byteLength(JSON.stringify(result), 'utf8') > MAX_DIAGNOSTIC_BYTES) {
    const lastKey = Object.keys(result).at(-1)
    if (!lastKey) break
    delete result[lastKey]
  }
  return result
}
