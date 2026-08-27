import {
  parseProfilePresentation,
  type ProfilePresentation,
} from './profile-presentation'

type SharedRequest = {
  scopeKey: string
  controller: AbortController
  promise: Promise<ProfilePresentation>
}

let sharedRequest: SharedRequest | null = null
let memoryCache: { scopeKey: string; data: ProfilePresentation } | null = null

export function clearProfilePresentationMemoryCache(scopeKey?: string) {
  if (!scopeKey || sharedRequest?.scopeKey === scopeKey) {
    sharedRequest?.controller.abort()
    sharedRequest = null
  }
  if (!scopeKey || memoryCache?.scopeKey === scopeKey) {
    memoryCache = null
  }
}

export function requestProfilePresentation(
  scopeKey: string,
  options?: Readonly<{ force?: boolean; signal?: AbortSignal }>
) {
  if (!scopeKey) {
    return Promise.reject(new Error('PROFILE_PRESENTATION_SCOPE_REQUIRED'))
  }

  if (!options?.force && memoryCache?.scopeKey === scopeKey) {
    return Promise.resolve(memoryCache.data)
  }

  if (!options?.force && sharedRequest?.scopeKey === scopeKey) {
    return sharedRequest.promise
  }

  if (
    sharedRequest &&
    (options?.force || sharedRequest.scopeKey !== scopeKey)
  ) {
    clearProfilePresentationMemoryCache()
  }

  const controller = new AbortController()
  const abortFromCaller = () => controller.abort()
  options?.signal?.addEventListener('abort', abortFromCaller, { once: true })

  const promise = fetch('/api/account/profile-presentation', {
    method: 'GET',
    credentials: 'same-origin',
    cache: 'no-store',
    signal: controller.signal,
  })
    .then(async (response) => {
      const payload = await response.json().catch(() => null)
      if (!response.ok) {
        throw new Error('PROFILE_PRESENTATION_REQUEST_FAILED')
      }
      return parseProfilePresentation(payload)
    })
    .then((data) => {
      if (!controller.signal.aborted) {
        memoryCache = { scopeKey, data }
      }
      return data
    })
    .finally(() => {
      options?.signal?.removeEventListener('abort', abortFromCaller)
      if (sharedRequest?.promise === promise) sharedRequest = null
    })

  sharedRequest = { scopeKey, controller, promise }
  return promise
}
