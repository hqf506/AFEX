import { NextResponse } from 'next/server'
import { requireDeveloperAccess } from '@/lib/developer/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const access = await requireDeveloperAccess()
  if (!access.ok) return NextResponse.json({ success: false, error: access.status === 401 ? 'يجب تسجيل الدخول.' : 'غير مصرح بهذا الإجراء.' }, { status: access.status })
  const { id } = await params
  if (!UUID.test(id)) return NextResponse.json({ success: false, error: 'معرّف المنشأة غير صالح.' }, { status: 400 })
  const { data: tenant } = await supabaseAdmin.from('tenants').select('id,name,created_at').eq('id', id).maybeSingle()
  if (!tenant) return NextResponse.json({ success: false, error: 'المنشأة غير موجودة.' }, { status: 404 })
  const [adminsResult, usersResult, activeResult, branchesResult, ticketsResult] = await Promise.all([
    supabaseAdmin.from('profiles').select('full_name,username,contact_email,phone,role,is_active,created_at').eq('tenant_id', id).eq('role', 'admin').order('created_at', { ascending: true }),
    supabaseAdmin.from('profiles').select('id', { count: 'exact', head: true }).eq('tenant_id', id),
    supabaseAdmin.from('profiles').select('id', { count: 'exact', head: true }).eq('tenant_id', id).eq('is_active', true),
    supabaseAdmin.from('branches').select('id', { count: 'exact', head: true }).eq('tenant_id', id),
    supabaseAdmin.from('support_tickets').select('id', { count: 'exact', head: true }).eq('tenant_id', id),
  ])
  return NextResponse.json({ success: true, tenant: { id: tenant.id, name: tenant.name, createdAt: tenant.created_at, accessActive: (activeResult.count || 0) > 0, userCount: usersResult.count || 0, branchCount: branchesResult.count || 0, ticketCount: ticketsResult.count || 0, administrators: (adminsResult.data || []).map((admin) => ({ fullName: admin.full_name, username: admin.username, email: admin.contact_email, phone: admin.phone, role: admin.role, isActive: admin.is_active, createdAt: admin.created_at })) } }, { headers: { 'Cache-Control': 'no-store' } })
}
