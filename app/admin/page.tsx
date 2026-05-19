import { redirect } from 'next/navigation'
import { isFullAdmin } from '@/lib/permissions'
import { createSupabaseServerClient } from '@/lib/supabase/server'

export default async function AdminIndexPage() {
  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/')
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle()

  if (profile?.role === 'employee') {
    redirect('/admin/orders')
  }

  if (!isFullAdmin(profile?.role)) {
    redirect('/')
  }

  redirect('/admin/dashboard')
}
