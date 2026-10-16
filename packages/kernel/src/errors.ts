/** The message of a thrown value: an Error's message, else the value as a string. */
export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/** A plain object (not null, not an array): a mapping read from YAML or JSON. */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}
