import { irBlocks } from '@lincyaw/kernel'
import type { IRBlock, IRDocument, IRSection, PreviewEditedBlock } from '@lincyaw/kernel'

/** Narration is edited in its step panel; reading-only text belongs on the document canvas. */
export function bodyBlocks(section: IRSection): IRBlock[] {
  return section.blocks.filter(b => b.role === 'visual' || (b.only && !b.only.includes('lecture')))
}

interface Range { start: number, end: number }
function labelStart(lines: string[], start: number): number {
  let at = start - 1
  while (at >= 0 && !lines[at]!.trim()) at--
  return at >= 0 && /^\([^)]+\)=\s*$/.test(lines[at]!.trim()) ? at : start
}

/** The complete container fence, not just the paragraph's source lines inside a slide. */
function containers(lines: string[]): Range[] {
  const stack: { char: string, count: number, kind: string, start: number, literal?: boolean }[] = []
  const found: Range[] = []
  lines.forEach((line, at) => {
    const last = stack.at(-1)
    // Directive-looking examples inside ordinary code fences are literal source.
    if (last?.literal) {
      const close = /^\s*(`{3,}|~{3,})\s*$/.exec(line)
      if (close && close[1]![0] === last.char && close[1]!.length >= last.count) stack.pop()
      return
    }
    const open = /^\s*(`{3,}|:{3,})\{([^}]+)\}/.exec(line)
    if (open) { stack.push({ char: open[1]![0]!, count: open[1]!.length, kind: open[2]!, start: at }); return }
    const fence = /^\s*(`{3,}|:{3,})\s*$/.exec(line)
    if (fence && last && fence[1]![0] === last.char && fence[1]!.length >= last.count) {
      stack.pop()
      if (['slide', 'only', 'audience'].includes(last.kind)) found.push({ start: last.start, end: at })
      return
    }
    const code = /^\s*(`{3,}|~{3,})(.*)$/.exec(line)
    if (code) stack.push({ char: code[1]![0]!, count: code[1]!.length, kind: 'code', start: at, literal: true })
  })
  return found
}

function rangeOf(block: IRBlock, lines: string[], wrappers: Range[]): Range {
  let range = { start: block.source.line - 1, end: (block.source.endLine ?? block.source.line) - 1 }
  for (const wrapper of wrappers) if (wrapper.start < range.start && wrapper.end >= range.end) range = wrapper
  return { ...range, start: labelStart(lines, range.start) }
}

function fenced(name: string, options: string[], body: string): string {
  const width = Math.max(3, ...[...body.matchAll(/^(:{3,})/gm)].map(m => m[1]!.length + 1))
  const fence = ':'.repeat(width)
  return `${fence}{${name}}\n${options.length ? `${options.join('\n')}\n` : ''}\n${body.trim()}\n${fence}`
}

const safeId = (id: string) => id.replace(/[^\p{L}\p{N}_.-]/gu, '-').slice(0, 150) || 'block'
function bodySource(block: PreviewEditedBlock, original: IRBlock | undefined, lines: string[]): string {
  const id = safeId(block.id)
  const raw = original ? lines.slice(original.source.line - 1, original.source.endLine ?? original.source.line).join('\n') : undefined
  let content: string
  if (block.scene !== undefined) {
    if (!/^[\w-]+(?:\/[\w-]+)*$/.test(block.scene)) throw new Error('invalid-scene')
    const durations = block.durations?.length ? block.durations : [1000]
    const timing = `:durations: ${durations.map(ms => `${ms}ms`).join(', ')}`
    if (original?.node.type === 'component' && original.node.name === 'PmScene' && raw && /^\s*(`{3,}|:{3,})\{scene\}/.test(raw)) {
      content = raw.replace(/^(\s*(?:`{3,}|:{3,})\{scene\})[^\n]*/, `$1 ${block.scene}`)
      content = /^[ \t]*:durations:.*$/m.test(content)
        ? content.replace(/^[ \t]*:durations:.*$/m, timing)
        : content.replace('\n', `\n${timing}\n`)
    } else content = `:::{scene} ${block.scene}\n${timing}\n:::`
  } else if (block.markdown !== undefined) content = block.markdown
  else if (raw !== undefined) content = raw
  else throw new Error('unknown-block')
  // A source label is restored by the outer block so a drag/type conversion keeps comments and references attached.
  content = content.replace(/^\([^)]+\)=\s*\n/, '')
  const at = original?.at ?? block.at ?? 0
  const options = [`:label: ${id}`, `:at: ${at}`, ...original?.until === undefined ? [] : [`:until: ${original.until}`], ...original?.audience ? [`:audience: ${original.audience.join(', ')}`] : []]
  let written = fenced('slide', options, content)
  if (original?.only) written = fenced('only', [], written).replace('{only}', `{only} ${original.only.join(', ')}`)
  return written
}

