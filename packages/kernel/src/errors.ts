export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

/** What a preview needs (the viewer app, the document's code) is still being built: ask again later; not a failure. */
export class PreviewPreparing extends Error {
  constructor(message = 'preview-preparing') {
    super(message)
    this.name = 'PreviewPreparing'
  }
}
