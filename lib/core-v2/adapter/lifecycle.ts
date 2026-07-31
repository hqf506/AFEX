import 'server-only'

export const TRUSTED_ADAPTER_LIFECYCLE_STATES = Object.freeze([
  'disabled',
  'configuration_unavailable',
  'ready_for_transport',
  'acquiring_connection',
  'transaction_started',
  'identity_verified_before_activation',
  'role_activated',
  'identity_verified_after_activation',
  'acquisition_executed',
  'transaction_committed',
  'transaction_rolled_back',
  'cleanup_verified',
  'connection_quarantined',
  'failed_closed',
] as const)

export type TrustedAdapterLifecycleState =
  (typeof TRUSTED_ADAPTER_LIFECYCLE_STATES)[number]
