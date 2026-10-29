export type Locale = 'zh-CN' | 'en'

export interface User { id: string, name?: string, email?: string }
export interface SessionAnswer { user: User | null, csrfToken?: string | null, mcpUrl?: string }
export type StudioState = 'stopped' | 'starting' | 'running' | 'stopping' | 'failed'
export interface Studio { state: StudioState, generation: number, errorCode: string | null, url: string }
export interface WorkspaceDocument { document: string, id: string, title: string }
export interface Share { id: string, slug: string, document: string, title: string, state: 'pending' | 'ready' | 'failed', errorCode: string | null, createdAt: string, siteUrl: string }
export interface SharedDocument { slug: string, title: string, owner: string, state: Share['state'], createdAt: string, siteUrl: string }
export interface AccessToken { id: string, name: string, createdAt: string, expiresAt: string | null, lastUsedAt: string | null }

let csrfToken: string | undefined
export function setCsrfToken(value: string | undefined | null): void { csrfToken = value ?? undefined }

export class ApiError extends Error {
  readonly status: number
  readonly code: string
  constructor(status: number, code: string) { super(code); this.name = 'ApiError'; this.status = status; this.code = code }
}

/** All user text comes from the catalog; server messages are never displayed verbatim. */
export async function request<T>(path: string, options: { method?: 'GET' | 'POST' | 'DELETE', body?: unknown, signal?: AbortSignal } = {}): Promise<T> {
  const method = options.method ?? 'GET'
  const response = await fetch(path, {
    method, credentials: 'same-origin', signal: options.signal,
    headers: { Accept: 'application/json', ...options.body === undefined ? {} : { 'Content-Type': 'application/json' }, ...method === 'GET' || !csrfToken ? {} : { 'X-CSRF-Token': csrfToken } },
    ...options.body === undefined ? {} : { body: JSON.stringify(options.body) },
  })
  const answer = await response.json().catch(() => undefined) as Record<string, unknown> | undefined
  if (!response.ok) throw new ApiError(response.status, typeof answer?.error === 'string' ? answer.error : 'request-failed')
  if (answer === undefined) throw new ApiError(502, 'invalid-response')
  return answer as T
}

export function dateLabel(value: string | null | undefined, locale: Locale): string {
  if (!value) return '—'
  const date = new Date(value)
  return Number.isNaN(date.valueOf()) ? '—' : new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(date)
}
