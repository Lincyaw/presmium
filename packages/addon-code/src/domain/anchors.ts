import { fingerprint, parseAnchor } from '@presmium/kernel'
import type { AnchorResolver, AnchorString, RecordedAnchor, Resolution, ResolvedLocation } from '@presmium/kernel'
import { findRegions, toSnippet } from './regions.ts'

/** `scheme:<file>#<name>`: the file is relative to the workspace root. */
export function splitTarget(anchor: AnchorString): { scheme: string, file: string, name: string } | undefined {
  const parsed = parseAnchor(anchor)
  const hash = parsed?.target.lastIndexOf('#') ?? -1
  if (!parsed || hash <= 0 || hash === parsed.target.length - 1) return undefined
  return { scheme: parsed.scheme, file: parsed.target.slice(0, hash), name: parsed.target.slice(hash + 1) }
}

/**
 * Fingerprint of a location: the displayed code, so region markers and
 * formatting do not count. Each indentation width becomes its nesting level,
 * so re-indenting with another width does not count either, while moving a
 * line into or out of a block does.
 */
export function codeFingerprint(text: string): string {
  const lines = toSnippet(text).code.split('\n')
  const width = (line: string) => /^[ \t]*/.exec(line)![0].replace(/\t/g, '    ').length
  const widths = [...new Set(lines.filter(line => line.trim()).map(width))].sort((a, b) => a - b)
  return fingerprint(lines.map(line => (line.trim() ? ' '.repeat(widths.indexOf(width(line))) + line.trimStart() : '')).join('\n'))
}

/** A location an anchor may have moved to, with its fingerprint. */
export interface Candidate {
  location: ResolvedLocation
  print: string
}

/** A location covering whole lines `start..end` (1-based, inclusive) of `lines`. */
export function locate(file: string, lines: string[], start: number, end: number): ResolvedLocation {
  return { file, startLine: start, endLine: end, text: lines.slice(start - 1, end).join('\n') }
}

/**
 * Resolution of a location found the original way: `moved` when the lock
 * recorded the same code elsewhere, `exact` otherwise (content changes are
 * reported by the checks, not by the status).
 */
export function found(location: ResolvedLocation, recorded?: RecordedAnchor, print = codeFingerprint(location.text)): Resolution {
  const moved = recorded !== undefined && recorded.fingerprint === print
    && (recorded.file !== location.file || recorded.startLine !== location.startLine)
  return { status: moved ? 'moved' : 'exact', location, fingerprint: print }
}

/**
 * Resolution when the original way finds nothing: `fuzzy` with the candidates
 * that carry the locked code under another name (a renamed region or
 * declaration, a method moved to another class), `lost` otherwise.
 */
export function notFound(message: string, candidates: Candidate[], recorded?: RecordedAnchor): Resolution {
  const similar = recorded ? candidates.filter(c => c.print === recorded.fingerprint).map(c => c.location) : []
  return similar.length > 0
    ? { status: 'fuzzy', candidates: similar, message: `${message}; candidates: ${similar.map(c => `${c.file}:${c.startLine}`).join(', ')}` }
    : { status: 'lost', message }
}

function at(ref?: string): string {
  return ref ? ` at ${ref}` : ''
}

/** `region:<file>#<name>`: the code between `#region <name>` and its `#endregion` marker (P-10). */
export const regionResolver: AnchorResolver = {
  scheme: 'region',
  async resolve(anchor, src, recorded, ref) {
    const target = splitTarget(anchor)
    if (!target) return { status: 'lost', message: `malformed anchor "${anchor}": expected region:<file>#<name>` }
    const text = await src.read(target.file, ref)
    if (text === undefined) return { status: 'lost', message: `${target.file} not found${at(ref)}` }
    const lines = text.split(/\r?\n/)
    const regions = findRegions(lines).map((r) => {
      const location = locate(target.file, lines, r.open + 2, r.close)
      return { name: r.name, location, print: codeFingerprint(location.text) }
    })
    const region = regions.find(r => r.name === target.name)
    if (region) return found(region.location, recorded, region.print)
    return notFound(`region "${target.name}" not found in ${target.file}${at(ref)}`, regions, recorded)
  },
}
