import type { Metadata } from 'next'
import { Cairo } from 'next/font/google'
import { AuthStateProvider } from '@/components/auth-state-provider'
import './globals.css'

const cairo = Cairo({
  subsets: ['arabic'],
  weight: ['400', '500', '600', '700', '800'],
  variable: '--font-cairo',
})

export const metadata: Metadata = {
  title: 'Leather Fix ERP',
  description: 'نظام إدارة الطلبات والفواتير لمتجر Leather Fix',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="ar" dir="rtl" className={`${cairo.variable} h-full antialiased`}>
      <body className="min-h-full font-sans">
        <AuthStateProvider>{children}</AuthStateProvider>
      </body>
    </html>
  )
}
