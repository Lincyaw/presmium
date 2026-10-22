import { fingerprint, parseAnchor } from '@lincyaw/kernel'
import type { AnchorString, RecordedAnchor, Resolution, ResolvedLocation } from '@lincyaw/kernel'
import { toSnippet } from './regions.ts'

export function splitTarget(anchor: AnchorString): { scheme: string, file: string, name: string } | undefined {
  const parsed = parseAnchor(anchor)
  const hash = (parsed?.scheme === 'pattern' ? parsed.target.indexOf('#') : parsed?.target.lastIndexOf('#')) ?? -1
  if (!parsed || hash <= 0 || hash === parsed.target.length - 1) return undefined
  return { scheme: parsed.scheme, file: parsed.target.slice(0, hash), name: parsed.target.slice(hash + 1) }
}

export function codeFingerprint(text: string): string {
  const lines = toSnippet(text).code.split('\n')
  const width = (line: string) => /^[ \t]*/.exec(line)![0].replace(/\t/g, '    ').length
  const widths = [...new Set(lines.filter(line => line.trim()).map(width))].sort((a, b) => a - b)
  return fingerprint(lines.map(line => (line.trim() ? ' '.repeat(widths.indexOf(width(line))) + line.trimStart() : '')).join('\n'))
}

/** A place an anchor that was not found could have moved to. */
export interface Candidate {
  location: ResolvedLocation
  fingerprint: string
}

export function lineRange(file: string, lines: string[], start: number, end: number): ResolvedLocation {
  return { file, startLine: start, endLine: end, text: lines.slice(start - 1, end).join('\n') }
}

/** The resolution of an anchor found at `location`: moved when the recorded code is now elsewhere, exact otherwise. */
export function resolvedAt(location: ResolvedLocation, recorded?: RecordedAnchor, print = codeFingerprint(location.text)): Resolution {
  const moved = recorded !== undefined && recorded.fingerprint === print
    && (recorded.file !== location.file || recorded.startLine !== location.startLine)
  return { status: moved ? 'moved' : 'exact', location, fingerprint: print }
}

/** The resolution of an anchor not found: fuzzy when a candidate has the recorded fingerprint, lost otherwise. */
export function unresolved(message: string, candidates: Candidate[], recorded?: RecordedAnchor): Resolution {
  const similar = recorded ? candidates.filter(c => c.fingerprint === recorded.fingerprint).map(c => c.location) : []
  return similar.length > 0
    ? { status: 'fuzzy', candidates: similar, message: `${message}; candidates: ${similar.map(c => `${c.file}:${c.startLine}`).join(', ')}` }
    : { status: 'lost', message }
}
