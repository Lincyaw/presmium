/** Stable API errors; adapters translate codes using the cloud message catalogue. */
export class CloudError extends Error {
  readonly status: number
  readonly code: string
  readonly details?: Record<string, unknown>
  constructor(status: number, code: string, details?: Record<string, unknown>) {
    super(code)
    this.status = status
    this.code = code
    this.details = details
  }
}

export function requireText(value: unknown, code = 'invalid-input', max = 200): string {
  if (typeof value !== 'string' || value.trim().length === 0 || value.length > max) throw new CloudError(400, code)
  return value.trim()
}

export function requireInteger(value: unknown, code = 'invalid-input', min = 0, max = Number.MAX_SAFE_INTEGER): number {
  if (!Number.isSafeInteger(value) || (value as number) < min || (value as number) > max) throw new CloudError(400, code)
  return value as number
}

export function requireId(value: unknown): string {
  if (typeof value !== 'string' || !/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(value)) throw new CloudError(400, 'invalid-id')
  return value
}
