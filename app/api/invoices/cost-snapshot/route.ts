import { NextRequest } from 'next/server'
import { requireApiAuth, withAuthCookies } from '@/lib/api-auth'
import { jsonResponse } from '@/lib/api/responses'
import {
  createInvoiceCostSnapshot,
  InvoiceCostSnapshotError,
} from '@/lib/invoices/create-cost-snapshot'
import { supabaseAdmin } from '@/lib/supabase/admin'

type SnapshotCostBody = {
  invoice_id?: string
  items?: unknown[]
}

export async function POST(request: NextRequest) {
  const auth = await requireApiAuth(request, ['admin', 'employee', 'cashier'])

  if (!auth.ok) {
    return auth.response
  }

  try {
    const tenantId = auth.profile.tenant_id

    if (!tenantId) {
      return withAuthCookies(
        auth.response,
        jsonResponse({ error: 'تعذر تحديد نطاق المنشأة' }, 403)
      )
    }

    const body = (await request.json()) as SnapshotCostBody
    const invoiceId =
      typeof body.invoice_id === 'string' ? body.invoice_id.trim() : ''

    if (!invoiceId) {
      return withAuthCookies(
        auth.response,
        jsonResponse({ error: 'رقم الفاتورة الداخلي مطلوب' }, 400)
      )
    }

    if (Array.isArray(body.items) && body.items.length === 0) {
      return withAuthCookies(
        auth.response,
        jsonResponse({ success: true, updated: 0 })
      )
    }

    const { updated } = await createInvoiceCostSnapshot({
      supabase: supabaseAdmin,
      tenantId,
      invoiceId,
    })

    return withAuthCookies(
      auth.response,
      jsonResponse({
        success: true,
        updated,
      })
    )
  } catch (error) {
    const status =
      error instanceof InvoiceCostSnapshotError &&
      error.code === 'INVOICE_NOT_FOUND'
        ? 404
        : 500

    return withAuthCookies(
      auth.response,
      jsonResponse(
        {
          error: 'تعذر حفظ لقطة تكلفة الفاتورة',
          code:
            error instanceof InvoiceCostSnapshotError
              ? error.code
              : 'UNKNOWN_COST_SNAPSHOT_FAILURE',
        },
        status
      )
    )
  }
}
