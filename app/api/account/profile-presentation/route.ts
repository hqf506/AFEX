import { NextRequest, NextResponse } from 'next/server'
import { withAuthCookies } from '@/lib/api-auth'
import { requireAuthorizationContext } from '@/lib/authorization-context'
import { createProfilePresentation } from '@/lib/account/profile-presentation'

const PRIVATE_IDENTITY_CACHE_CONTROL = 'private, no-store, max-age=0'

function finishResponse(
  response: NextResponse,
  authResponse?: NextResponse
) {
  response.headers.set('Cache-Control', PRIVATE_IDENTITY_CACHE_CONTROL)
  response.headers.set('Vary', 'Cookie')
  return authResponse ? withAuthCookies(authResponse, response) : response
}

function safeError(message: string, status: number, authResponse?: NextResponse) {
  return finishResponse(NextResponse.json({ error: message }, { status }), authResponse)
}

export async function GET(request: NextRequest) {
  if ([...request.nextUrl.searchParams.keys()].length > 0) {
    return safeError('لا يسمح بتحديد حساب أو منشأة أو فرع من هذا الطلب.', 400)
  }

  const auth = await requireAuthorizationContext(request)
  if (!auth.ok) {
    const status = auth.response.status === 403 ? 403 : 401
    return safeError(
      status === 403
        ? 'الحساب غير نشط أو غير مصرح له بعرض هذه البيانات.'
        : 'يجب تسجيل الدخول لعرض بيانات الحساب.',
      status,
      auth.response
    )
  }

  const { context, supabase } = auth
  const tenantId = context.tenantId
  const branchId = context.activeBranchId

  const [tenantResult, branchResult, posProfileResult] = await Promise.all([
    tenantId
      ? supabase
          .from('tenants')
          .select('name')
          .eq('id', tenantId)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    tenantId && branchId
      ? supabase
          .from('branches')
          .select('name')
          .eq('tenant_id', tenantId)
          .eq('id', branchId)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    context.posEmployee && tenantId
      ? supabase
          .from('pos_profiles')
          .select('username, full_name')
          .eq('tenant_id', tenantId)
          .eq('id', context.posEmployee.id)
          .eq('is_active', true)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ])

  if (tenantResult.error || branchResult.error || posProfileResult.error) {
    return safeError(
      'تعذر تحميل بيانات العرض الآمنة حاليًا.',
      503,
      auth.response
    )
  }

  const actorPresentation = posProfileResult.data
  const presentation = createProfilePresentation({
    username: actorPresentation?.username ?? context.profile.username,
    full_name: actorPresentation?.full_name ?? context.profile.full_name,
    contact_email: context.posEmployee ? null : context.profile.contact_email,
    phone: context.posEmployee ? null : context.profile.phone,
    tenant_name: tenantResult.data?.name ?? null,
    branch_name: branchResult.data?.name ?? null,
    ui_capabilities: context.capabilities,
  })

  return finishResponse(NextResponse.json(presentation), auth.response)
}
