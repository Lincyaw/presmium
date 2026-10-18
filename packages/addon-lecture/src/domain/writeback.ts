import { irBlocks } from '@presmium/kernel'
import type { IRDocument, SourceRange } from '@presmium/kernel'
import type { LecturePlan } from './plan.ts'
import { anchorOf } from './timing.ts'
import type { LectureTrack, Utterance } from './track.ts'
import type { Digest } from './vtt.ts'
import { isStale } from './vtt.ts'
import { isCjk, locate } from './words.ts'

function optionValue(value: string): string {
  return /^[^\s"'{}=]+$/.test(value) ? value : `"${value.replace(/"/g, '\'')}"`
}

function cueRole(command: string, options: Record<string, string | number | undefined> = {}): string {
  const written = Object.entries(options).filter(([, v]) => v !== undefined && v !== '').map(([key, v]) => ` ${key}=${optionValue(String(v))}`).join('')
  return `{cue${written}}\`${command}\``
}

const text = (value: unknown) => (typeof value === 'string' && value ? value : undefined)

function blockOf(key: unknown): string | undefined {
  const value = text(key)
  return value?.includes('/') ? value.slice(value.indexOf('/') + 1) : undefined
}

const SELECTOR = /^\[data-section="[^"]*"\] \.pm-block\[data-block="([^"]+)"\]\s*(.*)$/

export function cueFor(type: string, data: Record<string, unknown>, at: { section?: string, step: number }): string | undefined {
  const block = blockOf(data.block)
  switch (type) {
    case 'go':
      return data.section === at.section && typeof data.step === 'number' && data.step > at.step ? cueRole('next') : undefined
    case 'spot':
    case 'hint': {
      const selected = SELECTOR.exec(text(data.selector) ?? '')
      if (selected) return cueRole(type, { to: selected[1], sel: selected[2] })
      return block ? cueRole(type, { to: block, lines: text(data.lines) }) : undefined
    }
    case 'point':
      return block ? cueRole('point', { to: block, lines: typeof data.line === 'number' ? data.line : undefined }) : undefined
    case 'ink':
      return block && !data.clear ? cueRole('ink', { to: block, lines: text(data.lines) }) : undefined
    case 'run':
      return text(data.block) ? cueRole('run', { to: text(data.block) }) : undefined
    case 'click':
      return block && text(data.action) ? cueRole(`click ${text(data.action)}`, { to: block }) : undefined
    case 'mark':
      return text(data.label) ? cueRole(`mark ${text(data.label)}`) : undefined
    case 'pause':
      return typeof data.ms === 'number' && data.ms > 0 ? cueRole(`pause ${Math.round(data.ms)}ms`) : undefined
    default:
      return undefined
  }
}

function placeOf(u: Utterance, offset: number): number {
  const words = u.words ?? []
  if (words.length === 0) return [...u.text].slice(0, Math.max(0, offset)).join('').length
  if (offset >= words.length) return u.text.length
  const place = locate(words.map(w => w[2]), u.text)[Math.max(0, offset)]
  return place?.start ?? Math.round(u.text.length * offset / words.length)
}

function wide(char: string | undefined): boolean {
  return Boolean(char && (isCjk(char) || /[　-〿＀-￯]/u.test(char)))
}

function joined(parts: string[]): string {
  return parts.reduce((all, part) => (!all ? part : wide(all.at(-1)) || wide(part[0]) ? all + part : `${all} ${part}`), '')
}

export interface DraftStep {
  step: number
  draft: string
  utterances: string[]
}

export interface DraftSection {
  section: string
  steps: DraftStep[]
}

export interface NarrationDraft {
  sections: DraftSection[]
  skipped: number
}

export function narrationDraft(track: LectureTrack, section?: string): NarrationDraft {
  const utterances = new Map(track.utterances.map(u => [u.id, u]))
  const cues = new Map<string, { place: number, role: string, index: number }[]>()
  let skipped = 0
  track.events.forEach(([, type, data], index) => {
    const at = anchorOf(data)
    const u = at && utterances.get(at[0])
    if (!u) return
    const role = cueFor(type, data, { section: u.section, step: u.step ?? 0 })
    if (!role) {
      if (type !== 'go') skipped++
      return
    }
    cues.set(u.id, [...cues.get(u.id) ?? [], { place: placeOf(u, at![1]), role, index }])
  })
  const said = (u: Utterance) => (cues.get(u.id) ?? [])
    .sort((a, b) => b.place - a.place || b.index - a.index)
    .reduce((written, cue) => written.slice(0, cue.place) + cue.role + written.slice(cue.place), u.text)
  const sections: DraftSection[] = []
  for (const u of [...track.utterances].sort((a, b) => a.t - b.t)) {
    if (!u.section || (section && u.section !== section)) continue
    let entry = sections.find(s => s.section === u.section)
    if (!entry) sections.push(entry = { section: u.section, steps: [] })
    const step = u.step ?? 0
    let at = entry.steps.find(s => s.step === step)
    if (!at) entry.steps.push(at = { step, draft: '', utterances: [] })
    at.utterances.push(u.id)
    at.draft = joined([at.draft, said(u)])
  }
  for (const entry of sections) entry.steps.sort((a, b) => a.step - b.step)
  return { sections, skipped }
}

export interface NarrationPlace {
  narration: SourceRange[]
  after?: SourceRange & { block: string }
}

export function narrationPlace(doc: IRDocument, plan: LecturePlan, section: string, step: number): NarrationPlace {
  const planned = plan.sections.find(s => s.id === section)
  const ir = doc.sections.find(s => s.id === section)
  if (!planned || !ir) return { narration: [] }
  const range = (source: { file: string, line: number, endLine?: number }): SourceRange => ({ file: source.file, startLine: source.line, endLine: source.endLine ?? source.line })
  const narration = planned.paragraphs.filter(p => p.source && planned.webStep(p.step) === step).map(p => range(p.source!))
  if (narration.length > 0) return { narration }
  const block = [...irBlocks(ir.blocks)].filter(b => b.role === 'visual' && planned.webStep(b.at) <= step).at(-1)
  return { narration, ...block ? { after: { block: block.id, ...range(block.source) } } : {} }
}

export interface TranslationItem {
  id: string
  section?: string
  text: string
  source: string
  translation?: string
  stale?: boolean
}

export function translationItems(track: LectureTrack, lang: string, digest: Digest): TranslationItem[] {
  return track.utterances.map((u) => {
    const done = u.translations?.[lang]
    return {
      id: u.id,
      ...u.section ? { section: u.section } : {},
      text: u.text,
      source: digest(u.text),
      ...done ? { translation: done.text, stale: isStale(u, lang, digest) } : {},
    }
  })
}
