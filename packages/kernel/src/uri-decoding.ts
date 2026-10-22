/** Decodes a URI component; a malformed one is returned as written. */
export function safeDecodeURIComponent(value: string): string {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}
