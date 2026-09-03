import { NextRequest } from 'next/server'
import { requireAuthorizationContext } from '@/lib/authorization-context'
import { jsonWithAuthCookies } from '@/lib/api/responses'

export async function GET(request: NextRequest) {
  const authorization = await requireAuthorizationContext(request, [
    'admin',
    'employee',
    'cashier',
  ])
  if (!authorization.ok) return authorization.response

  const { context } = authorization
  if (!context.tenantId || !context.activeBranchId) {
    const response = jsonWithAuthCookies(
      authorization.response,
      { success: false, error: 'OFFLINE_CONTEXT_SCOPE_REQUIRED' },
      409
    )
    response.headers.set('Cache-Control', 'no-store')
    return response
  }

  const response = jsonWithAuthCookies(
    authorization.response,
    {
      success: true,
      context: {
        primarySubjectId: context.user.id,
        tenantId: context.tenantId,
        branchId: context.activeBranchId,
        contextVersion: 1,
        actorAuthority: context.posEmployee
          ? 'active-pos-actor'
          : 'primary-auth-only',
      },
    },
    200
  )
  response.headers.set('Cache-Control', 'no-store')
  return response
}
