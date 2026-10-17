import { problem } from '@presmium/kernel'

/** An error of the speech service with the HTTP status the speech routes answer it with. */
export class SpeechError extends Error {
  readonly status: number

  constructor(status: number, message: string) {
    super(message)
    this.name = 'SpeechError'
    this.status = status
  }
}

/** `{ error }` with the status of a `SpeechError`, else 502 (an engine failed). */
export function failure(error: unknown): Response {
  if (error instanceof SpeechError) return problem(error.status, error.message)
  if (error instanceof Error && error.name === 'AbortError') return problem(499, 'aborted')
  return problem(502, error instanceof Error ? error.message : String(error))
}

/**
 * The error of an engine's answer: its `{ error }` (a string, or the OpenAI
 * shape's `{ message }`), else its text; 502 whatever its status.
 */
export async function answerError(response: Response, what: string): Promise<SpeechError> {
  const text = await response.text().catch(() => '')
  let message = text.slice(0, 500)
  try {
    const body = JSON.parse(text) as { error?: unknown, message?: unknown }
    const error = body.error
    message = typeof error === 'string' ? error : typeof (error as { message?: unknown })?.message === 'string' ? (error as { message: string }).message : typeof body.message === 'string' ? body.message : message
  } catch {
    // Not JSON: the text.
  }
  return new SpeechError(502, `${what} answered ${response.status}${message ? `: ${message}` : ''}`)
}
