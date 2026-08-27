import type { Metadata } from 'next'
import localFont from 'next/font/local'
import { AuthStateProvider } from '@/components/auth-state-provider'
import { DevCacheReset } from '@/components/dev-cache-reset'
import { ProfilePresentationProvider } from '@/components/profile-presentation-provider'
import './globals.css'
import './pos-tablet.css'
import './pos-mobile-defects.css'

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
  metadataBase: new URL('https://smart-afex.com'),
  title: 'AFEX',
  description: 'نظام إدارة الطلبات والفواتير لمتجر AFEX',
  openGraph: {
    title: 'AFEX',
    description: 'نظام إدارة الطلبات والفواتير لمتجر AFEX',
    url: 'https://smart-afex.com',
    siteName: 'AFEX',
    images: [
      {
        url: '/brand/afex-og-v2.png',
        width: 1200,
        height: 630,
        alt: 'AFEX — نظام إدارة الطلبات والفواتير',
      },
    ],
    locale: 'ar_SA',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'AFEX',
    description: 'نظام إدارة الطلبات والفواتير لمتجر AFEX',
    images: ['/brand/afex-og-v2.png'],
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="ar" dir="rtl" className={`${cairo.variable} h-full antialiased`} suppressHydrationWarning>
      <body className="min-h-full font-sans">
        <DevCacheReset />
        <AuthStateProvider>
          <ProfilePresentationProvider>{children}</ProfilePresentationProvider>
        </AuthStateProvider>
      </body>
    </html>
  )
}
