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
  const cards = [['إجمالي المنشآت', tenants], ['إجمالي المستخدمين', users], ['الحسابات النشطة', activeUsers], ['الحسابات الموقوفة', inactiveUsers], ['التذاكر النشطة', activeTickets], ['التذاكر غير المسندة', unassignedTickets], ['Provider agents النشطون', agents]] as const
  return <section className="space-y-5"><header className="rounded-[28px] border border-cyan-300/15 bg-gradient-to-l from-cyan-300/10 to-transparent p-6"><p className="text-xs font-black text-cyan-200">AFEX DEVELOPER CENTER</p><h1 className="mt-2 text-3xl font-black">نظرة عامة على المنصة</h1></header><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{cards.map(([label, value]) => <article key={label} className="rounded-3xl border border-white/10 bg-white/[0.055] p-5 shadow-xl"><p className="text-sm font-bold text-slate-400">{label}</p><p className="mt-3 text-3xl font-black text-cyan-100">{value.toLocaleString('ar-SA')}</p></article>)}</div></section>
}
