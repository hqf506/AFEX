import { supabaseAdmin } from '@/lib/supabase/admin'
import { maskId } from '@/lib/security/redaction'
import type {
  MetaCompatibleProviderConfig,
  UltraMsgProviderConfig,
  WhatsAppProviderConfig,
} from '@/lib/whatsapp/types'

type BranchWhatsAppConfigDbRow = {
  provider: 'ultramsg' | 'meta'
  phone_number: string
  instance_id: string
  token: string
  api_url: string
  is_active: boolean
}

export async function getBranchWhatsAppProviderConfig(
  branchId: string | null | undefined,
  tenantId: string | null | undefined
): Promise<WhatsAppProviderConfig | null> {
  const normalizedBranchId = typeof branchId === 'string' ? branchId.trim() : ''
  const normalizedTenantId = typeof tenantId === 'string' ? tenantId.trim() : ''

  if (!normalizedBranchId || !normalizedTenantId) {
    return null
  }

  const { data, error } = await supabaseAdmin
    .from('branch_whatsapp_configs')
    .select('provider, phone_number, instance_id, token, api_url, is_active')
    .eq('branch_id', normalizedBranchId)
    .eq('tenant_id', normalizedTenantId)
    .maybeSingle()

  if (error) {
    throw new Error(error.message)
  }

  const config = data as BranchWhatsAppConfigDbRow | null

  console.info({
    scope: 'whatsapp-config-lookup',
    branchIdPresent: Boolean(normalizedBranchId),
    tenantIdMasked: maskId(normalizedTenantId),
    branchIdMasked: maskId(normalizedBranchId),
    configFound: Boolean(config),
    provider: config?.provider || null,
    isActive: config?.is_active ?? null,
    hasToken: Boolean(config?.token?.trim()),
    hasInstanceId: Boolean(config?.instance_id?.trim()),
    hasApiUrl: Boolean(config?.api_url?.trim()),
  })

  if (!config || !config.is_active) {
    return null
  }

  if (config.provider === 'meta') {
    const metaConfig: MetaCompatibleProviderConfig = {
      providerKey: 'meta',
      apiUrl: config.api_url.trim(),
      accessToken: config.token.trim(),
      phoneNumberId: config.instance_id.trim(),
    }

    return metaConfig
  }

  const ultraMsgConfig: UltraMsgProviderConfig = {
    providerKey: 'ultramsg',
    apiUrl: config.api_url.trim(),
    token: config.token.trim(),
  }

  return ultraMsgConfig
}
