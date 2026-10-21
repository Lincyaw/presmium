import { irBlocks } from '@lincyaw/kernel'
import type { Finding, IRSection, MdastNode, SourcePos } from '@lincyaw/kernel'
import type { RawSection } from './sections.ts'
import { fileOf } from './source.ts'
import { AUDIENCE_SCOPE } from './audience.ts'

interface Entry { key: string, section: IRSection, findings: Finding[], bytes: number }
const MAX_BYTES = 16 << 20
const MAX_SECTIONS = 2048

/** Cache before global passes, which must still see a fresh, complete IR. */
export class SectionCache {
  #context = ''
  #bytes = 0
  readonly #entries = new Map<string, Entry>()
  readonly #nodes = new WeakMap<MdastNode, { file: string, line: number, key: string }>()

  context(key: string): void {
    if (key === this.#context) return
    this.#context = key
    this.#entries.clear()
    this.#bytes = 0
  }

  key(section: RawSection): string {
    const { nodes, source, ...rest } = section
    const { file, line } = source
    const keys = nodes.map((node) => {
      const known = this.#nodes.get(node)
      if (known?.file === file && known.line === line) return known.key
      const key = JSON.stringify(node, function (this: MdastNode, name: string, value: unknown) {
        if (typeof this.type !== 'string' || fileOf(this, '') !== file) return value
        if (name === 'line' && typeof value === 'number') return value - line
        if (name !== 'position' || !value) return value
        const position = value as { start?: { line: number }, end?: { line: number } }
        return {
          ...position,
          ...position.start ? { start: { ...position.start, line: position.start.line - line } } : {},
          ...position.end ? { end: { ...position.end, line: position.end.line - line } } : {},
        }
      })
      this.#nodes.set(node, { file, line, key })
      return key
    })
    return JSON.stringify({ ...rest, source: { ...source, line: 0, endLine: (source.endLine ?? line) - line } }) + '\0' + keys.join('\0')
  }

  get(id: string, key: string, source: SourcePos): { section: IRSection, findings: Finding[] } | undefined {
    const entry = this.#entries.get(id)
    if (entry?.key !== key) return undefined
    const findings = entry.findings.length ? structuredClone(entry.findings) : []
    const delta = source.line - entry.section.source.line
    const moved = new Set<NonNullable<Finding['source']>>()
    for (const finding of findings) {
      if (finding.source?.file !== source.file || moved.has(finding.source)) continue
      moved.add(finding.source)
      moveSource(finding.source, delta)
    }
    return { section: entry.section, findings }
  }

  set(id: string, key: string, section: IRSection, findings: Finding[]): void {
    const old = this.#entries.get(id)
    if (old) this.#bytes -= old.bytes
    this.#entries.delete(id)
    const bytes = (key.length + JSON.stringify({ section, findings }).length) * 2
    if (bytes > MAX_BYTES) return
    this.#entries.set(id, { key, section, findings: findings.length ? structuredClone(findings) : [], bytes })
    this.#bytes += bytes
    while (this.#bytes > MAX_BYTES || this.#entries.size > MAX_SECTIONS) {
      const first = this.#entries.keys().next().value!
      this.#bytes -= this.#entries.get(first)!.bytes
      this.#entries.delete(first)
    }
  }

  prune(ids: Set<string>): void {
    for (const [id, entry] of this.#entries) {
      if (ids.has(id)) continue
      this.#entries.delete(id)
      this.#bytes -= entry.bytes
    }
  }
}

export function moveSection(section: IRSection, source: SourcePos): void {
  const delta = source.line - section.source.line
  const moved = new Set<SourcePos>()
  if (delta) for (const block of irBlocks(section.blocks)) {
    if (block.source.file !== source.file || moved.has(block.source)) continue
    moved.add(block.source)
    moveSource(block.source, delta)
  }
  section.source = { ...source }
}

function moveSource(source: { line?: number, endLine?: number }, delta: number): void {
  if (source.line !== undefined) source.line += delta
  if (source.endLine !== undefined) source.endLine += delta
}

export function hasPluginSyntax(nodes: MdastNode[], directives: ReadonlyMap<string, unknown>, roles: ReadonlyMap<string, unknown>): boolean {
  return nodes.some(node => node.type === AUDIENCE_SCOPE
    || (node.type === 'mystDirective' && directives.has(String(node.name)))
    || (node.type === 'mystRole' && roles.has(String(node.name)))
    || Boolean(node.children?.length && hasPluginSyntax(node.children, directives, roles)))
}
