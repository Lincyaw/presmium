import { fingerprint, parseAnchor } from '@lincyaw/kernel'
import type { AnchorResolver, AnchorString, RecordedAnchor, Resolution, ResolvedLocation } from '@lincyaw/kernel'
import { findRegions, toSnippet } from './regions.ts'

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

export interface Candidate {
  location: ResolvedLocation
  print: string
}

export function locate(file: string, lines: string[], start: number, end: number): ResolvedLocation {
  return { file, startLine: start, endLine: end, text: lines.slice(start - 1, end).join('\n') }
}

export function found(location: ResolvedLocation, recorded?: RecordedAnchor, print = codeFingerprint(location.text)): Resolution {
  const moved = recorded !== undefined && recorded.fingerprint === print
    && (recorded.file !== location.file || recorded.startLine !== location.startLine)
  return { status: moved ? 'moved' : 'exact', location, fingerprint: print }
}

export function notFound(message: string, candidates: Candidate[], recorded?: RecordedAnchor): Resolution {
  const similar = recorded ? candidates.filter(c => c.print === recorded.fingerprint).map(c => c.location) : []
  return similar.length > 0
    ? { status: 'fuzzy', candidates: similar, message: `${message}; candidates: ${similar.map(c => `${c.file}:${c.startLine}`).join(', ')}` }
    : { status: 'lost', message }
}

function at(ref?: string): string {
  return ref ? ` at ${ref}` : ''
}

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
