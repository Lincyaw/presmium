import { irBlocks, isRecord } from '@lincyaw/kernel'
import type { CodeNode, IRBlock, IRDocument, IRSection, MdastNode, RecordedRun, SourcePos, WordSpan } from '@lincyaw/kernel'
import { blockKey } from './drift.ts'
import type { CueCommand, CueMark, SpokenText } from './narration.ts'
import { duration, readCue, spokenText, TARGETED } from './narration.ts'

const LECTURE = 'lecture'
const PLAYER = 'web'

export interface PlannedCue {
  name: CueCommand
  offset: number
  data: Record<string, unknown>
}

export interface PlannedPiece {
  id?: string
  text: string
  spoken: string
  spans: WordSpan[]
  cues: PlannedCue[]
  pause?: number
}

export interface PlannedParagraph {
  step: number
  pieces: PlannedPiece[]
  source?: SourcePos
}

export interface PlannedSection {
  id: string
  title: string
  steps: number
  from: 'narration' | 'script'
  paragraphs: PlannedParagraph[]
  webStep(step: number): number
}

export interface PlanProblem {
  message: string
  source?: SourcePos
  compiled?: boolean
}

export interface LecturePlan {
  sections: PlannedSection[]
  problems: PlanProblem[]
}

export type ScriptSections = Map<string, { paragraphs: MdastNode[], source?: SourcePos }[]>

function said(block: IRBlock): boolean {
  return !block.only || block.only.includes(LECTURE)
}

function shown(block: IRBlock): boolean {
  return !block.only || block.only.includes(PLAYER)
}

function codeLines(block: IRBlock): number | undefined {
  return block.node.type === 'code' ? block.node.value.replace(/\n$/, '').split('\n').length : undefined
}

function lastLine(lines: string): number | undefined {
  const numbers = lines.match(/\d+/g)?.map(Number) ?? []
  return numbers.length ? Math.max(...numbers) : undefined
}

function named(doc: IRDocument, section: IRSection, to: string): { section: IRSection, block: IRBlock } | undefined {
  const find = (s: IRSection) => [...irBlocks(s.blocks)].find(b => b.id === to && b.role === 'visual')
  const own = find(section)
  if (own) return { section, block: own }
  for (const other of doc.sections) {
    const block = find(other)
    if (block) return { section: other, block }
  }
  return undefined
}

function webSteps(section: IRSection): (step: number) => number {
  const map = section.stepMap
  if (!map) return step => step
  return (step) => {
    const original = map.indexOf(step)
    return original === -1 ? step : original
  }
}

function cssString(value: string): string {
  return `"${value.replace(/["\\]/g, '\\$&').replace(/\n/g, '\\a ')}"`
}

function cueData(name: CueCommand, arg: string, mark: CueMark, section: IRSection, block: IRBlock): Record<string, unknown> {
  const key = blockKey(section.id, block.id)
  const lines = mark.lines ? { lines: mark.lines } : {}
  switch (name) {
    case 'spot':
    case 'hint':
      return mark.sel ? { selector: `[data-section=${cssString(section.id)}] .pm-block[data-block=${cssString(block.id)}] ${mark.sel}` } : { block: key, ...lines }
    case 'point': {
      const first = mark.lines ? Number(/\d+/.exec(mark.lines)?.[0]) : undefined
      return { block: key, path: [[0, 0.5, 0.5]], ...first ? { line: first } : {} }
    }
    case 'ink':
      return mark.lines ? { block: key, tool: 'marker', lines: mark.lines } : { block: key, tool: 'marker', range: [0, 0, 1, 1] }
    case 'click':
      return { block: key, action: arg }
    case 'run': {
      const recorded = (block.node as CodeNode).outputs?.[0] as RecordedRun | undefined
      return { section: section.id, block: block.id, result: recorded?.cacheKey ? `freeze:${recorded.cacheKey}` : 'live' }
    }
    default:
      return {}
  }
}

interface Reader {
  doc: IRDocument
  section: IRSection
  target?: IRBlock
  source?: SourcePos
  script?: boolean
  problems: PlanProblem[]
}

