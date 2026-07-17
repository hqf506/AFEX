import 'server-only'
import { createHmac, timingSafeEqual } from 'node:crypto'
import { supabaseAdmin } from '@/lib/supabase/admin'

export type ProviderAgent = {
  userId: string
  key: string
  name: string
}

function assignmentKey(userId: string) {
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!secret) throw new Error('Provider assignment secret is unavailable')
  return createHmac('sha256', secret).update(`support-assignment:${userId}`).digest('hex')
}

function matchesAssignmentKey(expected: string, received: string) {
  if (!/^[a-f0-9]{64}$/.test(received)) return false
  const expectedBuffer = Buffer.from(expected, 'hex')
  const receivedBuffer = Buffer.from(received, 'hex')
  return expectedBuffer.length === receivedBuffer.length && timingSafeEqual(expectedBuffer, receivedBuffer)
}

function safeDisplayName(value: unknown, fallback: string) {
  if (typeof value !== 'string') return fallback
  const normalized = value.trim().slice(0, 100)
  return normalized || fallback
}

export async function getActiveProviderAgents() {
  const { data, error } = await supabaseAdmin
    .from('platform_admins')
    .select('user_id, role')
    .eq('is_active', true)
  if (error) throw error

  return Promise.all((data || []).map(async (provider): Promise<ProviderAgent> => {
    const { data: authUser } = await supabaseAdmin.auth.admin.getUserById(provider.user_id)
    const fallback = provider.role === 'provider_owner' ? 'مسؤول دعم AFEX' : 'موظف دعم AFEX'
    const metadata = authUser.user?.user_metadata
    const name = safeDisplayName(metadata?.full_name ?? metadata?.name, fallback)
    return { userId: provider.user_id, key: assignmentKey(provider.user_id), name }
  }))
}

export async function resolveProviderAssignment(key: unknown, currentUserId: string) {
  if (key === 'unassigned') return { userId: null, agents: await getActiveProviderAgents() }
  const agents = await getActiveProviderAgents()
  if (key === 'me') {
    const current = agents.find((agent) => agent.userId === currentUserId)
    return current ? { userId: current.userId, agents } : null
  }
  if (typeof key !== 'string') return null
  const selected = agents.find((agent) => matchesAssignmentKey(agent.key, key))
  return selected ? { userId: selected.userId, agents } : null
}
