export type Role = 'owner' | 'editor' | 'reader'
export type Locale = 'zh-CN' | 'en'

export interface User { id: string, name?: string, email?: string }
export interface SessionAnswer {
  user: User | null
  csrfToken?: string
  capabilities: { oidc: boolean, ai: boolean, billing: boolean, storage?: boolean, runtime?: boolean }
}
export interface Space { id: string, name: string, role: Role, plan?: string, canExecute?: boolean, canSpend?: boolean }
export interface Member { userId: string, name?: string, email?: string, role: Role, canExecute: boolean, canSpend: boolean }
export interface Invitation { id: string, email?: string, role?: Role, url?: string, expiresAt: string }
export interface CloudDocument { id: string, title: string, version: string | number, updatedAt?: string }
export interface AccessToken { id: string, name: string, scopes: string[], createdAt?: string, expiresAt?: string, lastUsedAt?: string, revokedAt?: string }
export interface CreatedToken { token: AccessToken & { secret: string, url: string } }
export interface LedgerEntry { id: string, kind: string, amountMinor: number, currency: string, createdAt: string, description?: string, jobId?: string }
export interface Usage {
  currency: string
  monthlyLimitMinor: number
  spentMinor: number
  reservedMinor: number
  storageBytes: number
  objectBytes?: number
  environmentReservedBytes?: number
  periodStart?: string
  periodEnd?: string
  ledger?: LedgerEntry[]
}
export interface RuntimeProfile { id: string, name: string, kind: 'job' | 'jupyter', description?: string, available?: boolean, cpu?: number, memoryBytes?: number, maxDurationSeconds?: number, pricePerMinuteMinor?: number }
export interface Environment { id: string, name?: string, profileId: string, status: string, ownerId?: string, createdAt?: string, updatedAt?: string, url?: string }
export interface Job { id: string, kind: string, status: string, audience?: 'author' | 'student', documentId?: string, createdAt?: string, updatedAt?: string, progress?: number, errorCode?: string, resultUrl?: string }
export interface JobQuote { id: string, amountMinor: number, currency: string, expiresAt: string }
export interface EnvironmentQuote extends JobQuote { ratePerMinuteMinor: number, maxDurationSeconds: number }
export interface BillingPlan { id: string, name: string, amountMinor?: number, currency?: string, interval?: string, description?: string, available?: boolean, collaborators?: number, storageBytes?: number, historyDays?: number | null, concurrentEnvironments?: number }
export interface Billing { plan: string, status?: string, subscription?: { status: string } | null, available: boolean, availablePlans?: string[], plans: BillingPlan[] }
export interface EditorDescriptor { available: boolean, reason?: string, apiBase?: string, document?: string, readOnly?: boolean }
export interface ContentStatus { sourceVersion: string, fingerprint: string, forms: Partial<Record<'web' | 'slides', { jobId: string, finishedAt: string }>>, publications: Partial<Record<'web' | 'slides', { jobId: string, finishedAt: string }>>, static: true }
export interface Publication { id: string, sourceVersion: string, jobId: string, title: string, form: 'web' | 'slides', url: string, createdAt: string, revokedAt: string | null }

let csrfToken: string | undefined
export function setCsrfToken(value: string | undefined): void { csrfToken = value }

/** Public workbench transport: preserve its protocol while applying cloud browser authentication. */
export const authenticatedFetch: typeof globalThis.fetch = (input, init) => {
  const url = new URL(input instanceof Request ? input.url : String(input), window.location.origin)
  if (url.origin !== window.location.origin) return Promise.reject(new ApiError(502, 'invalid-response'))
  const method = (init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase()
  const headers = new Headers(input instanceof Request ? input.headers : undefined)
  new Headers(init?.headers).forEach((value, key) => headers.set(key, value))
  if (!['GET', 'HEAD', 'OPTIONS'].includes(method) && csrfToken) headers.set('X-CSRF-Token', csrfToken)
  return globalThis.fetch(input, { ...init, headers, credentials: 'same-origin' })
}

export class ApiError extends Error {
  readonly status: number
  readonly code: string
  constructor(status: number, code: string) { super(code); this.name = 'ApiError'; this.status = status; this.code = code }
}

/** All user text comes from the catalog; server messages are never displayed verbatim. */
export async function request<T>(path: string, options: { method?: 'GET' | 'POST' | 'PUT' | 'DELETE', body?: unknown, signal?: AbortSignal } = {}): Promise<T> {
  const method = options.method ?? 'GET'
  const response = await fetch(path, {
    method, credentials: 'same-origin', signal: options.signal,
    headers: { Accept: 'application/json', ...options.body === undefined ? {} : { 'Content-Type': 'application/json' }, ...method === 'GET' || !csrfToken ? {} : { 'X-CSRF-Token': csrfToken } },
    ...options.body === undefined ? {} : { body: JSON.stringify(options.body) },
  })
  if (response.status === 204) return undefined as T
  const answer = await response.json().catch(() => undefined) as Record<string, unknown> | undefined
  if (!response.ok) throw new ApiError(response.status, typeof answer?.code === 'string' ? answer.code : typeof answer?.error === 'string' ? answer.error : 'request-failed')
  if (answer === undefined) throw new ApiError(502, 'invalid-response')
  return answer as T
}

export const spacePath = (id: string, path = ''): string => `/api/spaces/${encodeURIComponent(id)}${path ? `/${path}` : ''}`

/** Authenticated API descriptors may point at an HTTPS payment provider or our own gateway. */
export function checkedURL(value: string): URL {
  const url = new URL(value, window.location.origin)
  const loopbackService = window.location.protocol === 'http:' && window.location.hostname === 'app.localhost'
    && url.protocol === 'http:' && url.port === window.location.port && ['content.localhost', 'runtime.localhost', 'auth.localhost'].includes(url.hostname)
  if (url.username || url.password || url.protocol !== 'https:' && !(url.origin === window.location.origin && url.protocol === 'http:') && !loopbackService) throw new ApiError(502, 'invalid-response')
  return url
}

export function followURL(value: string, newWindow = false): void {
  const url = checkedURL(value)
  if (newWindow) window.open(url.href, '_blank', 'noopener,noreferrer')
  else window.location.assign(url.href)
}

export function money(amountMinor: number, currency: string, locale: Locale): string {
  const formatter = new Intl.NumberFormat(locale, { style: 'currency', currency })
  return formatter.format(amountMinor / 10 ** (formatter.resolvedOptions().maximumFractionDigits ?? 2))
}

export function minorUnits(input: string, currency: string): number | undefined {
  const digits = new Intl.NumberFormat('en', { style: 'currency', currency }).resolvedOptions().maximumFractionDigits ?? 2
  if (!new RegExp(`^\\d+(?:\\.\\d{1,${Math.max(1, digits)}})?$`).test(input.trim())) return undefined
  const [whole = '', fraction = ''] = input.trim().split('.')
  if (fraction.length > digits) return undefined
  const amount = Number(`${whole}${fraction.padEnd(digits, '0')}`)
  return Number.isSafeInteger(amount) && amount >= 0 ? amount : undefined
}

export function dateLabel(value: string | undefined, locale: Locale): string {
  if (!value) return '—'
  const date = new Date(value)
  return Number.isNaN(date.valueOf()) ? '—' : new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(date)
}
