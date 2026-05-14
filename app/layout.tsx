import type { Metadata } from 'next'
import localFont from 'next/font/local'
import { AuthStateProvider } from '@/components/auth-state-provider'
import { DevCacheReset } from '@/components/dev-cache-reset'
import './globals.css'

const cairo = localFont({
  src: [
    {
      path: './fonts/cairo-arabic.woff2',
      weight: '400',
      style: 'normal',
    },
    {
      path: './fonts/cairo-arabic.woff2',
      weight: '500',
      style: 'normal',
    },
    {
      path: './fonts/cairo-arabic.woff2',
      weight: '600',
      style: 'normal',
    },
    {
      path: './fonts/cairo-arabic.woff2',
      weight: '700',
      style: 'normal',
    },
    {
      path: './fonts/cairo-arabic.woff2',
      weight: '800',
      style: 'normal',
    },
  ],
  display: 'swap',
  variable: '--font-cairo',
})

export const metadata: Metadata = {
  title: 'AFEX',
  description: 'نظام إدارة الطلبات والفواتير لمتجر AFEX',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="ar" dir="rtl" className={`${cairo.variable} h-full antialiased`}>
      <body className="min-h-full font-sans">
        <DevCacheReset />
        <AuthStateProvider>{children}</AuthStateProvider>
      </body>
    </html>
  )
}
