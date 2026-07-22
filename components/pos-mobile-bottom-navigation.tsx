'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

function BottomNavigationIcon({ name }: { name: 'home' | 'clipboard' | 'settings' }) {
  const common = {
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.8,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    className: 'h-5 w-5',
    'aria-hidden': true,
  }

  if (name === 'home') {
    return <svg {...common}><path d="M3 10.5 12 3l9 7.5" /><path d="M5 9.5V21h14V9.5" /><path d="M9.5 21v-6h5v6" /></svg>
  }

  if (name === 'clipboard') {
    return <svg {...common}><rect x="5" y="4" width="14" height="17" rx="2.5" /><path d="M9 4.5V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v.5M9 9h6M9 13h6M9 17h3" /></svg>
  }

  return <svg {...common}><path d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z" /><path d="M19.4 15a1.8 1.8 0 0 0 .36 2l.06.06a2.1 2.1 0 0 1-2.97 2.97l-.06-.06a1.8 1.8 0 0 0-2-.36 1.8 1.8 0 0 0-1.1 1.66V21a2.1 2.1 0 0 1-4.2 0v-.1a1.8 1.8 0 0 0-1.08-1.65 1.8 1.8 0 0 0-2 .36l-.06.06a2.1 2.1 0 0 1-2.97-2.97l.06-.06a1.8 1.8 0 0 0 .36-2 1.8 1.8 0 0 0-1.66-1.1H2a2.1 2.1 0 0 1 0-4.2h.1a1.8 1.8 0 0 0 1.65-1.08 1.8 1.8 0 0 0-.36-2l-.06-.06a2.1 2.1 0 0 1 2.97-2.97l.06.06a1.8 1.8 0 0 0 2 .36h.01A1.8 1.8 0 0 0 9.45 2V2a2.1 2.1 0 0 1 4.2 0v.1a1.8 1.8 0 0 0 1.08 1.65 1.8 1.8 0 0 0 2-.36l.06-.06a2.1 2.1 0 0 1 2.97 2.97l-.06.06a1.8 1.8 0 0 0-.36 2v.01A1.8 1.8 0 0 0 21 9.45h.1a2.1 2.1 0 0 1 0 4.2H21a1.8 1.8 0 0 0-1.6 1.35Z" /></svg>
}

const items = [
  { label: 'الرئيسية', href: '/pos', icon: 'home' as const },
  { label: 'حالة الطلبات', href: '/pos/order-status', icon: 'clipboard' as const },
  { label: 'الإعدادات', href: '/pos/offline-drafts', icon: 'settings' as const },
]

export function PosMobileBottomNavigation() {
  const pathname = usePathname()

  return (
    <nav aria-label="تنقل نقطة البيع" className="grid grid-cols-3 gap-2 rounded-[22px] border border-cyan-300/10 bg-[rgba(2,8,23,0.78)] p-2 backdrop-blur-xl sm:hidden">
      {items.map((item) => {
        const active = pathname === item.href

        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? 'page' : undefined}
            className={`flex min-h-[54px] min-w-0 flex-col items-center justify-center gap-1 rounded-[16px] text-[11px] font-black transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/70 active:scale-[0.97] ${active ? 'bg-cyan-300/10 text-cyan-100' : 'text-slate-400'}`}
          >
            <BottomNavigationIcon name={item.icon} />
            <span className="max-w-full truncate">{item.label}</span>
          </Link>
        )
      })}
    </nav>
  )
}
