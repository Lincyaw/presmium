/**
 * Writing a recorded lecture back into the deck (P-136, P-137; docs/ir.md
 * 9.5): what the lecture side gives the agent of the assistant's change
 * tasks. The transcript as narration: per section and step, the sentences
 * said there, with a `{cue}` before the word each action of the lecture was
 * bound to (`at`), so the agent tidies the words and leaves the cues where
 * they are; and where each step's narration is in the source. And the
 * sentences to translate, each with the digest its translation records.
 */
import { irBlocks } from '@presmium/kernel'
import type { IRDocument, SourceRange } from '@presmium/kernel'
import type { LecturePlan } from './plan.ts'
import { anchorOf } from './timing.ts'
import type { LectureTrack, Utterance } from './track.ts'
import type { Digest } from './vtt.ts'
import { isStale } from './vtt.ts'
import { isCjk, locate } from './words.ts'

/** An option value as a role writes it: quoted when it has spaces, quotes or braces. */
function optionValue(value: string): string {
  return /^[^\s"'{}=]+$/.test(value) ? value : `"${value.replace(/"/g, '\'')}"`
}

/** A `{cue}` role (docs/ir.md 2.9), e.g. ``{cue to=code-1 lines=2-3}`spot` ``. */
function cueRole(command: string, options: Record<string, string | number | undefined> = {}): string {
  const written = Object.entries(options).filter(([, v]) => v !== undefined && v !== '').map(([key, v]) => ` ${key}=${optionValue(String(v))}`).join('')
  return `{cue${written}}\`${command}\``
}

const text = (value: unknown) => (typeof value === 'string' && value ? value : undefined)

/** The block id of an event's `<section>/<block>` key. */
function blockOf(key: unknown): string | undefined {
  const value = text(key)
  return value?.includes('/') ? value.slice(value.indexOf('/') + 1) : undefined
}

/** A selector the player builds for a cue's `sel`: the block, and the selector inside it. */
const SELECTOR = /^\[data-section="[^"]*"\] \.pm-block\[data-block="([^"]+)"\]\s*(.*)$/

/**
 * The `{cue}` that makes an event again when the narration is said (docs/ir.md
 * 2.9, 9.2), at a place said in step `step` of section `section`; undefined for
 * an event no cue makes (a move to another section, a cleared spotlight).
 */
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

/** Where anchor `offset` of an utterance is in its text (UTF-16): before that word, or that character without words. */
function placeOf(u: Utterance, offset: number): number {
  const words = u.words ?? []
  if (words.length === 0) return [...u.text].slice(0, Math.max(0, offset)).join('').length
  if (offset >= words.length) return u.text.length
  const place = locate(words.map(w => w[2]), u.text)[Math.max(0, offset)]
  return place?.start ?? Math.round(u.text.length * offset / words.length)
}

/** CJK text and its punctuation join without a space. */
function wide(char: string | undefined): boolean {
  return Boolean(char && (isCjk(char) || /[　-〿＀-￯]/u.test(char)))
}

function joined(parts: string[]): string {
  return parts.reduce((all, part) => (!all ? part : wide(all.at(-1)) || wide(part[0]) ? all + part : `${all} ${part}`), '')
}

export interface DraftStep {
  /** The step, as the web form numbers them (as the track does). */
  step: number
  /** The sentences said at the step, joined, with the cues in them. */
  draft: string
  utterances: string[]
}

export interface DraftSection {
  section: string
  steps: DraftStep[]
}

export interface NarrationDraft {
  sections: DraftSection[]
  /** Actions bound to words that no cue makes again (types without a cue). */
  skipped: number
}

/**
 * The transcript of a track as narration, by section (in the order said) and
 * step: each sentence with a `{cue}` before the word each event bound to it
 * happened at (`at`), in the events' order; `section` keeps one section.
 */
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

/** Where a step's narration is in the source: its paragraphs, or the on-screen block a step without one follows. */
export interface NarrationPlace {
  narration: SourceRange[]
  after?: SourceRange & { block: string }
}

/**
 * Where the narration of a step of a section is (`doc`: the view the plan was
 * made from; `step` as the web form numbers them): the paragraphs the lecture
 * says there (of the deck, or of the separate script), else the last on-screen
 * block shown at that step. `file` as the IR gives it.
 */
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
  /** The original text. */
  text: string
  /** The digest a translation of this text records (`Translation.source`). */
  source: string
  /** The translation into the language asked, and whether its original changed since. */
  translation?: string
  stale?: boolean
}

/** The sentences of a track to translate into `lang`, each with the digest its translation records. */
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
