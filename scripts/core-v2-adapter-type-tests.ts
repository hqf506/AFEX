import type {
  AuthorizationContextAcquisitionInput,
  P2D20RawAcquisitionRow,
} from '../lib/core-v2/contracts/authorization'
import type {
  TrustedAcquisitionInput,
  TrustedAcquisitionRawResult,
  TrustedAcquisitionTransport,
} from '../lib/core-v2/adapter'

type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends
  (<T>() => T extends B ? 1 : 2) ? true : false
type Expect<T extends true> = T

type InputIsFrozenContract = Expect<
  Equal<TrustedAcquisitionInput, AuthorizationContextAcquisitionInput>
>
type OutputIsFrozenContract = Expect<
  Equal<TrustedAcquisitionRawResult, P2D20RawAcquisitionRow>
>
type ExactInputKeys = Expect<
  Equal<
    keyof TrustedAcquisitionInput,
    | 'authenticatedActorId'
    | 'tenantId'
    | 'branchId'
    | 'idempotencyKey'
    | 'correlationReference'
    | 'canonicalPayload'
    | 'fingerprintProjection'
    | 'retainUntil'
  >
>
type ExactTransportKeys = Expect<
  Equal<keyof TrustedAcquisitionTransport, 'acquire'>
>

void (0 as unknown as InputIsFrozenContract)
void (0 as unknown as OutputIsFrozenContract)
void (0 as unknown as ExactInputKeys)
void (0 as unknown as ExactTransportKeys)
