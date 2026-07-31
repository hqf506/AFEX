import 'server-only'

export class CoreV2ContractValidationError extends Error {
  constructor(
    readonly code: string,
    readonly field: string,
    message: string
  ) {
    super(message)
    this.name = 'CoreV2ContractValidationError'
  }
}
