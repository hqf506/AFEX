import type { ReactNode } from 'react'
import type { Metadata, Viewport } from 'next'
import { PosShellLayout } from '@/components/pos-shell-layout'

const posThemeBootScript = `(()=>{try{const k='afex-pos-theme-v1';const s=localStorage.getItem(k);const t=s==='light'||s==='dark'?s:(matchMedia('(prefers-color-scheme: light)').matches?'light':'dark');document.documentElement.dataset.posTheme=t;document.documentElement.style.colorScheme=t}catch{document.documentElement.dataset.posTheme='dark';document.documentElement.style.colorScheme='dark'}})()`

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
  themeColor: '#0D0E10',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
  interactiveWidget: 'resizes-content',
}

export default function PosLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <script dangerouslySetInnerHTML={{ __html: posThemeBootScript }} />
      <PosShellLayout>{children}</PosShellLayout>
    </>
  )
}
