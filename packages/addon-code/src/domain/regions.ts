const MARKERS: { start: RegExp, end: RegExp }[] = [
  { start: /^\s*\/\/\s*#?region\b\s*(.*?)\s*$/, end: /^\s*\/\/\s*#?endregion\b\s*(.*?)\s*$/ },
  { start: /^\s*<!--\s*#?region\b\s*(.*?)\s*-->/, end: /^\s*<!--\s*#?endregion\b\s*(.*?)\s*-->/ },
  { start: /^\s*\/\*\s*#region\b\s*(.*?)\s*\*\//, end: /^\s*\/\*\s*#endregion\b\s*(.*?)\s*\*\// },
  { start: /^\s*#[rR]egion\b\s*(.*?)\s*$/, end: /^\s*#[eE]nd ?[rR]egion\b\s*(.*?)\s*$/ },
  { start: /^\s*#\s*#?region\b\s*(.*?)\s*$/, end: /^\s*#\s*#?endregion\b\s*(.*?)\s*$/ },
  { start: /^\s*(?:--|::|@?REM)\s*#region\b\s*(.*?)\s*$/, end: /^\s*(?:--|::|@?REM)\s*#endregion\b\s*(.*?)\s*$/ },
  { start: /^\s*#pragma\s+region\b\s*(.*?)\s*$/, end: /^\s*#pragma\s+endregion\b\s*(.*?)\s*$/ },
  { start: /^\s*\(\*\s*#region\b\s*(.*?)\s*\*\)/, end: /^\s*\(\*\s*#endregion\b\s*(.*?)\s*\*\)/ },
]

interface Marker {
  kind: 'start' | 'end'
  name: string
  style: number
}

function marker(line: string): Marker | undefined {
  for (const [style, { start, end }] of MARKERS.entries()) {
    const opened = start.exec(line)
    if (opened) return { kind: 'start', name: opened[1] ?? '', style }
    const closed = end.exec(line)
    if (closed) return { kind: 'end', name: closed[1] ?? '', style }
  }
  return undefined
}

export function isRegionMarker(line: string): boolean {
  return marker(line) !== undefined
}

export interface Region {
  name: string
  open: number
  close: number
}

export function findRegions(lines: string[]): Region[] {
  const open: (Marker & { line: number })[] = []
  const regions: Region[] = []
  lines.forEach((line, i) => {
    const m = marker(line)
    if (m?.kind === 'start') open.push({ ...m, line: i })
    if (m?.kind !== 'end') return
    const at = open.findLastIndex(o => o.style === m.style && (m.name === '' || o.name === m.name))
    if (at < 0) return
    const [start] = open.splice(at, open.length - at)
    regions.push({ name: start!.name, open: start!.line, close: i })
  })
  return regions.sort((a, b) => a.open - b.open)
}

export function dedent(lines: string[]): string[] {
  const indents = lines.filter(l => l.trim() !== '').map(l => /^[ \t]*/.exec(l)![0].length)
  const common = indents.length > 0 ? Math.min(...indents) : 0
  return lines.map(l => l.slice(Math.min(common, /^[ \t]*/.exec(l)![0].length)))
}

export interface Snippet {
  code: string
  units: Map<string, { from: number, to: number }>
}

export function toSnippet(text: string): Snippet {
  const lines = text.split(/\r?\n/)
  const kept: string[] = []
  const before: number[] = []
  for (const line of lines) {
    before.push(kept.length)
    if (!isRegionMarker(line)) kept.push(line)
  }
  const units = new Map<string, { from: number, to: number }>()
  for (const region of findRegions(lines)) {
    const from = before[region.open]! + 1
    const to = before[region.close]!
    if (to >= from && !units.has(region.name)) units.set(region.name, { from, to })
  }
  return { code: dedent(kept).join('\n'), units }
}
