import { NextResponse } from 'next/server'
import { requireDeveloperAccess } from '@/lib/developer/server'
import { supabaseAdmin } from '@/lib/supabase/admin'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export async function POST(request: Request) {
  const access = await requireDeveloperAccess()
  if (!access.ok) {
    return NextResponse.json({ success: false, error: access.status === 401 ? 'يجب تسجيل الدخول.' : 'غير مصرح بهذا الإجراء.' }, { status: access.status })
  }

  let body: { userId?: unknown; isActive?: unknown; reason?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ success: false, error: 'بيانات الطلب غير صالحة.' }, { status: 400 })
  }

  const userId = typeof body.userId === 'string' ? body.userId : ''
  const isActive = body.isActive
  const reason = typeof body.reason === 'string' ? body.reason.trim().slice(0, 500) : ''
  if (!UUID_PATTERN.test(userId) || typeof isActive !== 'boolean' || (!isActive && reason.length < 3)) {
    return NextResponse.json({ success: false, error: 'تحقق من الحساب والحالة وسبب الإيقاف.' }, { status: 400 })
  }
  if (userId === access.user.id) {
    return NextResponse.json({ success: false, error: 'لا يمكنك تغيير حالة حسابك الحالي.' }, { status: 409 })
  }

  const [{ data: profile }, { data: platformAdmin }] = await Promise.all([
    supabaseAdmin.from('profiles').select('id, tenant_id, branch_id, is_active').eq('id', userId).maybeSingle(),
    supabaseAdmin.from('platform_admins').select('role, is_active').eq('user_id', userId).maybeSingle(),
  ])
  if (!profile) return NextResponse.json({ success: false, error: 'الحساب غير موجود.' }, { status: 404 })
  if (profile.is_active === isActive && (!platformAdmin || platformAdmin.is_active === isActive)) {
    return NextResponse.json({ success: true })
  }

  if (!isActive && platformAdmin?.role === 'provider_owner' && platformAdmin.is_active) {
    const { count } = await supabaseAdmin.from('platform_admins').select('user_id', { count: 'exact', head: true }).eq('role', 'provider_owner').eq('is_active', true)
    if ((count || 0) <= 1) {
      return NextResponse.json({ success: false, error: 'لا يمكن إيقاف آخر مالك منصة نشط.' }, { status: 409 })
    }
  }

  const previousProfileState = profile.is_active
  const previousAdminState = platformAdmin?.is_active
  const { error: profileError } = await supabaseAdmin.from('profiles').update({ is_active: isActive, updated_at: new Date().toISOString() }).eq('id', userId)
  if (profileError) return NextResponse.json({ success: false, error: 'تعذر تحديث حالة الحساب.' }, { status: 500 })

  if (platformAdmin) {
    const { error: adminError } = await supabaseAdmin.from('platform_admins').update({ is_active: isActive }).eq('user_id', userId)
    if (adminError) {
      await supabaseAdmin.from('profiles').update({ is_active: previousProfileState }).eq('id', userId)
      return NextResponse.json({ success: false, error: 'تعذر تحديث صلاحية حساب المنصة.' }, { status: 500 })
    }
  }

  const { data: actorProfile } = await supabaseAdmin.from('profiles').select('id').eq('id', access.user.id).maybeSingle()
  const { error: auditError } = await supabaseAdmin.from('audit_logs').insert({
    tenant_id: profile.tenant_id,
    branch_id: profile.branch_id,
    actor_user_id: actorProfile?.id || null,
    action: isActive ? 'developer.user_activated' : 'developer.user_deactivated',
    entity_type: 'profile',
    entity_id: userId,
    metadata: { reason: isActive ? 'إعادة تفعيل من مركز المطور' : reason },
  })
  if (auditError) {
    await supabaseAdmin.from('profiles').update({ is_active: previousProfileState }).eq('id', userId)
    if (platformAdmin && typeof previousAdminState === 'boolean') await supabaseAdmin.from('platform_admins').update({ is_active: previousAdminState }).eq('user_id', userId)
    return NextResponse.json({ success: false, error: 'تعذر حفظ سجل التدقيق؛ لم يُعتمد التغيير.' }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
