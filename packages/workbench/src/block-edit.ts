import { irBlocks } from '@lincyaw/kernel'
import type {
  IRBlock,
  IRDocument,
  IRSection,
  MdastNode,
  PreviewEditedBlock,
} from '@lincyaw/kernel'

/** Legacy prose remains on the document canvas with its authored role and timing. */
export function bodyBlocks(section: IRSection, doc?: IRDocument): IRBlock[] {
  return section.blocks.filter(
    (b) => b.role === 'visual' || (b.only && !b.only.includes('lecture')) || (doc && doc.meta.contentModel !== 'blocks' && b.role === 'narration'),
  )
}

const proseNodes = new Set(['root', 'paragraph', 'text', 'emphasis', 'strong', 'delete', 'inlineCode', 'link', 'image', 'blockquote', 'list', 'listItem', 'break', 'thematicBreak', 'table', 'tableRow', 'tableCell'])
function simpleProse(node: MdastNode, headings = false, table = false): boolean {
  if (node.type === 'table' && Array.isArray(node.align) && node.align.some(align => align !== null && align !== 'left')) return false
  if (node.type === 'tableCell' && node.align !== undefined && node.align !== null && node.align !== 'left') return false
  if (table && node.type === 'image') return false
  return (proseNodes.has(node.type) || headings && node.type === 'heading') && (node.children ?? []).every(child => simpleProse(child, headings, table || node.type === 'table'))
}
function opaqueNarration(block: IRBlock): boolean {
  return block.role === 'narration' && (block.until !== undefined || (block.span ?? 0) > 0 || block.node.type !== 'markdown' || Boolean(block.node.reveal) || !simpleProse(block.node.mdast))
}
function hasCue(source: string): boolean {
  return [...source.matchAll(/\{cue\}[ \t]*`/g)].some(match => {
    let escapes = 0
    for (let at = match.index - 1; at >= 0 && source[at] === '\\'; at--) escapes++
    return escapes % 2 === 0
  })
}

interface Range {
  start: number
  end: number
  reveal?: boolean
}
function labelStart(lines: string[], start: number): number {
  let at = start - 1
  while (at >= 0 && !lines[at]!.trim()) at--
  return at >= 0 && /^\([^)]+\)=\s*$/.test(lines[at]!.trim()) ? at : start
}

/** The complete container fence, not just the paragraph's source lines inside a slide. */
function containers(lines: string[]): Range[] {
  const stack: {
    char: string
    count: number
    kind: string
    start: number
    literal?: boolean
    headers?: boolean
    reveal?: boolean
  }[] = []
  const found: Range[] = []
  lines.forEach((line, at) => {
    const last = stack.at(-1)
    // Directive-looking examples inside ordinary code fences are literal source.
    if (last?.literal) {
      const close = /^\s*(`{3,}|~{3,})\s*$/.exec(line)
      if (close && close[1]![0] === last.char && close[1]!.length >= last.count)
        stack.pop()
      return
    }
    if (last?.headers) {
      if (/^[ \t]*:[\w-]+:/.test(line)) {
        last.reveal ||= /^[ \t]*:reveal:/.test(line)
        return
      }
      last.headers = false
    }
    const open = /^\s*(`{3,}|:{3,})\{([^}]+)\}/.exec(line)
    if (open) {
      stack.push({
        char: open[1]![0]!,
        count: open[1]!.length,
        kind: open[2]!,
        start: at,
        headers: true,
      })
      return
    }
    const fence = /^\s*(`{3,}|:{3,})\s*$/.exec(line)
    if (
      fence &&
      last &&
      fence[1]![0] === last.char &&
      fence[1]!.length >= last.count
    ) {
      stack.pop()
      if (['slide', 'only', 'audience'].includes(last.kind))
        found.push({ start: last.start, end: at, reveal: last.reveal })
      return
    }
    const code = /^\s*(`{3,}|~{3,})(.*)$/.exec(line)
    if (code)
      stack.push({
        char: code[1]![0]!,
        count: code[1]!.length,
        kind: 'code',
        start: at,
        literal: true,
      })
  })
  return found
}

function rangeOf(block: IRBlock, lines: string[], wrappers: Range[]): Range {
  let range = {
    start: block.source.line - 1,
    end: (block.source.endLine ?? block.source.line) - 1,
  }
  for (const wrapper of wrappers)
    if (wrapper.start < range.start && wrapper.end >= range.end) range = wrapper
  return { ...range, start: labelStart(lines, range.start) }
}

function fenced(name: string, options: string[], body: string): string {
  const width = Math.max(
    3,
    ...[...body.matchAll(/^(:{3,})/gm)].map((m) => m[1]!.length + 1),
  )
  const fence = ':'.repeat(width)
  return `${fence}{${name}}\n${options.length ? `${options.join('\n')}\n` : ''}\n${body.trim()}\n${fence}`
}

const safeId = (id: string) =>
  id.replace(/[^\p{L}\p{N}_.-]/gu, '-').slice(0, 150) || 'block'
const emptyMarkdown = (source: string) => !source.trim() || /^(?:[-+*]|\d+[.)])[ \t]*$/.test(source.trim())
function bodySource(
  block: PreviewEditedBlock,
  original: IRBlock | undefined,
  lines: string[],
): string {
  const id = safeId(block.id)
  if (original?.role === 'narration' && block.markdown !== undefined && hasCue(block.markdown)) throw new Error('block-step-order')
  const raw = original
    ? lines
        .slice(
          original.source.line - 1,
          original.source.endLine ?? original.source.line,
        )
        .join('\n')
    : undefined
  let content: string
  if (block.scene !== undefined) {
    if (!/^[\w-]+(?:\/[\w-]+)*$/.test(block.scene))
      throw new Error('invalid-scene')
    const durations = block.durations?.length ? block.durations : [1000]
    const timing = `:durations: ${durations.map((ms) => `${ms}ms`).join(', ')}`
    if (
      original?.node.type === 'component' &&
      original.node.name === 'PmScene' &&
      raw &&
      /^\s*(`{3,}|:{3,})\{scene\}/.test(raw)
    ) {
      content = raw.replace(
        /^(\s*(?:`{3,}|:{3,})\{scene\})[^\n]*/,
        `$1 ${block.scene}`,
      )
      content = /^[ \t]*:durations:.*$/m.test(content)
        ? content.replace(/^[ \t]*:durations:.*$/m, timing)
        : content.replace('\n', `\n${timing}\n`)
    } else content = `:::{scene} ${block.scene}\n${timing}\n:::`
  } else if (block.markdown !== undefined) content = block.markdown
  else if (raw !== undefined) {
    content = raw
    if (original?.role === 'narration' && original.node.type === 'markdown' && original.node.narration) {
      const body = /^(\s*(?:`{3,}|:{3,})\{narration\}[^\n]*\n(?:[ \t]*:[^:\n]+:[^\n]*\n)*[ \t]*\r?\n)([\s\S]*)(\r?\n[ \t]*(?:`{3,}|:{3,})[ \t]*\r?)$/.exec(raw)
      if (!body) throw new Error('block-mixed-container')
      content = body[2]!
    }
  }
  else throw new Error('unknown-block')
  // A source label is restored by the outer block so a drag/type conversion keeps comments and references attached.
  content = content.replace(/^\([^)]+\)=\s*\n/, '')
  const at = original?.at ?? block.at ?? 0
  const options = [
    `:label: ${id}`,
    `:at: ${at}`,
    ...(original?.until === undefined ? [] : [`:until: ${original.until}`]),
    ...(original?.audience
      ? [`:audience: ${original.audience.join(', ')}`]
      : []),
  ]
  if (original?.role === 'narration' && block.scene !== undefined) throw new Error('block-step-order')
  const narration = original?.role === 'narration'
  // Existing speech never becomes visual merely because it was edited on the document canvas.
  const mode = narration && original.node.type === 'markdown' ? original.node.narration?.mode ?? 'during' : undefined
  let written = fenced(narration ? 'narration' : 'slide', [...options, ...(mode ? [`:mode: ${mode}`] : [])], content)
  if (original?.only)
    written = fenced('only', [], written).replace(
      '{only}',
      `{only} ${original.only.join(', ')}`,
    )
  return written
}

/** Applies a complete ordered list of body blocks, retaining non-body source and pinning legacy speech to its step. */
export function writeBodyBlocks(
  doc: IRDocument,
  section: IRSection,
  source: string,
  blocks: PreviewEditedBlock[],
  restored?: ReadonlyMap<string, IRBlock>,
): string {
  const originals = bodyBlocks(section, doc)
  const file = originals[0]?.source.file ?? section.source.file
  if (
    originals.some((b) => b.source.file !== file) ||
    file !== section.source.file
  )
    throw new Error('block-multiple-files')
  const lines = source.split('\n')
  const wrappers = containers(lines)
  const entries = originals.map((block) => ({
    block,
    range: rangeOf(block, lines, wrappers),
  }))
  const ranges = entries
    .map((e) => e.range)
    .sort((a, b) => a.start - b.start || b.end - a.end)
    .filter(
      (range, i, all) =>
        !all
          .slice(0, i)
          .some(
            (previous) =>
              previous.start <= range.start && previous.end >= range.end,
          ),
    )
  const speech = [...irBlocks(section.blocks)].filter(
    (b) => b.role === 'narration' && (!b.only || b.only.includes('lecture')) && !originals.includes(b),
  )
  if (
    speech.some(
      (b) =>
        b.source.file === file &&
        ranges.some(
          (r) =>
            r.start <= b.source.line - 1 &&
            r.end >= (b.source.endLine ?? b.source.line) - 1,
        ),
    )
  )
    throw new Error('block-mixed-container')
  const known = new Map(originals.map((b) => [b.id, b]))
  // A published split has its own real IR identity even while the iframe still
  // holds an older projection alias during an acknowledgement/IR gap.
  const rebound = blocks.map(block => known.has(block.id) || restored?.has(block.id) ? { ...block, source: block.id } : block)
  for (const block of rebound) {
    if (!block.source || known.has(block.source)) continue
    const previous = restored?.get(block.source)
    if (!previous || block.id !== previous.id || previous.source.file !== file || block.markdown === undefined || previous.node.type !== 'markdown' || previous.node.reveal || (previous.span ?? 0) > 0 || !simpleProse(previous.node.mdast, previous.role === 'visual') || opaqueNarration(previous)) throw new Error('block-source-binding')
    known.set(previous.id, previous)
  }
  const ids = new Set<string>()
  // Markdown has no empty paragraph IR block. An empty editor placeholder must
  // remove its old source, rather than emit an invisible labelled slide that a
  // later redo cannot find and would append again.
  const normalized = rebound.filter(block => block.markdown === undefined || !emptyMarkdown(block.markdown) || block.scene !== undefined).map((block) => {
    const id = safeId(block.id)
    if (ids.has(id)) throw new Error('duplicate-block')
    ids.add(id)
    return { ...block, id }
  })
  // A reveal without an explicit starting step depends on its predecessors.
  // Refuse structural edits that would silently move its existing narration.
  const collapsedSources = (items: PreviewEditedBlock[]) =>
    items
      .map((item) => item.source ?? item.id)
      .filter((id, index, all) => index === 0 || id !== all[index - 1])
  // Cues and unrecognised MyST remain opaque. A body transaction cannot flatten,
  // delete or move their anchor, nor change which timed blocks precede it.
  for (let index = 0; index < originals.length; index++) {
    const original = originals[index]!
    if (!opaqueNarration(original)) continue
    const moved = normalized.findIndex(block => (block.source ?? block.id) === original.id)
    const candidate = normalized[moved]
    if (!candidate || candidate.id !== original.id || candidate.markdown !== undefined || candidate.scene !== undefined ||
      normalized.filter(block => (block.source ?? block.id) === original.id).length !== 1 ||
      JSON.stringify(originals.slice(0, index).map(block => block.id)) !== JSON.stringify(collapsedSources(normalized.slice(0, moved))) ||
      normalized.slice(0, moved).some(block => {
        const previous = known.get(block.source ?? block.id)
        return block.scene !== undefined && previous?.node.type === 'component' && JSON.stringify(block.durations ?? [1000]) !== JSON.stringify(previous.node.durations ?? [1000])
      })) throw new Error('block-step-order')
  }
  for (let index = 0; index < originals.length; index++) {
    const original = originals[index]!
    const revealing = wrappers.some(
      (wrapper) =>
        wrapper.reveal &&
        wrapper.start < original.source.line - 1 &&
        wrapper.end >= (original.source.endLine ?? original.source.line) - 1,
    )
    if (
      !(original.node.type === 'markdown' && original.node.reveal) &&
      !revealing
    )
      continue
    const moved = normalized.findIndex(
      (block) => (block.source ?? block.id) === original.id,
    )
    if (moved < 0) continue
    const before = originals.slice(0, index).map((block) => block.id)
    const after = collapsedSources(normalized.slice(0, moved))
    const resized = normalized.slice(0, moved).some((block) => {
      if (block.scene === undefined) return false
      const previous = known.get(block.source ?? block.id)
      const span =
        previous?.node.type === 'component'
          ? Math.max(0, (previous.node.durations?.length ?? 1) - 1)
          : (previous?.span ?? 0)
      return Math.max(0, (block.durations?.length ?? 1) - 1) !== span
    })
    if (JSON.stringify(before) !== JSON.stringify(after) || resized)
      throw new Error('block-step-order')
  }
  const groups = new Map<string, typeof entries>()
  for (const entry of entries) {
    const key = `${entry.range.start}:${entry.range.end}`
    const group = groups.get(key) ?? []
    group.push(entry)
    groups.set(key, group)
  }
  const output: string[] = []
  for (let i = 0; i < normalized.length; i++) {
    const block = normalized[i]!
    const original = known.get(block.source ?? block.id)
    const unchanged = (
      candidate: PreviewEditedBlock | undefined,
      expected: IRBlock,
    ) =>
      candidate?.id === expected.id &&
      (candidate.source ?? candidate.id) === expected.id &&
      candidate.markdown === undefined &&
      (candidate.scene === undefined ||
        (expected.node.type === 'component' &&
          expected.node.name === 'PmScene' &&
          candidate.scene === expected.node.props.scene &&
          JSON.stringify(candidate.durations ?? [1000]) ===
            JSON.stringify(expected.node.durations ?? [1000])))
    const entry = original && entries.find((e) => e.block.id === original.id)
    const group =
      entry && groups.get(`${entry.range.start}:${entry.range.end}`)!
    // Several IR blocks can share one source container. Retain that container once,
    // only when every member is unchanged and their order is still contiguous.
    if (
      entry &&
      group?.every((member, offset) =>
        unchanged(normalized[i + offset], member.block) && (member.block.role !== 'narration' || opaqueNarration(member.block) || member.block.node.type === 'markdown' && Boolean(member.block.node.narration)),
      )
    ) {
      const retained = lines.slice(entry.range.start, entry.range.end + 1)
      // Generated IR ids become explicit labels before moving their source.
      // Keep every member stable, including several paragraphs in one container.
      for (const member of [...group].sort(
        (a, b) => b.block.source.line - a.block.source.line,
      )) {
        const start = member.block.source.line - 1
        const before = labelStart(lines, start)
        const header = lines.slice(member.range.start, start).join('\n')
        const escaped = member.block.id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
        const option = new RegExp(`^[ \t]*:label:[ \t]*${escaped}[ \t]*$`, 'm')
        if (before === start && !option.test(header))
          retained.splice(start - entry.range.start, 0, `(${member.block.id})=`)
      }
      output.push(retained.join('\n'))
      i += group.length - 1
    } else {
      if (group?.some(member => opaqueNarration(member.block))) throw new Error('block-mixed-container')
      output.push(bodySource(block, original, lines))
    }
  }

  const patches: { start: number; end: number; text: string }[] = []
  // Freeze implicit legacy speech before moving body blocks changes what precedes it.
  for (const block of speech) {
    if (
      block.source.file !== file ||
      block.node.type !== 'markdown' ||
      block.node.narration
    )
      continue
    if (
      wrappers.some(
        (r) =>
          r.start < block.source.line - 1 &&
          r.end >= (block.source.endLine ?? block.source.line) - 1,
      )
    )
      throw new Error('block-mixed-container')
    const raw = lines
      .slice(block.source.line - 1, block.source.endLine ?? block.source.line)
      .join('\n')
    patches.push({
      start: block.source.line - 1,
      end: (block.source.endLine ?? block.source.line) - 1,
      text: fenced(
        'narration',
        [
          `:label: ${block.id}`,
          `:at: ${block.at}`,
          ':mode: during',
          ...(block.audience
            ? [`:audience: ${block.audience.join(', ')}`]
            : []),
        ],
        raw,
      ),
    })
  }
  ranges.forEach((range, index) =>
    patches.push({
      ...range,
      text:
        index === ranges.length - 1
          ? output.slice(index).join('\n\n')
          : (output[index] ?? ''),
    }),
  )
  if (!ranges.length && output.length)
    patches.push({
      start: section.source.endLine ?? section.source.line,
      end: (section.source.endLine ?? section.source.line) - 1,
      text: `\n${output.join('\n\n')}\n`,
    })
  for (const patch of patches.sort((a, b) => b.start - a.start))
    lines.splice(patch.start, patch.end - patch.start + 1, patch.text)
  return lines.join('\n')
}
