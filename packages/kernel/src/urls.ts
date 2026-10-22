/** A URL with a scheme (`https:`, `data:`, `mailto:`) or a protocol-relative one (`//host/path`). */
export const ABSOLUTE_URL = /^(?:[a-z][a-z\d+.-]*:|\/\/)/i

/** A URL that names no local file: an absolute URL or a bare fragment (`#id`). */
export const NON_FILE_URL = /^(?:[a-z][a-z\d+.-]*:|\/\/|#)/i

/**
 * A slug for a URL path segment or fragment: letters and digits, each other run of characters one `-`.
 * The web renderer's page paths and the IR runtime's heading IDs; section IDs follow the compiler's own rule.
 */
export function urlSlug(text: string): string {
  return text.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '')
}
