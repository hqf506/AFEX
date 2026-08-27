import { NextRequest } from 'next/server'

import { jsonWithAuthCookies } from '@/lib/api/responses'
import { requireApiAuth } from '@/lib/api-auth'
import {
  buildSelectedCustomerProfile,
  normalizeSaudiCustomerPhone,
  type CustomerProfileBaseSource,
} from '@/lib/customers'
import { applyTenantFilter } from '@/lib/tenant-filter'

type CustomerInvoiceActivityRow = {
  order_id: string | null
  created_at: string | null
  total: number | string | null
  payment_status: string | null
  cash_received: number | string | null
  remaining_from_customer: number | string | null
}

const CUSTOMER_ACTIVITY_ROW_LIMIT = 500
const CUSTOMER_PROFILE_SELECT =
  'id, customer_code, name, phone, display_phone, email, city, address, notes, created_at'

export const dynamic = 'force-dynamic'

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value
  )
}

function readNumber(value: number | string | null | undefined) {
  const number = typeof value === 'number' ? value : Number(value || 0)
  return Number.isFinite(number) ? number : 0
}

function getAuthorizedPaidAmount(invoice: CustomerInvoiceActivityRow) {
  const status = `${invoice.payment_status || ''}`.toLowerCase()

  if (status === 'cancelled' || status === 'canceled') return 0

  const total = Math.max(readNumber(invoice.total), 0)
  const remaining = Math.max(readNumber(invoice.remaining_from_customer), 0)

  if (remaining > 0) {
    return Math.min(total, Math.max(total - remaining, 0))
  }

  const cashReceived = Math.max(readNumber(invoice.cash_received), 0)
  if (cashReceived > 0) return Math.min(total, cashReceived)

  return status === 'paid' ? total : 0
}

