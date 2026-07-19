import { NextRequest } from 'next/server'
import { jsonResponse } from '@/lib/api/responses'
import {
  clearRecoveryContext,
  hasValidRecoveryContext,
} from '@/lib/auth/recovery'
import {
  hasValidAdminPasswordLength,
  normalizeAdminPassword,
} from '@/lib/admin/users'
import { createSupabaseServerClient } from '@/lib/supabase/server'

type CompleteRecoveryBody = {
  password?: string
  confirmation?: string
}

const INVALID_RECOVERY_MESSAGE =
  'رابط إعادة تعيين كلمة المرور غير صالح أو انتهت صلاحيته. اطلب رابطًا جديدًا.'

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as CompleteRecoveryBody | null
  if (
    !body ||
    typeof body !== 'object' ||
    Array.isArray(body) ||
    Object.keys(body).some((key) => !['password', 'confirmation'].includes(key))
  ) {
    return jsonResponse({ success: false, error: 'بيانات كلمة المرور غير صالحة.' }, 400)
  }

  const password = normalizeAdminPassword(body.password)
  const confirmation = normalizeAdminPassword(body.confirmation)
  if (!hasValidAdminPasswordLength(password)) {
    return jsonResponse({ success: false, error: 'كلمة المرور يجب أن تكون 6 أحرف أو أكثر.' }, 400)
  }
  if (password !== confirmation) {
    return jsonResponse({ success: false, error: 'كلمتا المرور غير متطابقتين.' }, 400)
  }

  const supabase = await createSupabaseServerClient()
  const { data: { user }, error: userError } = await supabase.auth.getUser()
  if (userError || !user || !(await hasValidRecoveryContext(user.id))) {
    await clearRecoveryContext()
    return jsonResponse({ success: false, error: INVALID_RECOVERY_MESSAGE }, 401)
  }

  const { error: updateError } = await supabase.auth.updateUser({ password })
  if (updateError) {
    return jsonResponse(
      { success: false, error: 'تعذر تحديث كلمة المرور. اطلب رابطًا جديدًا وحاول مرة أخرى.' },
      400
    )
  }

  await clearRecoveryContext()
  await supabase.auth.signOut({ scope: 'local' }).catch(() => undefined)
  return jsonResponse({ success: true })
}
