import type { ReactNode } from 'react'
import type { Metadata, Viewport } from 'next'
import { PosShellLayout } from '@/components/pos-shell-layout'

export const metadata: Metadata = {
  title: 'نقطة البيع',
  description: 'تجربة تشغيلية خفيفة وسريعة لنقطة البيع في AFEX.',
  applicationName: 'AFEX POS',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'AFEX POS',
  },
  formatDetection: {
    telephone: false,
  },
}

export const viewport: Viewport = {
  themeColor: '#0f172a',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
  interactiveWidget: 'resizes-content',
}

export default function PosLayout({ children }: { children: ReactNode }) {
  return <PosShellLayout>{children}</PosShellLayout>
}
