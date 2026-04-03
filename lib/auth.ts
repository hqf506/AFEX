import { getRoleLabel, type AppRole } from '@/lib/app-roles'
import { supabase } from '@/lib/supabase/client'

export type CurrentUserProfile = {
  id: string
  email: string
  role: AppRole
  full_name: string
}

export async function getCurrentUserProfile(): Promise<CurrentUserProfile | null> {
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser()

  if (userError || !user) {
    return null
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('full_name, role')
    .eq('id', user.id)
    .single()

  if (profileError || !profile?.role) {
    return null
  }

  return {
    id: user.id,
    email: user.email || '',
    role: profile.role as AppRole,
    full_name: profile.full_name || '',
  }
}

export { getRoleLabel }
