import { supabaseAdmin } from '@/lib/supabase/admin'

export default async function DeveloperOverviewPage() {
  const results = await Promise.all([
    supabaseAdmin.from('tenants').select('*', { count: 'exact', head: true }), supabaseAdmin.from('profiles').select('*', { count: 'exact', head: true }),
    supabaseAdmin.from('profiles').select('*', { count: 'exact', head: true }).eq('is_active', true), supabaseAdmin.from('profiles').select('*', { count: 'exact', head: true }).eq('is_active', false),
    supabaseAdmin.from('support_tickets').select('*', { count: 'exact', head: true }).in('status', ['new', 'investigating', 'waiting_customer']),
    supabaseAdmin.from('support_tickets').select('*', { count: 'exact', head: true }).is('assigned_to', null).in('status', ['new', 'investigating', 'waiting_customer']),
    supabaseAdmin.from('platform_admins').select('*', { count: 'exact', head: true }).eq('is_active', true),
  ])
  const [tenants, users, activeUsers, inactiveUsers, activeTickets, unassignedTickets, agents] = results.map((result) => result.count || 0)
  const cards = [['إجمالي المنشآت', tenants], ['الحسابات النشطة', activeUsers], ['التذاكر النشطة', activeTickets], ['التذاكر غير المسندة', unassignedTickets], ['إجمالي المستخدمين', users], ['الحسابات الموقوفة', inactiveUsers], ['Provider agents النشطون', agents]] as const
  return <section className="space-y-5"><header className="hidden rounded-[28px] border border-cyan-300/15 bg-gradient-to-l from-cyan-300/10 to-transparent p-6 md:block"><p className="text-xs font-black text-cyan-200">AFEX DEVELOPER CENTER</p><h1 className="mt-2 text-3xl font-black">نظرة عامة على المنصة</h1></header><div data-mobile-developer-overview className="grid grid-cols-2 gap-3 md:gap-4 xl:grid-cols-3">{cards.map(([label, value], index) => <article key={label} className={`${index > 3 ? 'max-md:hidden' : ''} min-w-0 rounded-[22px] border border-white/10 bg-white/[0.055] p-4 shadow-xl md:rounded-3xl md:p-5`}><p className="break-words text-xs font-bold text-slate-400 md:text-sm">{label}</p><p className="mt-3 break-words text-2xl font-black text-cyan-100 md:text-3xl">{value.toLocaleString('ar-SA')}</p></article>)}</div></section>
}