function planCues(spoken: SpokenText, at: Reader): PlannedCue[] {
  const cues: PlannedCue[] = []
  const problem = (message: string, compiled = false) => at.problems.push({ message: `section ${at.section.id}: ${message}`, source: at.source, ...compiled ? { compiled } : {} })
  for (const mark of spoken.cues) {
    const read = readCue(mark.command)
    if ('problem' in read) {
      problem(`{cue}\`${mark.command}\`: ${read.problem}`, !at.script)
      continue
    }
    const { name, arg } = read
    if (name === 'next') {
      cues.push({ name, offset: mark.offset, data: {} })
      continue
    }
    if (name === 'pause' || name === 'mark') {
      cues.push({ name, offset: mark.offset, data: name === 'pause' ? { ms: duration(arg)! } : { label: arg } })
      continue
    }
    const found = mark.to ? named(at.doc, at.section, mark.to) : at.target && { section: at.section, block: at.target }
    if (!found) {
      problem(mark.to ? `{cue to=${mark.to}}\`${mark.command}\`: the deck has no block ${mark.to}` : `{cue}\`${mark.command}\` has no block before it to act on; name one with to=<label>`)
      continue
    }
    if (!shown(found.block)) {
      problem(`{cue}\`${mark.command}\`: block ${found.block.id} is not shown in the web form, where the lecture plays`)
      continue
    }
    const lines = codeLines(found.block)
    const last = mark.lines ? lastLine(mark.lines) : undefined
    if (last !== undefined && lines !== undefined && last > lines) {
      problem(`{cue}\`${mark.command}\` names lines ${mark.lines} of ${found.block.id}, which has ${lines}`)
      continue
    }
    if (name === 'run' && found.block.node.type !== 'code') {
      problem(`{cue}\`run\` on ${found.block.id}, which is no code block`)
      continue
    }
    if (!TARGETED.has(name)) continue
    cues.push({ name, offset: mark.offset, data: cueData(name, arg, mark, found.section, found.block) })
  }
  return cues
}

function pieces(spoken: SpokenText, cues: PlannedCue[]): PlannedPiece[] {
  const list: PlannedPiece[] = []
  let from = 0
  let pending: PlannedCue[] = []
  const cut = (to: number, pause?: number) => {
    const text = spoken.text.slice(from, to)
    const lead = text.length - text.trimStart().length
    const start = from + lead
    const end = from + text.trimEnd().length
    const shift = (offset: number) => spoken.spans.filter(s => s.end <= offset).reduce((sum, s) => sum + (s.to - s.from) - (s.end - s.start), 0)
    const spans = spoken.spans.filter(s => s.start >= start && s.end <= end)
      .map(s => ({ from: s.from - (start + shift(start)), to: s.to - (start + shift(start)), start: s.start - start, end: s.end - start }))
    list.push({
      text: spoken.text.slice(start, end),
      spoken: spoken.spoken.slice(start + shift(start), end + shift(end)),
      spans,
      cues: pending.map(c => ({ ...c, offset: Math.max(0, Math.min(c.offset - start, end - start)) })),
      ...pause ? { pause } : {},
    })
    pending = []
    from = to
  }
  for (const cue of cues) {
    pending.push(cue)
    if (cue.name === 'pause') cut(cue.offset, cue.data.ms as number)
  }
  if (from < spoken.text.length || pending.length > 0 || list.length === 0) cut(spoken.text.length)
  return list.filter(piece => piece.text || piece.cues.length > 0 || piece.pause)
}

function narration(section: IRSection): { block: IRBlock, target?: IRBlock }[] {
  const list: { block: IRBlock, target?: IRBlock }[] = []
  const walk = (blocks: IRBlock[], target: IRBlock | undefined) => {
    for (const block of blocks) {
      if (block.role === 'visual') {
        if (shown(block)) target = block
        if (block.node.type === 'component' && block.node.children) walk(block.node.children, target)
      } else if (said(block)) {
        list.push({ block, target })
      }
    }
  }
  walk(section.blocks, undefined)
  return list
}

