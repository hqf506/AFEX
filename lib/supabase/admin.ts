import 'server-only'

import { createClient, type SupabaseClient } from '@supabase/supabase-js'

// Keep the same schema-agnostic client contract that createClient inferred
// before initialization became lazy.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseAdminClient = SupabaseClient<any>

let adminClient: SupabaseAdminClient | null = null

function getSupabaseAdminClient() {
  if (adminClient) return adminClient

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL is missing')
  }

  if (!serviceRoleKey) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY is missing')
  }

  adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })

  return adminClient
}

export const supabaseAdmin = new Proxy({} as SupabaseAdminClient, {
  get(_target, property) {
    const client = getSupabaseAdminClient()
    const value = Reflect.get(client, property, client)
    return typeof value === 'function' ? value.bind(client) : value
  },
})
