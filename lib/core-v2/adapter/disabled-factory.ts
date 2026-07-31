import 'server-only'

import type { TrustedAcquisitionTransport } from './transport'

export const CORE_V2_ADAPTER_DISABLED = 'CORE_V2_ADAPTER_DISABLED' as const

export class CoreV2AdapterDisabledError extends Error {
  readonly code = CORE_V2_ADAPTER_DISABLED

  constructor() {
    super('Core V2 trusted acquisition adapter is disabled.')
    this.name = 'CoreV2AdapterDisabledError'
  }
}

const DISABLED_TRANSPORT: TrustedAcquisitionTransport = Object.freeze({
  acquire: async () => {
    throw new CoreV2AdapterDisabledError()
  },
})

export function createHardDisabledTrustedAdapter(): TrustedAcquisitionTransport {
  return DISABLED_TRANSPORT
}
