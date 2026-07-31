import 'server-only'

import type { CommandId, CorrelationId, LedgerId } from './identities'

export const SAFE_ERROR_CODE_MAX_LENGTH = 64
export const SAFE_ARABIC_MESSAGE_MAX_LENGTH = 512
export const SAFE_CORRELATION_ID_MAX_LENGTH = 128

export type SafeExternalError = Readonly<{
  code: string
  messageAr: string
  retryable: boolean
  correlationId: CorrelationId
  httpStatus: number
}>

export type InternalDiagnosticError = Readonly<{
  classification: string
  correlationId: CorrelationId
  commandId: CommandId | null
  ledgerId: LedgerId | null
  retryAssessment: 'retryable' | 'terminal' | 'unknown'
  cause?: unknown
  stack?: string
  database?: Readonly<{
    sqlState?: string
    message?: string
    constraint?: string
    function?: string
    table?: string
    role?: string
  }>
}>
