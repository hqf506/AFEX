import 'server-only'

declare const identityBrand: unique symbol

type BrandedIdentity<Name extends string> = string & {
  readonly [identityBrand]: Name
}

export type TenantId = BrandedIdentity<'TenantId'>
export type BranchId = BrandedIdentity<'BranchId'>
export type ActorId = BrandedIdentity<'ActorId'>
export type CommandId = BrandedIdentity<'CommandId'>
export type LedgerId = BrandedIdentity<'LedgerId'>
export type CorrelationId = BrandedIdentity<'CorrelationId'>
export type ReplayRequestId = BrandedIdentity<'ReplayRequestId'>
export type OutboxEventId = BrandedIdentity<'OutboxEventId'>
export type AuthorizationContextId = BrandedIdentity<'AuthorizationContextId'>
