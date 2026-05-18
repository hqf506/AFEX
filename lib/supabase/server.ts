import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { getSupabaseCookieOptions } from '@/lib/supabase/cookie-options'

function getSupabaseEnv() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!supabaseUrl) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL is missing')
  }

  if (!supabaseAnonKey) {
    throw new Error('NEXT_PUBLIC_SUPABASE_ANON_KEY is missing')
  }

  return {
    supabaseUrl,
    supabaseAnonKey,
  }
}

export async function createSupabaseServerClient() {
  const { supabaseUrl, supabaseAnonKey } = getSupabaseEnv()
  const cookieStore = await cookies()
  const cookieOptions = getSupabaseCookieOptions()

  return createServerClient(supabaseUrl, supabaseAnonKey, {
    cookieOptions,
    cookies: {
      getAll() {
        return cookieStore.getAll()
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, {
              ...(options ?? {}),
              secure: process.env.NODE_ENV === 'production',
              sameSite: 'lax',
              path: '/',
            })
          })
        } catch {
          // Server Components cannot mutate cookies during render.
        }
      },
    },
  })
}
