export type ProfilePresentationAuthorityScope = Readonly<{
  primaryProfileId: string
  tenantId: string
  primaryBranchId: string | null
  posEmployeeId: string | null
  posEmployeeBranchId: string | null
  posSessionGeneration: number
}>

export function createProfilePresentationScopeKey(
  scope: ProfilePresentationAuthorityScope
) {
  if (
    !scope.primaryProfileId ||
    !scope.tenantId ||
    !Number.isSafeInteger(scope.posSessionGeneration) ||
    scope.posSessionGeneration < 0
  ) {
    throw new Error('PROFILE_PRESENTATION_SCOPE_INVALID')
  }

  return JSON.stringify([
    scope.primaryProfileId,
    scope.tenantId,
    scope.primaryBranchId,
    scope.posEmployeeId,
    scope.posEmployeeBranchId,
    scope.posSessionGeneration,
  ])
}
