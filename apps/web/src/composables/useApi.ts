const BASE = ((import.meta.env.VITE_API_BASE as string | undefined) ?? '').trim()
export const REQUEST_TIMEOUT_MS = 15_000

function buildUrl(path: string) {
  const cleaned = path.startsWith('/') ? path : `/${path}`
  if (!BASE) return cleaned
  return BASE.endsWith('/api') && cleaned.startsWith('/api/')
    ? `${BASE}${cleaned.slice(4)}`
    : `${BASE}${cleaned}`
}

export class HttpError extends Error {
  constructor(
    message: string,
    public status: number,
    public data: unknown,
    public code?: string,
    public retryAfterMs?: number,
    public outcomeUncertain = false,
  ) {
    super(message)
    this.name = 'HttpError'
  }
}

export function parseRetryAfter(value: string | null, now = Date.now()): number | undefined {
  if (!value?.trim()) return undefined
  const seconds = Number(value)
  if (Number.isFinite(seconds)) return seconds >= 0 ? seconds * 1000 : undefined
  const date = Date.parse(value)
  return Number.isFinite(date) ? Math.max(0, date - now) : undefined
}

export function isRequestAborted(error: unknown) {
  return error instanceof HttpError && error.code === 'REQUEST_ABORTED'
}

async function request<T = unknown, B = unknown>(
  method: string,
  path: string,
  body?: B,
  init?: RequestInit,
  timeout = REQUEST_TIMEOUT_MS,
  binary = false,
): Promise<T> {
  const controller = new AbortController()
  let timedOut = false
  const abort = () => controller.abort()
  init?.signal?.addEventListener('abort', abort, { once: true })
  if (init?.signal?.aborted) abort()
  const timer = setTimeout(() => {
    timedOut = true
    controller.abort()
  }, timeout)
  const headers = new Headers(init?.headers)
  headers.set('Accept', 'application/json')
  const opts: RequestInit = {
    ...init,
    method,
    headers,
    signal: controller.signal,
    cache: 'no-store',
  }
  if (body instanceof FormData) opts.body = body
  else if (body !== undefined) {
    headers.set('Content-Type', 'application/json')
    opts.body = typeof body === 'string' ? body : JSON.stringify(body)
  }
  try {
    const response = await fetch(buildUrl(path), opts)
    if (response.ok && binary) return (await response.blob()) as T
    const text = await response.text()
    let data: unknown = null
    try {
      data = text ? JSON.parse(text) : null
    } catch {
      data = text
    }
    if (!response.ok) {
      const payload = data as {
        error?: { message?: string; code?: string; details?: { code?: string } }
      } | null
      throw new HttpError(
        payload?.error?.message ?? response.statusText,
        response.status,
        data,
        payload?.error?.details?.code ?? payload?.error?.code,
        parseRetryAfter(response.headers.get('Retry-After')),
      )
    }
    return data as T
  } catch (error) {
    if (error instanceof HttpError) throw error
    const code = timedOut
      ? 'API_TIMEOUT'
      : controller.signal.aborted
        ? 'REQUEST_ABORTED'
        : 'API_UNAVAILABLE'
    throw new HttpError('API request interrupted.', 0, null, code, undefined, method !== 'GET')
  } finally {
    clearTimeout(timer)
    init?.signal?.removeEventListener('abort', abort)
  }
}

export function useApi() {
  return {
    blob: (path: string, init?: RequestInit) =>
      request<Blob>('GET', path, undefined, init, REQUEST_TIMEOUT_MS, true),
    upload: <T>(path: string, body: FormData, init?: RequestInit) =>
      request<T, FormData>('POST', path, body, init, 30_000),
    get: <T = unknown>(path: string, init?: RequestInit) =>
      request<T>('GET', path, undefined, init),
    post: <T = unknown, B = unknown>(path: string, body?: B, init?: RequestInit) =>
      request<T, B>('POST', path, body, init),
    put: <T = unknown, B = unknown>(path: string, body?: B, init?: RequestInit) =>
      request<T, B>('PUT', path, body, init),
    delete: <T = unknown>(path: string, init?: RequestInit) =>
      request<T>('DELETE', path, undefined, init),
  }
}
