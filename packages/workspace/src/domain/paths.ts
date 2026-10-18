function segments(path: string): string[] | undefined {
  const out: string[] = []
  for (const part of path.split('/')) {
    if (part === '' || part === '.') continue
    if (part === '..') {
      if (out.length === 0) return undefined
      out.pop()
    } else {
      out.push(part)
    }
  }
  return out
}

export function normalize(path: string): string | undefined {
  return segments(path)?.join('/')
}

export function relativePath(from: string, to: string): string {
  const a = from ? from.split('/') : []
  const b = to ? to.split('/') : []
  let i = 0
  while (i < a.length && i < b.length && a[i] === b[i]) i++
  return [...a.slice(i).map(() => '..'), ...b.slice(i)].join('/') || '.'
}

export function joinPath(dir: string, path: string): string | undefined {
  return normalize(dir ? `${dir}/${path}` : path)
}

export function leavesRoot(path: string): boolean {
  return path === '..' || path.startsWith('../')
}

export function within(path: string, dir: string): boolean {
  return dir === '' || path === dir || path.startsWith(`${dir}/`)
}

const RESERVED = new Set(['.git', '.presmium', 'node_modules', 'dist', 'templates'])

export function invalidDocumentDir(dir: string): string | undefined {
  if (!dir || dir.startsWith('/') || dir.endsWith('/')) return 'a document directory is a relative path such as weeks/03'
  const parts = dir.split('/')
  if (parts.some(part => !/^[\p{L}\p{N}_-][\p{L}\p{N}._-]*$/u.test(part))) return `"${dir}": each part of a document directory has letters, digits, -, _ and . only, and does not start with .`
  if (RESERVED.has(parts[0]!)) return `"${dir}": ${parts[0]} is not a document directory`
  return undefined
}

function segmentPattern(segment: string): RegExp {
  const escaped = segment.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[^/]*').replace(/\?/g, '[^/]')
  return new RegExp(`^${escaped}$`)
}

export function matchesPattern(pattern: string, path: string): boolean {
  const want = pattern.replace(/^\.\//, '').split('/')
  const have = path.split('/')
  return want.length === have.length && want.every((segment, i) => segmentPattern(segment).test(have[i]!))
}

export function patternSegments(pattern: string): (string | RegExp)[] {
  return pattern.replace(/^\.\//, '').split('/').map(segment => (/[*?]/.test(segment) ? segmentPattern(segment) : segment))
}

const NOT_RELATIVE = /^(?:[a-z][a-z\d+.-]*:|\/|#|\?)/i

export function movedUrl(url: string, file: string, was: string, from: string, to: string): string | undefined {
  if (NOT_RELATIVE.test(url)) return undefined
  const match = /^([^?#]*)(.*)$/s.exec(url)!
  const path = match[1]!
  if (!path) return undefined
  let decoded = path
  try {
    decoded = decodeURI(path)
  } catch {
  }
  const dirOf = (p: string) => p.split('/').slice(0, -1).join('/')
  const target = joinPath(dirOf(was), decoded)
  if (target === undefined) return undefined
  const moved = within(target, from) ? `${to}${target.slice(from.length)}` : target
  let next = relativePath(dirOf(file), moved)
  if (decoded.endsWith('/') && !next.endsWith('/')) next += '/'
  if (decoded.startsWith('./') && !next.startsWith('.')) next = `./${next}`
  if (next === decoded) return undefined
  return `${encodeURI(next)}${match[2]}`
}

export function rewriteLinks(text: string, file: string, was: string, from: string, to: string): string {
  const url = (value: string) => movedUrl(value, file, was, from, to) ?? value
  return text
    .replace(/(\]\()(<[^>]*>|[^)\s]+)/g, (_all, open: string, target: string) => {
      const bracketed = target.startsWith('<')
      const value = bracketed ? target.slice(1, -1) : target
      const next = url(value)
      return `${open}${bracketed ? `<${next}>` : next}`
    })
    .replace(/^(\s{0,3}\[[^\]]+\]:\s*)(\S+)/gm, (_all, head: string, target: string) => `${head}${url(target)}`)
    .replace(/^(\s*(?:`{3,}|:{3,})\{(?:include|literalinclude|figure|image)\}\s+)(\S+)/gm, (_all, head: string, target: string) => `${head}${url(target)}`)
}
