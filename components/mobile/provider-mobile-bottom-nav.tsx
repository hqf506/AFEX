'use client'

import { useEffect, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { MobileBottomNav } from '@/components/mobile/mobile-bottom-nav'

type ProviderQueueShortcut = 'all' | 'assigned' | 'critical'

function readShortcut(): ProviderQueueShortcut {
  const params = new URLSearchParams(window.location.search)
  if (params.get('assignment') === 'me') return 'assigned'
  if (params.get('priority') === 'critical') return 'critical'
  return 'all'
}

export function ProviderMobileBottomNavigation() {
  const pathname = usePathname()
  const router = useRouter()
  const [shortcut, setShortcut] = useState<ProviderQueueShortcut>('all')

  useEffect(() => {
    const sync = () => setShortcut(readShortcut())
    sync()
    window.addEventListener('popstate', sync)
    return () => window.removeEventListener('popstate', sync)
  }, [])

  const selectShortcut = (value: ProviderQueueShortcut) => {
    const url = new URL(window.location.href)
    url.pathname = '/provider/support'
    url.searchParams.delete('ticket')
    url.searchParams.delete('assignment')
    url.searchParams.delete('priority')
    if (value === 'assigned') url.searchParams.set('assignment', 'me')
    if (value === 'critical') url.searchParams.set('priority', 'critical')
    if (pathname !== '/provider/support') {
      router.push(`${url.pathname}${url.search}`)
      return
    }
    window.history.pushState(window.history.state, '', url)
    setShortcut(value)
    window.dispatchEvent(new PopStateEvent('popstate'))
  }

  return (
    <MobileBottomNav
      ariaLabel="التنقل الرئيسي لدعم AFEX"
      items={[
        { key: 'tickets', label: 'التذاكر', active: shortcut === 'all', onSelect: () => selectShortcut('all'), icon: <span className="text-base">▤</span> },
        { key: 'assigned', label: 'مسندة إليّ', active: shortcut === 'assigned', onSelect: () => selectShortcut('assigned'), icon: <span className="text-base">◎</span> },
        { key: 'critical', label: 'حرجة', active: shortcut === 'critical', onSelect: () => selectShortcut('critical'), icon: <span className="text-base">!</span> },
      ]}
    />
  )
}
