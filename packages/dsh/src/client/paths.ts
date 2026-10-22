/** A path with `/` separators and without `.`, `..` or empty parts; undefined when `..` climbs above its start. */
export function normalizePath(path: string): string | undefined {
  const parts: string[] = []
  for (const part of path.replace(/\\/g, '/').split('/')) {
    if (!part || part === '.') continue
    if (part === '..') {
      if (!parts.length || parts.at(-1)?.endsWith(':')) return
      parts.pop()
    } else parts.push(part)
  }
  return `${path.startsWith('/') ? '/' : ''}${parts.join('/')}`
}

export function isSamePath(a: string, b: string): boolean {
  const normalized = normalizePath(a)
  return normalized !== undefined && normalized === normalizePath(b)
}