/** Applies a complete ordered list of body blocks, retaining non-body source and pinning legacy speech to its step. */
export function writeBodyBlocks(doc: IRDocument, section: IRSection, source: string, blocks: PreviewEditedBlock[]): string {
  const originals = bodyBlocks(section)
  const file = originals[0]?.source.file ?? section.source.file
  if (originals.some(b => b.source.file !== file) || file !== section.source.file) throw new Error('block-multiple-files')
  const lines = source.split('\n')
  const wrappers = containers(lines)
  const entries = originals.map(block => ({ block, range: rangeOf(block, lines, wrappers) }))
  const ranges = entries.map(e => e.range).sort((a, b) => a.start - b.start || b.end - a.end).filter((range, i, all) => !all.slice(0, i).some(previous => previous.start <= range.start && previous.end >= range.end))
  const speech = [...irBlocks(section.blocks)].filter(b => b.role === 'narration' && (!b.only || b.only.includes('lecture')))
  if (speech.some(b => b.source.file === file && ranges.some(r => r.start <= b.source.line - 1 && r.end >= (b.source.endLine ?? b.source.line) - 1))) throw new Error('block-mixed-container')
  const known = new Map(originals.map(b => [b.id, b]))
  const ids = new Set<string>()
  const normalized = blocks.map(block => {
    const id = safeId(block.id)
    if (ids.has(id)) throw new Error('duplicate-block')
    ids.add(id)
    return { ...block, id }
  })
  const groups = new Map<string, typeof entries>()
  for (const entry of entries) {
    const key = `${entry.range.start}:${entry.range.end}`
    const group = groups.get(key) ?? []
    group.push(entry); groups.set(key, group)
  }
  const output: string[] = []
  for (let i = 0; i < normalized.length; i++) {
    const block = normalized[i]!
    const original = known.get(block.source ?? block.id)
    const unchanged = (candidate: PreviewEditedBlock | undefined, expected: IRBlock) => candidate?.id === expected.id && (candidate.source ?? candidate.id) === expected.id && candidate.markdown === undefined && (candidate.scene === undefined || (expected.node.type === 'component' && expected.node.name === 'PmScene' && candidate.scene === expected.node.props.scene && JSON.stringify(candidate.durations ?? [1000]) === JSON.stringify(expected.node.durations ?? [1000])))
    const entry = original && entries.find(e => e.block.id === original.id)
    const group = entry && groups.get(`${entry.range.start}:${entry.range.end}`)!
    // Several IR blocks can share one source container. Retain that container once,
    // only when every member is unchanged and their order is still contiguous.
    if (entry && group?.every((member, offset) => unchanged(normalized[i + offset], member.block))) {
      output.push(lines.slice(entry.range.start, entry.range.end + 1).join('\n'))
      i += group.length - 1
    } else output.push(bodySource(block, original, lines))
  }

  const patches: { start: number, end: number, text: string }[] = []
  // Freeze implicit legacy speech before moving body blocks changes what precedes it.
  for (const block of speech) {
    if (block.source.file !== file || block.node.type !== 'markdown' || block.node.narration) continue
    if (wrappers.some(r => r.start < block.source.line - 1 && r.end >= (block.source.endLine ?? block.source.line) - 1)) throw new Error('block-mixed-container')
    const raw = lines.slice(block.source.line - 1, block.source.endLine ?? block.source.line).join('\n')
    patches.push({ start: block.source.line - 1, end: (block.source.endLine ?? block.source.line) - 1, text: fenced('narration', [`:label: ${block.id}`, `:at: ${block.at}`, ':mode: during', ...block.audience ? [`:audience: ${block.audience.join(', ')}`] : []], raw) })
  }
  ranges.forEach((range, index) => patches.push({ ...range, text: index === ranges.length - 1 ? output.slice(index).join('\n\n') : output[index] ?? '' }))
  if (!ranges.length) patches.push({ start: section.source.endLine ?? section.source.line, end: (section.source.endLine ?? section.source.line) - 1, text: `\n${output.join('\n\n')}\n` })
  for (const patch of patches.sort((a, b) => b.start - a.start)) lines.splice(patch.start, patch.end - patch.start + 1, patch.text)
  return lines.join('\n')
}
