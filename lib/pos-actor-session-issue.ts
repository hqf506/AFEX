export type ActorSessionIssueClassification =
  | 'RPC_TRANSPORT_ERROR'
  | 'RPC_DATABASE_ERROR'
  | 'RPC_CONTRACT_INVALID'
  | 'RPC_EMPTY_RESULT'
  | 'RPC_MULTIPLE_ROWS'
  | 'ACTOR_SESSION_ISSUED'

export type ActorSessionRowCountClassification =
  | 'ZERO'
  | 'ONE'
  | 'MULTIPLE'
  | 'INVALID'

type SafeRpcError = {
  code?: unknown
  status?: unknown
}

type ActorSessionResultRow = {
  session_id?: unknown
  expires_at?: unknown
  actor_id?: unknown
  tenant_id?: unknown
  branch_id?: unknown
  actor_role?: unknown
}

export type ActorSessionIssueAssessment = {
  classification: ActorSessionIssueClassification
  codeCategory: string | null
  httpStatus: number | null
  rowCountClassification: ActorSessionRowCountClassification
  row: ActorSessionResultRow | null
}

function safeCodeCategory(error: unknown) {
  if (!error || typeof error !== 'object') return null
  const code = (error as SafeRpcError).code
  if (typeof code !== 'string') return null
  if (/^PGRST[0-9]{3}$/.test(code)) return code
  if (/^[0-9A-Z]{5}$/.test(code)) return `SQLSTATE_${code.slice(0, 2)}`
  return 'UPSTREAM_CODE_OTHER'
}

function safeHttpStatus(error: unknown) {
  if (!error || typeof error !== 'object') return null
  const status = (error as SafeRpcError).status
  return Number.isInteger(status) && Number(status) >= 400 && Number(status) <= 599
    ? Number(status)
    : null
}

function classifyRowCount(data: unknown): ActorSessionRowCountClassification {
  if (Array.isArray(data)) {
    if (data.length === 0) return 'ZERO'
    if (data.length === 1) return 'ONE'
    return 'MULTIPLE'
  }
  return data === null || data === undefined
    ? 'ZERO'
    : typeof data === 'object'
      ? 'ONE'
      : 'INVALID'
}

function isCompleteRow(row: ActorSessionResultRow | null) {
  if (!row) return false
  return (
    typeof row.session_id === 'string' &&
    typeof row.expires_at === 'string' &&
    Number.isFinite(Date.parse(row.expires_at)) &&
    typeof row.actor_id === 'string' &&
    typeof row.tenant_id === 'string' &&
    typeof row.branch_id === 'string' &&
    typeof row.actor_role === 'string'
  )
}

export function assessActorSessionIssueResult(
  data: unknown,
  error: unknown
): ActorSessionIssueAssessment {
  const rowCountClassification = classifyRowCount(data)
  const codeCategory = safeCodeCategory(error)
  const httpStatus = safeHttpStatus(error)

  if (error) {
    return {
      classification: codeCategory?.startsWith('SQLSTATE_')
        ? 'RPC_DATABASE_ERROR'
        : 'RPC_TRANSPORT_ERROR',
      codeCategory,
      httpStatus,
      rowCountClassification,
      row: null,
    }
  }

  if (rowCountClassification === 'ZERO') {
    return {
      classification: 'RPC_EMPTY_RESULT',
      codeCategory: null,
      httpStatus: null,
      rowCountClassification,
      row: null,
    }
  }

  if (rowCountClassification === 'MULTIPLE') {
    return {
      classification: 'RPC_MULTIPLE_ROWS',
      codeCategory: null,
      httpStatus: null,
      rowCountClassification,
      row: null,
    }
  }

  const candidate = Array.isArray(data) ? data[0] : data
  const row = candidate && typeof candidate === 'object'
    ? (candidate as ActorSessionResultRow)
    : null

  if (!isCompleteRow(row)) {
    return {
      classification: 'RPC_CONTRACT_INVALID',
      codeCategory: null,
      httpStatus: null,
      rowCountClassification,
      row: null,
    }
  }

  return {
    classification: 'ACTOR_SESSION_ISSUED',
    codeCategory: null,
    httpStatus: 200,
    rowCountClassification,
    row,
  }
}

export class PosActorSessionIssueError extends Error {
  readonly assessment: ActorSessionIssueAssessment

  constructor(assessment: ActorSessionIssueAssessment) {
    super(assessment.classification)
    this.name = 'PosActorSessionIssueError'
    this.assessment = assessment
  }
}

export function isPosActorSessionIssueError(
  error: unknown
): error is PosActorSessionIssueError {
  return error instanceof PosActorSessionIssueError
}
