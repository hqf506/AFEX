import { NextRequest } from 'next/server'
import { jsonWithAuthCookies } from '@/lib/api/responses'
import { requireSupportAuth } from '@/lib/support/server'
import { supabaseAdmin } from '@/lib/supabase/admin'

async function countBy(column: string, value: string) {
  const { count, error } = await supabaseAdmin.from('support_tickets').select('id', { count: 'exact', head: true }).eq(column, value)
  if (error) throw error
  return count || 0
}

export async function GET(request: NextRequest) {
  const auth = await requireSupportAuth(request)
  if (!auth.ok) return auth.response
  if (!auth.isProvider) return jsonWithAuthCookies(auth.response, { success: false, error: 'لا تملك صلاحية الوصول إلى هذه التذكرة.' }, 403)
  try {
    const [newCount, investigating, waitingCustomer, critical, totalOpenResult] = await Promise.all([
      countBy('status', 'new'),
      countBy('status', 'investigating'),
      countBy('status', 'waiting_customer'),
      countBy('priority', 'critical'),
      supabaseAdmin.from('support_tickets').select('id', { count: 'exact', head: true }).in('status', ['new', 'investigating', 'waiting_customer']),
    ])
    if (totalOpenResult.error) throw totalOpenResult.error
    return jsonWithAuthCookies(auth.response, { success: true, summary: { new: newCount, investigating, waiting_customer: waitingCustomer, critical, total_open: totalOpenResult.count || 0 } })
  } catch {
    return jsonWithAuthCookies(auth.response, { success: false, error: 'تعذر تحميل تذاكر الدعم.' }, 500)
  }
}
