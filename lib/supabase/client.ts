import { createBrowserClient } from '@supabase/ssr'

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

type SupabaseBrowserClient = ReturnType<typeof createBrowserClient>

declare global {
  var __leatherFixSupabaseClient: SupabaseBrowserClient | undefined
}

function createSupabaseBrowserClient() {
  const { supabaseUrl, supabaseAnonKey } = getSupabaseEnv()
  return createBrowserClient(supabaseUrl, supabaseAnonKey)
}

export const supabase =
  globalThis.__leatherFixSupabaseClient ?? createSupabaseBrowserClient()

if (typeof window !== 'undefined') {
  globalThis.__leatherFixSupabaseClient = supabase
}