function logProfileFailure(input: {
  stage: 'customer' | 'activity' | 'last-order' | 'unexpected'
  code?: string | null
  correlationId?: string | null
}) {
  console.warn('[api/customers/profile] request failed', {
    stage: input.stage,
    classification: `CUSTOMER_PROFILE_${input.stage.toUpperCase().replace('-', '_')}_FAILED`,
    upstreamCode: input.code || 'UNCLASSIFIED',
    correlationId: input.correlationId || null,
  })
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ customerId: string }> }
) {
  const auth = await requireApiAuth(request, ['admin', 'employee', 'cashier'])

  if (!auth.ok) return auth.response

  const tenantId = auth.profile.tenant_id
  const { customerId } = await params

  if (!tenantId) {
    return jsonWithAuthCookies(
      auth.response,
      { success: false, code: 'CUSTOMER_PROFILE_AUTHORIZATION_FAILED' },
      403
    )
  }

  if (!isUuid(customerId)) {
    return jsonWithAuthCookies(
      auth.response,
      { success: false, code: 'CUSTOMER_PROFILE_NOT_FOUND' },
      404
    )
  }

  try {
    let customerQuery = auth.supabase
      .from('customers')
      .select(CUSTOMER_PROFILE_SELECT)
      .eq('id', customerId)
      .limit(1)

    // Customer selection is tenant-wide in the existing POS contract. Do not
    // accept tenant or branch authority from the browser or narrow it differently.
    customerQuery = applyTenantFilter(customerQuery, tenantId)

    const customerResult = await customerQuery.maybeSingle()

    if (customerResult.error) {
      logProfileFailure({
        stage: 'customer',
        code: customerResult.error.code,
        correlationId: auth.context.correlationId,
      })
      return jsonWithAuthCookies(
        auth.response,
        { success: false, code: 'CUSTOMER_PROFILE_LOAD_FAILED' },
        500
      )
    }

    if (!customerResult.data) {
      return jsonWithAuthCookies(
        auth.response,
        { success: false, code: 'CUSTOMER_PROFILE_NOT_FOUND' },
        404
      )
    }

    const normalizedPhone = normalizeSaudiCustomerPhone(
      customerResult.data.display_phone || customerResult.data.phone
    )
    let recordVersion: number | null = null
    if (normalizedPhone) {
      const versionResult = await auth.supabase.rpc(
        'lookup_customer_phone_identity_v1',
        {
          p_tenant_id: tenantId,
          p_normalized_phone: normalizedPhone,
          p_branch_id: null,
        }
      )
      const versionRow = Array.isArray(versionResult.data)
        ? versionResult.data.find(
            (candidate) =>
              candidate &&
              typeof candidate === 'object' &&
              'customer_id' in candidate &&
              candidate.customer_id === customerId
          )
        : null
      const numericVersion = Number(
        versionRow &&
          typeof versionRow === 'object' &&
          'record_version' in versionRow
          ? versionRow.record_version
          : NaN
      )
      if (Number.isSafeInteger(numericVersion) && numericVersion >= 1) {
        recordVersion = numericVersion
      } else if (versionResult.error) {
        logProfileFailure({
          stage: 'customer',
          code: versionResult.error.code,
          correlationId: auth.context.correlationId,
        })
      }
    }

    let activityQuery = auth.supabase
      .from('invoices')
      .select(
        'order_id, created_at, total, payment_status, cash_received, remaining_from_customer',
        { count: 'exact' }
      )
      .eq('customer_id', customerId)
      .order('created_at', { ascending: false })
      .limit(CUSTOMER_ACTIVITY_ROW_LIMIT)

    activityQuery = applyTenantFilter(activityQuery, tenantId)
    const activityResult = await activityQuery
    const activityRows = Array.isArray(activityResult.data)
      ? (activityResult.data as CustomerInvoiceActivityRow[])
      : []

    let visitCount: number | null = null
    let totalSpending: number | null = null
    let lastOrderNumber: string | null = null
    let lastOrderAt: string | null = null

    if (activityResult.error) {
      logProfileFailure({
        stage: 'activity',
        code: activityResult.error.code,
        correlationId: auth.context.correlationId,
      })
    } else {
      visitCount =
        typeof activityResult.count === 'number'
          ? activityResult.count
          : activityRows.length
      lastOrderAt = activityRows[0]?.created_at || null

      if (visitCount <= CUSTOMER_ACTIVITY_ROW_LIMIT) {
        totalSpending = activityRows.reduce(
          (sum, invoice) => sum + getAuthorizedPaidAmount(invoice),
          0
        )
      }

      const latestOrderId = activityRows[0]?.order_id

      if (latestOrderId) {
        let orderQuery = auth.supabase
          .from('orders')
          .select('order_number')
          .eq('id', latestOrderId)
          .limit(1)
        orderQuery = applyTenantFilter(orderQuery, tenantId)
        const orderResult = await orderQuery.maybeSingle()

        if (orderResult.error) {
          logProfileFailure({
            stage: 'last-order',
            code: orderResult.error.code,
            correlationId: auth.context.correlationId,
          })
        } else {
          lastOrderNumber =
            typeof orderResult.data?.order_number === 'string'
              ? orderResult.data.order_number
              : null
        }
      }
    }

    const profile = buildSelectedCustomerProfile(
      {
        ...(customerResult.data as CustomerProfileBaseSource),
        record_version: recordVersion,
      },
      { visitCount, totalSpending, lastOrderNumber, lastOrderAt }
    )

    if (!profile) {
      logProfileFailure({
        stage: 'customer',
        code: 'INVALID_PROFILE_SHAPE',
        correlationId: auth.context.correlationId,
      })
      return jsonWithAuthCookies(
        auth.response,
        { success: false, code: 'CUSTOMER_PROFILE_LOAD_FAILED' },
        500
      )
    }

    const response = jsonWithAuthCookies(auth.response, {
      success: true,
      profile,
    })
    response.headers.set('Cache-Control', 'private, no-store')
    return response
  } catch {
    logProfileFailure({
      stage: 'unexpected',
      correlationId: auth.context.correlationId,
    })
    return jsonWithAuthCookies(
      auth.response,
      { success: false, code: 'CUSTOMER_PROFILE_LOAD_FAILED' },
      500
    )
  }
}
