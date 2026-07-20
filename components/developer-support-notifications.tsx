'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createPortal } from 'react-dom'
import { createContext, useCallback, useContext, useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { AdminDarkSelect } from '@/components/admin-dark-select'
import type { DeveloperSupportNotification, DeveloperSupportNotificationResponse } from '@/lib/support/contracts'

const POPOVER_LIMIT = 10

type NotificationsContextValue = {
  items: DeveloperSupportNotification[]
  unreadCount: number
  loading: boolean
  error: string
  markingAll: boolean
  openingKey: string
  openNotification: (item: DeveloperSupportNotification) => Promise<void>
  markAll: () => Promise<void>
}

const NotificationsContext = createContext<NotificationsContextValue | null>(null)

export function DeveloperSupportNotificationsProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const requestRef = useRef<AbortController | null>(null)
  const [items, setItems] = useState<DeveloperSupportNotification[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [markingAll, setMarkingAll] = useState(false)
  const [openingKey, setOpeningKey] = useState('')

  const load = useCallback(async (background = false) => {
    if (requestRef.current) return
    const controller = new AbortController()
    requestRef.current = controller
    if (!background) setLoading(true)
    try {
      const response = await fetch('/api/provider/support/notifications', { signal: controller.signal, cache: 'no-store' })
      const result = await response.json() as DeveloperSupportNotificationResponse & { success?: boolean; error?: string }
      if (!response.ok || !result.success) throw new Error(result.error || 'تعذر تحميل إشعارات الدعم.')
      setItems(result.items)
      setUnreadCount(result.unreadCount)
      setError('')
    } catch (caught) {
      if (!controller.signal.aborted) setError(caught instanceof Error ? caught.message : 'تعذر تحميل إشعارات الدعم.')
    } finally {
      if (requestRef.current === controller) requestRef.current = null
      if (!background) setLoading(false)
    }
  }, [])

  useEffect(() => {
    const initial = window.setTimeout(() => void load(), 0)
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') void load(true)
    }, 60_000)
    const visible = () => {
      if (document.visibilityState === 'visible') void load(true)
    }
    document.addEventListener('visibilitychange', visible)
    return () => {
      window.clearTimeout(initial)
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', visible)
      requestRef.current?.abort()
    }
  }, [load])

  async function openNotification(item: DeveloperSupportNotification) {
    if (openingKey) return
    setOpeningKey(item.event_key)
    try {
      if (item.unread) {
        const response = await fetch('/api/provider/support/notifications/read', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ eventType: item.event_type, eventId: item.event_id }),
        })
        if (response.ok) {
          setItems((current) => current.map((entry) => entry.event_key === item.event_key ? { ...entry, unread: false } : entry))
          setUnreadCount((value) => Math.max(0, value - 1))
        } else {
          setError('تعذر تحديث حالة الإشعار، ويمكنك متابعة فتح التذكرة.')
        }
      }
      const supportPath = pathname.startsWith('/provider') ? '/provider/support' : '/developer/support'
      if (pathname === supportPath) {
        const next = new URL(window.location.href)
        next.searchParams.set('ticket', item.ticket_id)
        window.history.pushState({ ...window.history.state, providerTicketDrawer: true }, '', next)
        window.dispatchEvent(new CustomEvent('provider-support:open-ticket', { detail: { ticketId: item.ticket_id } }))
      } else {
        router.push(`${supportPath}?ticket=${encodeURIComponent(item.ticket_id)}`)
      }
    } finally {
      setOpeningKey('')
    }
  }

  async function markAll() {
    if (!unreadCount || markingAll) return
    setMarkingAll(true)
    const previousItems = items
    const previousCount = unreadCount
    setItems((current) => current.map((item) => ({ ...item, unread: false })))
    setUnreadCount(0)
    try {
      const response = await fetch('/api/provider/support/notifications/read-all', { method: 'POST' })
      if (!response.ok) throw new Error()
      setError('')
    } catch {
      setItems(previousItems)
      setUnreadCount(previousCount)
      setError('تعذر تحديد الإشعارات كمقروءة. حاول مرة أخرى.')
    } finally {
      setMarkingAll(false)
    }
  }

  return <NotificationsContext.Provider value={{ items, unreadCount, loading, error, markingAll, openingKey, openNotification, markAll }}>{children}</NotificationsContext.Provider>
}

