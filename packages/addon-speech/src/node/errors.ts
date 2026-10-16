/** An error of the speech service with the HTTP status the gateway answers it with. */
export class SpeechError extends Error {
  readonly status: number

  constructor(status: number, message: string) {
    super(message)
    this.name = 'SpeechError'
    this.status = status
  }
}

/** A JSON answer. */
export function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } })
}

/** `{ error }` with the status of a `SpeechError`, else 502 (an engine failed). */
export function failure(error: unknown): Response {
  if (error instanceof SpeechError) return json({ error: error.message }, error.status)
  if (error instanceof Error && error.name === 'AbortError') return json({ error: 'aborted' }, 499)
  return json({ error: error instanceof Error ? error.message : String(error) }, 502)
}

/**
 * The error of a gateway's or engine's answer: its `{ error }` (a string, or
 * the OpenAI shape's `{ message }`), else its text. An engine's failure is
 * 502 whatever its status; the gateway's status is passed on (`own`).
 */
export async function answerError(response: Response, what: string, own = false): Promise<SpeechError> {
  const text = await response.text().catch(() => '')
  let message = text.slice(0, 500)
  try {
    const body = JSON.parse(text) as { error?: unknown, message?: unknown }
    const error = body.error
    message = typeof error === 'string' ? error : typeof (error as { message?: unknown })?.message === 'string' ? (error as { message: string }).message : typeof body.message === 'string' ? body.message : message
  } catch {
    // Not JSON: the text.
  }
  if (own) return new SpeechError(response.status, message || `${what} answered ${response.status}`)
  return new SpeechError(502, `${what} answered ${response.status}${message ? `: ${message}` : ''}`)
}
