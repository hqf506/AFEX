import 'server-only'

import type {
  TrustedAcquisitionInput,
  TrustedAcquisitionRawResult,
} from './contracts'

export interface TrustedAcquisitionTransport {
  acquire(
    input: TrustedAcquisitionInput
  ): Promise<TrustedAcquisitionRawResult>
}
