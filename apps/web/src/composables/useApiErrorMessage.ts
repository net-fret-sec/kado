import { i18n } from '@/i18n'

type ErrorPayload = {
  error?: { code?: unknown; details?: { code?: unknown } }
  code?: unknown
  details?: { code?: unknown }
}

type ErrorWithData = {
  code?: unknown
  status?: unknown
  data?: unknown
}

interface ApiErrorMessageOptions {
  fallbackKey?: string
  fallbackMessage?: string
}

function extractStatus(error: unknown): number | undefined {
  if (!error || typeof error !== 'object') return undefined

  const withData = error as ErrorWithData
  return typeof withData.status === 'number' ? withData.status : undefined
}

function extractCodeFromPayload(payload: unknown): string | undefined {
  if (!payload || typeof payload !== 'object') return undefined

  const p = payload as ErrorPayload

  if (typeof p.error?.code === 'string') return p.error.code as string
  if (typeof p.error?.details?.code === 'string') return p.error.details.code as string
  if (typeof p.code === 'string') return p.code as string
  if (typeof p.details?.code === 'string') return p.details.code as string

  return undefined
}

function extractApiErrorCode(error: unknown): string | undefined {
  if (!error || typeof error !== 'object') return undefined

  const direct = extractCodeFromPayload(error)
  if (direct) return direct

  const withData = error as ErrorWithData
  if (typeof withData.code === 'string') return withData.code as string

  return extractCodeFromPayload(withData.data)
}

export function getApiErrorMessage(error: unknown, options: ApiErrorMessageOptions = {}): string {
  const code = extractApiErrorCode(error)

  if (code) {
    const key = `apiErrors.${code}`
    if (i18n.global.te(key)) {
      return i18n.global.t(key)
    }
  }

  const status = extractStatus(error)
  if (
    (status === 0 || (typeof status === 'number' && status >= 500)) &&
    i18n.global.te('apiErrors.API_UNAVAILABLE')
  ) {
    return i18n.global.t('apiErrors.API_UNAVAILABLE')
  }

  if (error instanceof Error && error.message) {
    return error.message
  }

  if (options.fallbackKey && i18n.global.te(options.fallbackKey)) {
    return i18n.global.t(options.fallbackKey)
  }

  if (options.fallbackMessage) {
    return options.fallbackMessage
  }

  if (i18n.global.te('apiErrors.UNKNOWN')) {
    return i18n.global.t('apiErrors.UNKNOWN')
  }

  return 'Unknown error'
}
