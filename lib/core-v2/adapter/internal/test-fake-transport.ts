import 'server-only'

import type { CommandDisposition } from '../../contracts/dispositions'
import type {
  TrustedAcquisitionInput,
  TrustedAcquisitionRawResult,
} from '../contracts'
import type { TrustedAcquisitionTransport } from '../transport'

const RAW_KEYS = Object.freeze([
  'acquisition_result', 'authorization_context_id', 'atomic_command_id',
  'correlation_reference', 'command_status', 'response_version',
  'response_snapshot', 'completed_at', 'error_code', 'error_detail',
  'last_failure_stage', 'stored_request_fingerprint',
] as const)

const DISPOSITIONS = new Set<CommandDisposition>([
  'created', 'replay', 'in_progress', 'fingerprint_conflict',
])

type Snapshot =
  | Readonly<{ kind: 'primitive'; value: null | undefined | string | number | boolean | bigint }>
  | Readonly<{ kind: 'date'; value: number }>
  | Readonly<{ kind: 'bytes'; value: readonly number[] }>
  | Readonly<{ kind: 'array'; value: readonly Snapshot[] }>
  | Readonly<{ kind: 'object'; value: Readonly<Record<string, Snapshot>> }>

function snapshot(value: unknown, seen = new Set<object>()): Snapshot {
  if (value === null || value === undefined || ['string', 'number', 'boolean', 'bigint'].includes(typeof value))
    return Object.freeze({ kind: 'primitive', value }) as Snapshot
  if (typeof value !== 'object') throw new Error('TEST_FAKE_UNSUPPORTED_RAW_VALUE')
  if (seen.has(value)) throw new Error('TEST_FAKE_CYCLIC_RAW_VALUE')
  seen.add(value)
  try {
    if (value instanceof Date)
      return Object.freeze({ kind: 'date', value: value.getTime() })
    if (value instanceof Uint8Array)
      return Object.freeze({ kind: 'bytes', value: Object.freeze([...value]) })
    if (value instanceof ArrayBuffer)
      return Object.freeze({ kind: 'bytes', value: Object.freeze([...new Uint8Array(value)]) })
    if (Array.isArray(value))
      return Object.freeze({ kind: 'array', value: Object.freeze(value.map((item) => snapshot(item, seen))) })
    if (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null)
      throw new Error('TEST_FAKE_UNSAFE_RAW_PROTOTYPE')
    const descriptors = Object.getOwnPropertyDescriptors(value)
    const output: Record<string, Snapshot> = Object.create(null)
    for (const key of Object.keys(descriptors).sort()) {
      const descriptor = descriptors[key]
      if (!descriptor.enumerable || !('value' in descriptor))
        throw new Error('TEST_FAKE_UNSAFE_RAW_PROPERTY')
      output[key] = snapshot(descriptor.value, seen)
    }
    return Object.freeze({ kind: 'object', value: Object.freeze(output) })
  } finally {
    seen.delete(value)
  }
}

function materialize(value: Snapshot): unknown {
  if (value.kind === 'primitive') return value.value
  if (value.kind === 'date') return new Date(value.value)
  if (value.kind === 'bytes') return new Uint8Array(value.value)
  if (value.kind === 'array') return value.value.map(materialize)
  return Object.fromEntries(Object.entries(value.value).map(([key, item]) => [key, materialize(item)]))
}

function snapshotRow(value: TrustedAcquisitionRawResult): Snapshot {
  if (!value || typeof value !== 'object' || Object.getPrototypeOf(value) !== Object.prototype)
    throw new Error('TEST_FAKE_INVALID_RAW_ROW')
  const keys = Object.keys(value).sort()
  if (keys.length !== RAW_KEYS.length || RAW_KEYS.some((key) => !Object.hasOwn(value, key)))
    throw new Error('TEST_FAKE_INVALID_RAW_ROW_SHAPE')
  if (!DISPOSITIONS.has(value.acquisition_result))
    throw new Error('TEST_FAKE_INVALID_DISPOSITION')
  return snapshot(value)
}

export class TestFakeTrustedAcquisitionTransport
  implements TrustedAcquisitionTransport
{
  private readonly results: Snapshot[]
  private readonly failure: Readonly<{ name: string; message: string }> | null
  private readonly observedDispositions: CommandDisposition[] = []
  private calls = 0

  constructor(options: {
    results?: readonly TrustedAcquisitionRawResult[]
    failure?: Error
  }) {
    this.results = (options.results ?? []).map(snapshotRow)
    this.failure = options.failure
      ? Object.freeze({ name: options.failure.name, message: options.failure.message })
      : null
  }

  async acquire(
    input: TrustedAcquisitionInput
  ): Promise<TrustedAcquisitionRawResult> {
    void input
    this.calls += 1
    if (this.failure) {
      const error = new Error(this.failure.message)
      error.name = this.failure.name
      throw error
    }
    const result = this.results.shift()
    if (!result) throw new Error('TEST_FAKE_RESULT_UNAVAILABLE')
    const materialized = materialize(result) as TrustedAcquisitionRawResult
    this.observedDispositions.push(materialized.acquisition_result)
    return materialized
  }

  snapshot(): Readonly<{
    callCount: number
    dispositions: readonly CommandDisposition[]
  }> {
    return Object.freeze({
      callCount: this.calls,
      dispositions: Object.freeze([...this.observedDispositions]),
    })
  }
}