function useNotifications() {
  const value = useContext(NotificationsContext)
  if (!value) throw new Error('DeveloperSupportNotificationsProvider is required')
  return value
}

function NotificationItem({ item }: { item: DeveloperSupportNotification }) {
  const { openingKey, openNotification } = useNotifications()
  return <button type="button" disabled={openingKey === item.event_key} onClick={() => void openNotification(item)} className={`w-full min-w-0 rounded-xl border p-3 text-right transition disabled:opacity-60 ${item.unread ? 'border-cyan-300/20 bg-cyan-300/[0.08]' : 'border-white/10 bg-white/[0.025]'}`}>
    <span className="text-xs font-black text-cyan-200">{item.event_type === 'ticket_created' ? 'تذكرة جديدة' : 'رد جديد من العميل'}</span>
    <p className="mt-1 break-words text-sm font-bold">{item.ticket_number} — {item.title}</p>
    <p className="mt-1 break-words text-xs text-slate-400">{item.organization_name}</p>
    {item.preview ? <p className="mt-2 line-clamp-2 break-words text-xs text-slate-400">{item.preview}</p> : null}
    <time className="mt-2 block text-[11px] text-slate-500">{new Date(item.activity_at).toLocaleString('ar-SA')}</time>
  </button>
}

export function DeveloperSupportNotifications() {
  const panelId = useId()
  const bellRef = useRef<HTMLButtonElement | null>(null)
  const wrapperRef = useRef<HTMLDivElement | null>(null)
  const popoverRef = useRef<HTMLElement | null>(null)
  const [open, setOpen] = useState(false)
  const [position, setPosition] = useState<{ top: number; left: number; width: number; maxHeight: number } | null>(null)
  const { items, unreadCount, loading, error, markingAll, markAll } = useNotifications()
  const compactItems = items.slice(0, POPOVER_LIMIT)

  useEffect(() => {
    if (!open) return
    const updatePosition = () => {
      const rect = bellRef.current?.getBoundingClientRect()
      if (!rect) return
      const gap = 8
      const edge = 12
      const width = Math.min(390, window.innerWidth - edge * 2)
      const left = Math.min(Math.max(edge, rect.right - width), window.innerWidth - width - edge)
      const top = rect.bottom + gap
      setPosition({ top, left, width, maxHeight: Math.max(160, Math.min(640, window.innerHeight - top - edge)) })
    }
    updatePosition()
    const close = (event: MouseEvent) => {
      const target = event.target as Node
      if (!popoverRef.current?.contains(target) && !wrapperRef.current?.contains(target)) setOpen(false)
    }
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false)
        bellRef.current?.focus()
      }
    }
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', escape)
    window.addEventListener('resize', updatePosition)
    window.addEventListener('scroll', updatePosition, true)
    return () => {
      document.removeEventListener('mousedown', close)
      document.removeEventListener('keydown', escape)
      window.removeEventListener('resize', updatePosition)
      window.removeEventListener('scroll', updatePosition, true)
    }
  }, [open])

  const popover = open && position && typeof document !== 'undefined' ? createPortal(<section ref={popoverRef} id={panelId} aria-label="قائمة إشعارات الدعم" style={{ position: 'fixed', top: position.top, left: position.left, width: position.width, maxHeight: position.maxHeight }} className="z-[9500] flex flex-col overflow-hidden rounded-[24px] border border-cyan-300/15 bg-[#07111f] p-4 shadow-2xl">
    <header className="flex shrink-0 items-center justify-between gap-3">
      <h2 className="font-black">إشعارات الدعم</h2>
      <button type="button" disabled={!unreadCount || markingAll} onClick={() => void markAll()} className="text-xs font-bold text-cyan-200 disabled:opacity-40">تحديد الكل كمقروء</button>
    </header>
    {error ? <p className="mt-3 shrink-0 rounded-xl border border-red-300/15 bg-red-300/[0.06] p-3 text-xs text-red-200">{error}</p> : null}
    <div className="mt-3 min-h-0 flex-1 space-y-2 overflow-y-auto overscroll-contain pr-1">
      {loading ? <div className="h-28 animate-pulse rounded-xl bg-white/[0.05]" /> : compactItems.length === 0 ? <p className="py-8 text-center text-sm text-slate-400">لا توجد إشعارات دعم حتى الآن</p> : compactItems.map((item) => <NotificationItem key={item.event_key} item={item} />)}
    </div>
    {items.length > 0 ? <Link href="/developer/notifications" onClick={() => setOpen(false)} className="mt-3 shrink-0 rounded-xl border border-cyan-300/20 bg-cyan-300/[0.07] px-4 py-2.5 text-center text-xs font-black text-cyan-100">عرض جميع الإشعارات</Link> : null}
  </section>, document.body) : null

  return <div className="relative" ref={wrapperRef}>
    <button ref={bellRef} type="button" aria-label="إشعارات الدعم" aria-expanded={open} aria-controls={panelId} onClick={() => setOpen((value) => !value)} className="relative grid size-11 place-items-center rounded-xl border border-cyan-300/15 bg-[#07111f] text-lg focus:outline-none focus:ring-2 focus:ring-cyan-300/25">
      🔔
      {unreadCount > 0 ? <span className="absolute -left-2 -top-2 min-w-5 rounded-full bg-cyan-300 px-1.5 py-0.5 text-[10px] font-black text-slate-950">{unreadCount > 99 ? '99+' : unreadCount}</span> : null}
    </button>
    {popover}
  </div>
}

