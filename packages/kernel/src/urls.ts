/** A URL with a scheme (`https:`, `data:`, `mailto:`) or a protocol-relative one (`//host/path`). */
export const ABSOLUTE_URL = /^(?:[a-z][a-z\d+.-]*:|\/\/)/i

/** A URL that names no local file: an absolute URL or a bare fragment (`#id`). */
export const NON_FILE_URL = /^(?:[a-z][a-z\d+.-]*:|\/\/|#)/i
