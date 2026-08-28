export const OFFLINE_EMPLOYEE_SUBSTITUTION_REJECTED =
  'OFFLINE_EMPLOYEE_SUBSTITUTION_REJECTED' as const

export function buildScopedOnlinePinIdentification(
  pin: string,
  preparedBranchId: string | null
) {
  if (!preparedBranchId) {
    throw new Error('OFFLINE_EMPLOYEE_SELECTION_BRANCH_REQUIRED')
  }

  return Object.freeze({
    pin,
    branchId: preparedBranchId,
  })
}

export function assertSelectedEmployeeMatchesPreparedBranch(
  selectedEmployeeBranchId: string | null,
  preparedBranchId: string
) {
  if (
    !selectedEmployeeBranchId ||
    selectedEmployeeBranchId !== preparedBranchId
  ) {
    throw new Error(OFFLINE_EMPLOYEE_SUBSTITUTION_REJECTED)
  }
}
