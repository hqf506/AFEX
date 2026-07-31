import 'server-only'

import type {
  AuthorizationContextAcquisitionInput,
  P2D20RawAcquisitionRow,
} from '../contracts/authorization'

export const P2D20_ACQUISITION_FUNCTION =
  'public.acquire_atomic_order_command_v1' as const

export type TrustedAcquisitionInput = AuthorizationContextAcquisitionInput
export type TrustedAcquisitionRawResult = P2D20RawAcquisitionRow
