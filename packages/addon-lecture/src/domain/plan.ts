import { irBlocks, parseDuration } from '@lincyaw/kernel'
import type { CodeNode, IRBlock, IRDocument, IRSection, RecordedRun, SourcePos, SpeechVoice, VoiceTarget, WordSpan } from '@lincyaw/kernel'
import { narrationVoice } from './config.ts'
import { blockKey, codeLineCount, lastNamedLine } from './drift.ts'
import type { CueCommand, CueMark, SpokenText } from './narration.ts'
import { parseCue, spokenText, TARGETED } from './narration.ts'
import { LECTURE_RENDERER, PLAYER_RENDERER } from './track.ts'

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
  narrationId?: string
  sourceKind?: 'none' | 'tts' | 'recording' | 'unset'
  step: number
  mode?: 'during' | 'after'
  pieces: PlannedPiece[]
  source?: SourcePos
  voice?: SpeechVoice
  voiceIssue?: string
  voiceTarget?: VoiceTarget
}

export interface PlannedSection {
  id: string
  title: string
  steps: number
  from: 'narration'
  paragraphs: PlannedParagraph[]
  holds: number[]
  trailingPauseMs?: number[]
  webStep(step: number): number
}

export interface PlanProblem {
  message: string
  source?: SourcePos
  reportedAtCompile?: boolean
}

export interface LecturePlan {
  sections: PlannedSection[]
  problems: PlanProblem[]
}

function isSaid(block: IRBlock): boolean {
  return !block.only || block.only.includes(LECTURE_RENDERER)
}

function isShown(block: IRBlock): boolean {
  return !block.only || block.only.includes(PLAYER_RENDERER)
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
  problems: PlanProblem[]
}

function planCues(spoken: SpokenText, at: Reader): PlannedCue[] {
  const cues: PlannedCue[] = []
  const problem = (message: string, reportedAtCompile = false) => at.problems.push({ message: `section ${at.section.id}: ${message}`, source: at.source, ...reportedAtCompile ? { reportedAtCompile } : {} })
  for (const mark of spoken.cues) {
    const parsed = parseCue(mark.command)
    if ('problem' in parsed) {
      problem(`{cue}\`${mark.command}\`: ${parsed.problem}`, true)
      continue
    }
    const { name, arg } = parsed
    if (name === 'next') {
      cues.push({ name, offset: mark.offset, data: {} })
      continue
    }
    if (name === 'pause' || name === 'mark') {
      cues.push({ name, offset: mark.offset, data: name === 'pause' ? { ms: parseDuration(arg)! } : { label: arg } })
      continue
    }
    const found = mark.to ? named(at.doc, at.section, mark.to) : at.target && { section: at.section, block: at.target }
    if (!found) {
      problem(mark.to ? `{cue to=${mark.to}}\`${mark.command}\`: the deck has no block ${mark.to}` : `{cue}\`${mark.command}\` has no block before it to act on; name one with to=<label>`)
      continue
    }
    if (!isShown(found.block)) {
      problem(`{cue}\`${mark.command}\`: block ${found.block.id} is not shown in the web form, where the lecture plays`)
      continue
    }
    const lines = codeLineCount(found.block)
    const last = mark.lines ? lastNamedLine(mark.lines) : undefined
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
        if (isShown(block)) target = block
        if (block.node.type === 'component' && block.node.children) walk(block.node.children, target)
      } else if (isSaid(block)) {
        list.push({ block, target })
      }
    }
  }
  walk(section.blocks, undefined)
  return list
}

export interface PlannedAnimation { blockId: string, step: number, durationMs?: number }

/** Changes that start an animation; static built-ins do not invent an animation duration. */
export function plannedAnimations(section: IRSection): PlannedAnimation[] {
  const animations: PlannedAnimation[] = []
  for (const block of irBlocks(section.blocks)) {
    if (block.node.type !== 'component' || !isShown(block) || !block.node.durations && !(block.node.plugin === 'presmium.motion' && block.node.name === 'PmScene')) continue
    const duration = (step: number, local: number) => {
      const ms = block.node.type === 'component' ? block.node.durations?.[local] : undefined
      animations.push({ blockId: block.id, step, ...typeof ms === 'number' && Number.isFinite(ms) && ms >= 0 ? { durationMs: ms } : {} })
    }
    if (block.stepStates) {
      for (const [step, state] of block.stepStates.entries()) {
        const previous = block.stepStates[step - 1]
        if (!state.visible || previous?.visible && previous.localStep === state.localStep && previous.state === state.state && JSON.stringify(previous.parameters) === JSON.stringify(state.parameters)) continue
        duration(step, state.localStep)
      }
    } else for (let local = 0; local <= (block.span ?? 0); local++) if (block.at + local <= section.steps) duration(block.at + local, local)
  }
  return animations
}

