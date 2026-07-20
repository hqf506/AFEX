'use client'

import { useEffect, useRef, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'

type NavigationFeedbackProps = {
  prefetchRoutes?: readonly string[]
}

type NavigatorWithConnection = Navigator & {
  connection?: { saveData?: boolean }
}

export function NavigationFeedback({ prefetchRoutes = [] }: NavigationFeedbackProps) {
  const pathname = usePathname()
  const router = useRouter()
  const [pending, setPending] = useState(false)
  const pendingHrefRef = useRef('')
  const pendingAnchorRef = useRef<HTMLAnchorElement | null>(null)
  const prefetchedRoutesRef = useRef(new Set<string>())
  const timeoutRef = useRef<number | null>(null)

  useEffect(() => {
    if (pendingAnchorRef.current) {
      delete pendingAnchorRef.current.dataset.navigationPending
      pendingAnchorRef.current.removeAttribute('aria-busy')
      pendingAnchorRef.current = null
    }
    pendingHrefRef.current = ''
    const frameId = window.requestAnimationFrame(() => setPending(false))
    if (timeoutRef.current !== null) {
      window.clearTimeout(timeoutRef.current)
      timeoutRef.current = null
    }
    return () => window.cancelAnimationFrame(frameId)
  }, [pathname])

  useEffect(() => {
    const handleNavigationClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
      const target = event.target
      if (!(target instanceof Element)) return

      const anchor = target.closest<HTMLAnchorElement>('a[href]')
      if (!anchor || anchor.target === '_blank' || anchor.hasAttribute('download')) return

      const destination = new URL(anchor.href, window.location.href)
      if (destination.origin !== window.location.origin) return
      if (destination.href === window.location.href) return

      const destinationKey = `${destination.pathname}${destination.search}${destination.hash}`
      if (pendingHrefRef.current === destinationKey) {
        event.preventDefault()
        event.stopPropagation()
        return
      }

      if (pendingAnchorRef.current && pendingAnchorRef.current !== anchor) {
        delete pendingAnchorRef.current.dataset.navigationPending
        pendingAnchorRef.current.removeAttribute('aria-busy')
      }
      pendingHrefRef.current = destinationKey
      pendingAnchorRef.current = anchor
      anchor.dataset.navigationPending = 'true'
      anchor.setAttribute('aria-busy', 'true')
      setPending(true)

      if (timeoutRef.current !== null) window.clearTimeout(timeoutRef.current)
      timeoutRef.current = window.setTimeout(() => {
        pendingHrefRef.current = ''
        delete anchor.dataset.navigationPending
        anchor.removeAttribute('aria-busy')
        if (pendingAnchorRef.current === anchor) pendingAnchorRef.current = null
        setPending(false)
        timeoutRef.current = null
      }, 10_000)
    }

    document.addEventListener('click', handleNavigationClick, true)
    return () => {
      document.removeEventListener('click', handleNavigationClick, true)
      if (timeoutRef.current !== null) window.clearTimeout(timeoutRef.current)
      if (pendingAnchorRef.current) {
        delete pendingAnchorRef.current.dataset.navigationPending
        pendingAnchorRef.current.removeAttribute('aria-busy')
      }
    }
  }, [])

  useEffect(() => {
    if (!prefetchRoutes.length) return
    if ((navigator as NavigatorWithConnection).connection?.saveData) return

    const routes = [...new Set(prefetchRoutes)]
      .filter((route) => route !== pathname && !prefetchedRoutesRef.current.has(route))
      .slice(0, 5)
    const prefetch = () => routes.forEach((route) => {
      prefetchedRoutesRef.current.add(route)
      router.prefetch(route)
    })

    if ('requestIdleCallback' in window) {
      const idleId = window.requestIdleCallback(prefetch, { timeout: 2_000 })
      return () => window.cancelIdleCallback(idleId)
    }

    const timeoutId = setTimeout(prefetch, 250)
    return () => clearTimeout(timeoutId)
  }, [pathname, prefetchRoutes, router])

  return (
    <div aria-hidden="true" data-navigation-feedback data-pending={pending || undefined} className={`pointer-events-none fixed inset-x-0 top-0 z-[14000] h-0.5 overflow-hidden transition-opacity duration-150 ${pending ? 'opacity-100' : 'opacity-0'}`}>
      <span className="block h-full w-1/2 animate-[navigation-progress_900ms_ease-in-out_infinite] rounded-full bg-gradient-to-l from-cyan-300 via-emerald-300 to-cyan-200 shadow-[0_0_16px_rgba(34,211,238,0.8)]" />
    </div>
  )
}
