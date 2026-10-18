import { problem } from '@presmium/kernel'

export class SpeechError extends Error {
  readonly status: number

  constructor(status: number, message: string) {
    super(message)
    this.name = 'SpeechError'
    this.status = status
  }
}

export function failure(error: unknown): Response {
  if (error instanceof SpeechError) return problem(error.status, error.message)
  if (error instanceof Error && error.name === 'AbortError') return problem(499, 'aborted')
  return problem(502, error instanceof Error ? error.message : String(error))
}

export async function answerError(response: Response, what: string): Promise<SpeechError> {
  const text = await response.text().catch(() => '')
  let message = text.slice(0, 500)
  try {
    const body = JSON.parse(text) as { error?: unknown, message?: unknown }
    const error = body.error
    message = typeof error === 'string' ? error : typeof (error as { message?: unknown })?.message === 'string' ? (error as { message: string }).message : typeof body.message === 'string' ? body.message : message
  } catch {
  }
  return new SpeechError(502, `${what} answered ${response.status}${message ? `: ${message}` : ''}`)
}