export function ProviderNotificationsShell({ children, notificationsEnabled }: { children: ReactNode; notificationsEnabled: boolean }) {
  const content = <>
    <header className="mb-4 flex items-center justify-end gap-2 rounded-[20px] border border-white/10 bg-[#07111f]/80 px-3 py-2 backdrop-blur-xl">
      <div className="flex min-w-0 items-center gap-2"><span className="grid size-9 shrink-0 place-items-center rounded-xl border border-emerald-300/20 bg-emerald-300/10 text-sm font-black text-emerald-200">AF</span><span className="min-w-0 leading-tight"><span className="block truncate text-xs font-black text-white">فريق AFEX</span><span className="mt-1 block text-[10px] font-bold text-slate-400">دعم المنصة</span></span></div>
      {notificationsEnabled ? <DeveloperSupportNotifications /> : null}
    </header>
    {children}
  </>
  return notificationsEnabled ? <DeveloperSupportNotificationsProvider>{content}</DeveloperSupportNotificationsProvider> : content
}

export function DeveloperNotificationsPage() {
  const { items, unreadCount, loading, error, markingAll, markAll } = useNotifications()
  const [search, setSearch] = useState('')
  const [type, setType] = useState('all')
  const [readState, setReadState] = useState('all')
  const normalizedSearch = search.trim().toLocaleLowerCase('ar')
  const visibleItems = items.filter((item) => {
    if (type !== 'all' && item.event_type !== type) return false
    if (readState === 'unread' && !item.unread) return false
    if (readState === 'read' && item.unread) return false
    if (!normalizedSearch) return true
    return [item.title, item.ticket_number, item.organization_name, item.preview || ''].some((value) => value.toLocaleLowerCase('ar').includes(normalizedSearch))
  })
  return <section data-responsive-developer-notifications dir="rtl" className="min-w-0 space-y-5">
    <header className="rounded-[28px] border border-cyan-300/15 bg-gradient-to-l from-cyan-300/10 to-transparent p-5 sm:p-6"><div className="flex items-center gap-3"><span aria-hidden="true" className="grid size-11 place-items-center rounded-2xl border border-cyan-300/20 bg-cyan-300/10 text-xl">🔔</span><div className="min-w-0"><p className="text-xs font-black tracking-[0.18em] text-cyan-200">AFEX DEVELOPER CENTER</p><h1 className="mt-1 text-2xl font-black md:text-3xl">الإشعارات</h1></div></div><p className="mt-3 text-sm text-slate-400">آخر {items.length.toLocaleString('ar-SA')} إشعارًا — غير المقروءة {unreadCount.toLocaleString('ar-SA')}</p></header>
    <div className="grid min-w-0 gap-3 rounded-[24px] border border-white/10 bg-[#07111f]/80 p-4 backdrop-blur-xl md:grid-cols-2 xl:grid-cols-[minmax(240px,1fr)_190px_170px_auto] xl:items-end">
      <label className="min-w-0 space-y-2 text-xs font-bold text-slate-300"><span>بحث</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="ابحث بالعنوان أو رقم التذكرة أو المنشأة" className="h-11 w-full min-w-0 rounded-xl border border-cyan-300/15 bg-[#06111f] px-4 text-sm text-white outline-none placeholder:text-slate-500 focus:border-cyan-300/45 focus:ring-2 focus:ring-cyan-300/15" /></label>
      <label className="min-w-0 space-y-2 text-xs font-bold text-slate-300"><span>النوع</span><AdminDarkSelect value={type} onChange={setType} ariaLabel="تصفية الإشعارات حسب النوع" triggerClassName="h-11 rounded-xl" options={[{ value: 'all', label: 'جميع الأنواع' }, { value: 'ticket_created', label: 'تذكرة جديدة' }, { value: 'customer_reply', label: 'رد عميل' }]} /></label>
      <label className="min-w-0 space-y-2 text-xs font-bold text-slate-300"><span>حالة القراءة</span><AdminDarkSelect value={readState} onChange={setReadState} ariaLabel="تصفية الإشعارات حسب القراءة" triggerClassName="h-11 rounded-xl" options={[{ value: 'all', label: 'الكل' }, { value: 'unread', label: 'غير مقروءة' }, { value: 'read', label: 'مقروءة' }]} /></label>
      <button type="button" disabled={!unreadCount || markingAll} onClick={() => void markAll()} className="h-11 rounded-xl border border-cyan-300/20 bg-cyan-300/10 px-4 text-xs font-black text-cyan-100 disabled:opacity-40">تحديد الكل كمقروء</button>
    </div>
    {error ? <p className="rounded-2xl border border-red-300/15 bg-red-300/[0.06] p-4 text-sm text-red-200">{error}</p> : null}
    <div className="grid min-w-0 gap-3">
      {loading ? <div className="h-40 animate-pulse rounded-3xl bg-white/[0.05]" /> : visibleItems.length === 0 ? <div className="rounded-3xl border border-white/10 bg-white/[0.035] p-10 text-center text-sm text-slate-400">لا توجد إشعارات مطابقة</div> : visibleItems.map((item) => <NotificationItem key={item.event_key} item={item} />)}
    </div>
    <footer className="space-y-2 text-center"><p className="text-xs text-slate-500">عرض {visibleItems.length.toLocaleString('ar-SA')} من أحدث {items.length.toLocaleString('ar-SA')} إشعارًا</p>{items.length === 20 ? <button type="button" disabled title="يعرض النظام أحدث 20 إشعارًا حاليًا" className="h-11 rounded-xl border border-white/10 px-5 text-xs font-black text-slate-500">إظهار المزيد</button> : null}</footer>
  </section>
}