/** Effective minimum step holds: declared animations and authored Production stay durations. */
function stepHolds(section: IRSection, doc: IRDocument): number[] {
  const holds = Array.from({ length: section.steps + 1 }, () => 0)
  for (const animation of plannedAnimations(section)) holds[animation.step] = Math.max(holds[animation.step]!, animation.durationMs ?? 0)
  for (const [step, id] of (section.stepIds ?? []).entries()) {
    const production = { ...doc.production?.defaults, ...doc.production?.sectionOverrides?.[section.id], ...doc.production?.stepOverrides[id] }
    holds[step] = Math.max(holds[step] ?? 0, production.minimumHoldMs ?? 0)
  }
  return holds
}

export function lecturePlan(doc: IRDocument): LecturePlan {
  const problems: PlanProblem[] = []
  const sections: PlannedSection[] = doc.sections.map((section) => {
    const paragraphs: PlannedParagraph[] = []
    for (const { block, target } of narration(section)) {
      if (block.node.type !== 'markdown') continue
      const spoken = spokenText(block.node.mdast)
      const cues = planCues(spoken, { doc, section, target, source: block.source, problems })
      const voice = narrationVoice(doc, section, block.id, block.at)
      const stepId = section.stepIds?.[block.at]
      const source = (stepId ? doc.production?.stepOverrides[stepId]?.voiceSource : undefined) ?? doc.production?.sectionOverrides?.[section.id]?.voiceSource ?? doc.production?.defaults.voiceSource
      const pointer = block.source.pointer
      const narrationId = pointer?.startsWith('/narrations/') ? pointer.slice('/narrations/'.length).replaceAll('~1', '/').replaceAll('~0', '~') : undefined
      paragraphs.push({ ...narrationId ? { narrationId } : {}, sourceKind: source?.type ?? (voice.voice ? 'tts' : 'unset'), step: Math.min(block.at, section.steps), mode: block.node.narration?.mode, pieces: pieces(spoken, cues), source: block.source, voice: voice.voice, voiceIssue: voice.issue, voiceTarget: voice.target })
    }
    paragraphs.sort((a, b) => a.step - b.step)
    const settings = (section.stepIds ?? []).map(id => ({ ...doc.production?.defaults, ...doc.production?.sectionOverrides?.[section.id], ...doc.production?.stepOverrides[id] }))
    const trailingPauseMs = settings.some(value => value.trailingPauseMs !== undefined) ? settings.map(value => value.trailingPauseMs ?? 500) : undefined
    return { id: section.id, title: section.title, steps: section.steps, from: 'narration', paragraphs, holds: stepHolds(section, doc), ...trailingPauseMs ? { trailingPauseMs } : {}, webStep: webSteps(section) }
  })
  let n = 0
  for (const section of sections) {
    for (const paragraph of section.paragraphs) for (const piece of paragraph.pieces) if (piece.text) piece.id = `u${++n}`
  }
  return { sections, problems }
}

/** The most words of a section that transcription takes as hints (an engine's hotwords, or Whisper's prompt). */
const HINT_WORDS = 100

/**
 * The words a speaker is likely to say in a section, its title's and its narration's, as hints for the
 * transcription of a recording: they tell homophones apart (趟 and 烫, 数 and 树).
 */
export function sectionHints(section: PlannedSection, lang: string): string[] {
  const segmenter = new Intl.Segmenter(lang, { granularity: 'word' })
  const text = [section.title, ...section.paragraphs.flatMap(paragraph => paragraph.pieces.map(piece => piece.text))].join('\n')
  const words = [...segmenter.segment(text)].filter(part => part.isWordLike).map(part => part.segment)
  return [...new Set(words)].slice(0, HINT_WORDS)
}

export function plannedUtterances(plan: LecturePlan): (PlannedPiece & { id: string, section: string, step: number, source?: SourcePos, narrationId?: string, sourceKind?: PlannedParagraph['sourceKind'], voice?: SpeechVoice, voiceIssue?: string, voiceTarget?: VoiceTarget })[] {
  return plan.sections.flatMap(section => section.paragraphs.flatMap(paragraph => paragraph.pieces
    .filter((piece): piece is PlannedPiece & { id: string } => Boolean(piece.id))
    .map(piece => ({ ...piece, section: section.id, step: paragraph.step, narrationId: paragraph.narrationId, sourceKind: paragraph.sourceKind, voice: paragraph.voice, voiceIssue: paragraph.voiceIssue, voiceTarget: paragraph.voiceTarget, ...paragraph.source ? { source: paragraph.source } : {} }))))
}
