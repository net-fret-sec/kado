// TypeScript composable to centralize API calls
const BASE = ((import.meta.env.VITE_API_BASE as string | undefined) ?? '').trim()

function buildUrl(path: string) {
  if (path.startsWith('http://') || path.startsWith('https://')) return path
  const cleaned = path.startsWith('/') ? path : `/${path}`

  if (!BASE) return cleaned

  // Avoid duplicating '/api' when both BASE and path include it.
  if (BASE.endsWith('/api') && cleaned.startsWith('/api/')) {
    return `${BASE}${cleaned.slice(4)}`
  }

  return `${BASE}${cleaned}`
}

type ErrorLike = {
  error?: { message?: unknown; code?: unknown; details?: { code?: unknown } }
  message?: unknown
  code?: unknown
  details?: { code?: unknown }
}

function extractMessage(data: unknown): string | undefined {
  if (typeof data === 'string') return data
  if (data && typeof data === 'object') {
    const e = data as ErrorLike
    if (typeof e.error?.message === 'string') return e.error.message as string
    if (typeof e.message === 'string') return e.message as string
  }
  return undefined
}

function extractCode(data: unknown): string | undefined {
  if (data && typeof data === 'object') {
    const e = data as ErrorLike
    if (typeof e.error?.code === 'string') return e.error.code as string
    if (typeof e.error?.details?.code === 'string') return e.error.details.code as string
    if (typeof e.code === 'string') return e.code as string
    if (typeof e.details?.code === 'string') return e.details.code as string
  }
  return undefined
}

export class HttpError extends Error {
  status: number
  data: unknown
  code?: string
  constructor(message: string, status: number, data: unknown, code?: string) {
    super(message)
    this.name = 'HttpError'
    this.status = status
    this.data = data
    this.code = code
  }
}

async function parseResponse<T = unknown>(response: Response): Promise<T> {
  const text = await response.text()
  let data: unknown = null
  try {
    data = text ? JSON.parse(text) : null
  } catch {
    // response not JSON
    data = text
  }

  if (!response.ok) {
    const msg = extractMessage(data) ?? response.statusText
    const code = extractCode(data)
    throw new HttpError(msg, response.status, data, code)
  }

  return data as T
}

function normalizeHeaders(input?: HeadersInit): Headers {
  return new Headers(input)
}

async function request<T = unknown, B = unknown>(
  method: string,
  path: string,
  body?: B,
  init?: RequestInit,
): Promise<T> {
  const url = buildUrl(path)
  const headers = normalizeHeaders(init?.headers)
  headers.set('Accept', 'application/json')

  const opts: RequestInit = {
    method,
    ...init,
    headers,
  }

  if (body !== undefined && !(body instanceof FormData)) {
    if (!headers.has('Content-Type')) headers.set('Content-Type', 'application/json')
    opts.body = typeof body === 'string' ? body : JSON.stringify(body)
  } else if (body instanceof FormData) {
    opts.body = body
  }

  const response = await fetch(url, opts)
  return await parseResponse<T>(response)
}

export function useApi() {
  return {
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
