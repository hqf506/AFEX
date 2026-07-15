import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { NextConfig } from 'next'

const projectRoot = path.dirname(fileURLToPath(import.meta.url))

const nextConfig: NextConfig = {
  allowedDevOrigins: [
    '192.168.8.56',
    'http://192.168.8.56:3000',
    '10.0.2.2',
    'http://10.0.2.2:3000',
  ],
  turbopack: {
    root: projectRoot,
  },
  outputFileTracingIncludes: {
    '/api/invoices/pdf': ['./node_modules/@sparticuz/chromium/bin/**/*'],
  },
  async headers() {
    const securityHeaders = [
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
      { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
      { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
      ...(process.env.NODE_ENV === 'production'
        ? [{ key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' }]
        : []),
    ]

    return [{ source: '/:path*', headers: securityHeaders }]
  },
}

export default nextConfig
