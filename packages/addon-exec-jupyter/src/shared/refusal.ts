/** The HTTP status of a failed request to Jupyter, when the error carries the response. */
export function responseStatus(error: unknown): number | undefined {
  const response = (error as { response?: { status?: unknown } } | undefined)?.response
  return typeof response?.status === 'number' ? response.status : undefined
}

/** Whether Jupyter refused the credentials (401 or 403). */
export function isRefused(error: unknown): boolean {
  const status = responseStatus(error)
  return status === 401 || status === 403
}
