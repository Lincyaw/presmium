import type { JobFailureCode } from './contracts/workspace.ts'

const CODES = new Set<string>(['job-plugin-missing', 'job-browser-missing', 'job-ffmpeg-missing', 'job-no-voiceover', 'job-voice-unset', 'job-speech-missing', 'job-disk-full'] satisfies JobFailureCode[])

/** An export's failure with a known cause (`code`); the message is the details, in the exporter's words. */
export class JobFailure extends Error {
  readonly code: JobFailureCode
  constructor(code: JobFailureCode, message: string, options?: { cause?: unknown }) {
    super(message, options)
    this.name = 'JobFailure'
    this.code = code
  }
}

/** The known cause of a failure: a `JobFailure` here or among its causes, or a full disk (`ENOSPC`). */
export function jobFailureCode(error: unknown): JobFailureCode | undefined {
  let value = error
  for (let depth = 0; value && typeof value === 'object' && depth < 8; depth++) {
    const code = (value as { code?: unknown }).code
    if (typeof code === 'string' && CODES.has(code)) return code as JobFailureCode
    if (code === 'ENOSPC') return 'job-disk-full'
    value = (value as { cause?: unknown }).cause
  }
  return undefined
}
