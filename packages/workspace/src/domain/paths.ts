/**
 * Paths of a workspace, with `/` separators and no access to the file
 * system: what a document directory may be called, which documents the
 * workspace configuration's patterns name, and how relative links change
 * when a document moves (docs/domain-model.md section 14).
 */

/** The segments of a relative path, `.` dropped and `..` applied; undefined when it leaves its root. */
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

/** `path` made normal: `a/./b/../c` is `a/c`; undefined when it leaves its root. */
export function normalize(path: string): string | undefined {
  return segments(path)?.join('/')
}

/** `to` relative to the directory `from` (both relative to one root). */
export function relativePath(from: string, to: string): string {
  const a = from ? from.split('/') : []
  const b = to ? to.split('/') : []
  let i = 0
  while (i < a.length && i < b.length && a[i] === b[i]) i++
  return [...a.slice(i).map(() => '..'), ...b.slice(i)].join('/') || '.'
}

/** Joins a directory and a relative path; undefined when the result leaves the root. */
export function joinPath(dir: string, path: string): string | undefined {
  return normalize(dir ? `${dir}/${path}` : path)
}

/** `path` is `dir` or lies under it. */
export function within(path: string, dir: string): boolean {
  return dir === '' || path === dir || path.startsWith(`${dir}/`)
}

/** Names a document directory may not start with: what Presmium, git and Node keep there. */
const RESERVED = new Set(['.git', '.presmium', 'node_modules', 'dist', 'templates'])

/**
 * Why `dir` cannot name a document directory (relative to the workspace
 * root, `/` separators, letters, digits, `-`, `_` and `.`, no hidden or
 * reserved segment); undefined when it can.
 */
export function invalidDocumentDir(dir: string): string | undefined {
  if (!dir || dir.startsWith('/') || dir.endsWith('/')) return 'a document directory is a relative path such as weeks/03'
  const parts = dir.split('/')
  if (parts.some(part => !/^[\p{L}\p{N}_-][\p{L}\p{N}._-]*$/u.test(part))) return `"${dir}": each part of a document directory has letters, digits, -, _ and . only, and does not start with .`
  if (RESERVED.has(parts[0]!)) return `"${dir}": ${parts[0]} is not a document directory`
  return undefined
}

/** A pattern segment (`*` and `?` wildcards) as a regular expression. */
function segmentPattern(segment: string): RegExp {
  const escaped = segment.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[^/]*').replace(/\?/g, '[^/]')
  return new RegExp(`^${escaped}$`)
}

/** Whether a path (relative to the workspace root) matches a document pattern such as `weeks/*\/lecture.md`. */
export function matchesPattern(pattern: string, path: string): boolean {
  const want = pattern.replace(/^\.\//, '').split('/')
  const have = path.split('/')
  return want.length === have.length && want.every((segment, i) => segmentPattern(segment).test(have[i]!))
}

/** The pattern segments, for a walk of the directories: literal names stay strings, wildcards become patterns. */
export function patternSegments(pattern: string): (string | RegExp)[] {
  return pattern.replace(/^\.\//, '').split('/').map(segment => (/[*?]/.test(segment) ? segmentPattern(segment) : segment))
}

/** URLs that name no file of the workspace: a scheme, protocol-relative, absolute, or a fragment. */
const NOT_RELATIVE = /^(?:[a-z][a-z\d+.-]*:|\/|#|\?)/i

/**
 * One relative URL of a Markdown file at `file`, after the directory `from`
 * moved to `to` (the file itself may have moved with it, from `was`): the
 * URL to write, or undefined when it stays. Paths are relative to the
 * workspace root.
 */
export function movedUrl(url: string, file: string, was: string, from: string, to: string): string | undefined {
  if (NOT_RELATIVE.test(url)) return undefined
  const match = /^([^?#]*)(.*)$/s.exec(url)!
  const path = match[1]!
  if (!path) return undefined
  let decoded = path
  try {
    decoded = decodeURI(path)
  } catch {
    // Written as it is.
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

/**
 * A Markdown text with its relative links, images and link definitions
 * rewritten for a move of `from` to `to` (see `movedUrl`); MyST directive
 * arguments that name files (`{include}`, `{literalinclude}`, `{figure}`,
 * `{image}`) too. Returns the text, unchanged when nothing pointed into or out of the moved directory.
 */
export function rewriteLinks(text: string, file: string, was: string, from: string, to: string): string {
  const url = (value: string) => movedUrl(value, file, was, from, to) ?? value
  return text
    // [text](url "title"), ![alt](url)
    .replace(/(\]\()(<[^>]*>|[^)\s]+)/g, (_all, open: string, target: string) => {
      const bracketed = target.startsWith('<')
      const value = bracketed ? target.slice(1, -1) : target
      const next = url(value)
      return `${open}${bracketed ? `<${next}>` : next}`
    })
    // [label]: url
    .replace(/^(\s{0,3}\[[^\]]+\]:\s*)(\S+)/gm, (_all, head: string, target: string) => `${head}${url(target)}`)
    // ```{include} path, :::{literalinclude} path
    .replace(/^(\s*(?:`{3,}|:{3,})\{(?:include|literalinclude|figure|image)\}\s+)(\S+)/gm, (_all, head: string, target: string) => `${head}${url(target)}`)
}
