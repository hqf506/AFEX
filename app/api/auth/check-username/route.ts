import { jsonResponse } from '@/lib/api/responses'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { normalizeUsername } from '@/lib/usernames'
import { hasTrimmedString } from '@/lib/api/validation'

type Body = {
  username?: string
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Body
    const username = normalizeUsername(body.username || '')

    if (!hasTrimmedString(username)) {
      return jsonResponse(
        { error: 'اسم المستخدم مطلوب' }, 400)
    }

    const { data, error } = await supabaseAdmin
      .from('profiles')
      .select('id, username, is_active')
      .eq('username', username)
      .maybeSingle()

    if (error) {
      return jsonResponse(
        {
          error: 'تعذر التحقق من اسم المستخدم',
          details: error.message,
        }, 500)
    }

    return jsonResponse({
      exists: !!data,
      user: data || null,
    })
  } catch (error) {
    return jsonResponse(
      {
        error: 'حدث خطأ غير متوقع',
        details: error instanceof Error ? error.message : 'Unknown error',
      }, 500)
  }
}