function linesOf(node: MdastNode, section: SourcePos | undefined): SourcePos | undefined {
  const position = node.position as { start?: { line?: unknown }, end?: { line?: unknown } } | undefined
  const line = position?.start?.line
  const end = position?.end?.line
  return section && typeof line === 'number' ? { file: section.file, line, ...typeof end === 'number' ? { endLine: end } : {} } : section
}

function stepTarget(section: IRSection, step: number): IRBlock | undefined {
  return section.blocks.filter(b => b.role === 'visual' && shown(b) && b.at <= step).at(-1)
}

export function lecturePlan(doc: IRDocument, script?: ScriptSections): LecturePlan {
  const problems: PlanProblem[] = []
  const sections: PlannedSection[] = doc.sections.map((section) => {
    const paragraphs: PlannedParagraph[] = []
    const fromScript = script?.get(section.id)
    if (fromScript) {
      fromScript.forEach(({ paragraphs: nodes, source: heading }) => nodes.forEach((node, k) => {
        const step = Math.min(k, section.steps)
        const spoken = spokenText(node)
        const source = linesOf(node, heading)
        const cues = planCues(spoken, { doc, section, target: stepTarget(section, step), source, script: true, problems })
        paragraphs.push({ step, pieces: pieces(spoken, cues), ...source ? { source } : {} })
      }))
    } else {
      for (const { block, target } of narration(section)) {
        if (block.node.type !== 'markdown') continue
        const spoken = spokenText(block.node.mdast)
        const cues = planCues(spoken, { doc, section, target, source: block.source, problems })
        paragraphs.push({ step: Math.min(block.at, section.steps), pieces: pieces(spoken, cues), source: block.source })
      }
    }
    paragraphs.sort((a, b) => a.step - b.step)
    return { id: section.id, title: section.title, steps: section.steps, from: fromScript ? 'script' : 'narration', paragraphs, webStep: webSteps(section) }
  })
  let n = 0
  for (const section of sections) {
    for (const paragraph of section.paragraphs) for (const piece of paragraph.pieces) if (piece.text) piece.id = `u${++n}`
  }
  return { sections, problems }
}

export function plannedUtterances(plan: LecturePlan): (PlannedPiece & { id: string, section: string, step: number, source?: SourcePos })[] {
  return plan.sections.flatMap(section => section.paragraphs.flatMap(paragraph => paragraph.pieces
    .filter((piece): piece is PlannedPiece & { id: string } => Boolean(piece.id))
    .map(piece => ({ ...piece, section: section.id, step: paragraph.step, ...paragraph.source ? { source: paragraph.source } : {} }))))
}

export interface LectureVoice {
  engine?: string
  voice: string
  rate?: number
  style?: string
}

export function lectureVoice(config: Record<string, unknown> | undefined): LectureVoice | undefined {
  const voice = isRecord(config?.voice) ? config.voice : undefined
  if (typeof voice?.voice !== 'string' || !voice.voice) return undefined
  return {
    voice: voice.voice,
    ...typeof voice.engine === 'string' && voice.engine ? { engine: voice.engine } : {},
    ...typeof voice.rate === 'number' ? { rate: voice.rate } : {},
    ...typeof voice.style === 'string' && voice.style ? { style: voice.style } : {},
  }
}

export function lectureGap(config: Record<string, unknown> | undefined): number {
  const gap = config?.gap
  if (typeof gap === 'number' && gap >= 0) return gap
  return (typeof gap === 'string' ? duration(gap) : undefined) ?? 500
}

export function lexiconOf(config: Record<string, unknown> | undefined): Record<string, string> | undefined {
  const lexicon = isRecord(config?.lexicon) ? config.lexicon : undefined
  if (!lexicon) return undefined
  const entries = Object.entries(lexicon).filter((entry): entry is [string, string] => typeof entry[1] === 'string')
  return entries.length ? Object.fromEntries(entries) : undefined
}
