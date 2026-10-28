import { DOCUMENT_ENTRY, isRecord } from '@lincyaw/kernel'
import type { ProductionBinding, TrackEvent } from '@lincyaw/kernel'

export const LECTURE_ID = 'presmium.lecture'

export const LECTURE_RENDERER = 'lecture'

export const PLAYER_RENDERER = 'web'

export const TRACK_VERSION = 1

export const LECTURES_DIR = 'lectures'

export type Word = [t: number, d: number, text: string]

export interface Translation {
  text: string
  source: string
}

export interface Utterance {
  id: string
  t: number
  d: number
  text: string
  words?: Word[]
  /** Genuine word boundaries are distinct from interpolated edits and unaligned text. */
  alignment?: 'words' | 'proportional' | 'none'
  section?: string
  step?: number
  translations?: Record<string, Translation>
  clip?: string
  clipId?: string
  narrationIds?: string[]
  /** Authored no-audio narration; its range comes from actual step boundaries, never reading-speed estimates. */
  recording?: true
  silent?: true
  /** Exact provider/voice metadata of this sentence, when a scripted track uses multiple voices. */
  voice?: Voice
  /**
   * Why the sentence has no audio: a synthesized lecture whose engine could not say it. It plays silent for the length it
   * would take to say (`spokenDuration`), its caption shown; only a lecture's preview has such sentences.
   */
  unsaid?: string
}

// The time a voice takes for a word, as the synthesized lectures of the example say theirs (about 0.34 s in Chinese).
const WORD_MS = 360
const MIN_SAID_MS = 500

/** About how long a voice takes to say `text`: by its words, as `Intl.Segmenter` finds them in the language. */
export function spokenDuration(text: string, lang: string): number {
  const words = [...new Intl.Segmenter(lang, { granularity: 'word' }).segment(text)].filter(segment => segment.isWordLike).length
  return Math.max(MIN_SAID_MS, words * WORD_MS)
}

export const CLIP_FILE = /^[0-9a-f]{32}\.(wav|ogg)$/

export const CLIPS_DIR = 'clips'

export const SCRIPT_TRACK = 'script'

/** The lecture a video is made of when none is named: the narrated script, else the only recorded one. */
export function defaultTrack(ids: readonly string[]): string | undefined {
  return ids.includes(SCRIPT_TRACK) ? SCRIPT_TRACK : ids.length === 1 ? ids[0] : undefined
}

export interface MediaSegment {
  role?: 'recording'
  stepId?: string
  narrationIds?: string[]
  section: string
  start: number
  src: string
  duration: number
  sha256?: string
  clipId?: string
  assetId?: string
  mediaClipId?: string
  sourceStartMs?: number
  volume?: number
  muted?: boolean
}

export interface VideoSegment extends MediaSegment {
  kind: 'camera' | 'screen'
}

export type Voice =
  | { kind: 'silent' }
  | { kind: 'recorded', speaker?: string }
  | { kind: 'synthetic', engine: string, model?: string, voice: string, provider?: string }

export interface TrackBlock {
  fp: string
  lines?: number
}

export interface LectureTrack {
  track: typeof TRACK_VERSION
  id: string
  doc: string
  lang: string
  ir: { hash: string, sections?: Record<string, string> }
  voice: Voice
  binding?: ProductionBinding
  durationMs?: number
  audio?: MediaSegment[]
  video?: VideoSegment[]
  blocks: Record<string, TrackBlock>
  utterances: Utterance[]
  events: TrackEvent[]
}

export const TRACK_ID = /^[\w][\w.-]{0,79}$/

function isNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function words(value: unknown): Word[] | undefined {
  if (!Array.isArray(value)) return undefined
  return value.filter((w): w is Word => Array.isArray(w) && isNumber(w[0]) && isNumber(w[1]) && typeof w[2] === 'string')
}

function utterance(value: unknown, problems: string[], i: number): Utterance | undefined {
  if (!isRecord(value) || typeof value.id !== 'string' || !isNumber(value.t) || !isNumber(value.d) || typeof value.text !== 'string') {
    problems.push(`utterance ${i} needs id, t, d and text`)
    return undefined
  }
  const translations = isRecord(value.translations)
    ? Object.fromEntries(Object.entries(value.translations).flatMap(([lang, tr]) => isRecord(tr) && typeof tr.text === 'string'
      ? [[lang, { text: tr.text, source: typeof tr.source === 'string' ? tr.source : '' }]]
      : []))
    : undefined
  return {
    id: value.id,
    t: value.t,
    d: value.d,
    text: value.text,
    ...words(value.words) ? { words: words(value.words) } : {},
    ...value.alignment === 'words' || value.alignment === 'proportional' || value.alignment === 'none' ? { alignment: value.alignment } : {},
    ...typeof value.section === 'string' ? { section: value.section } : {},
    ...isNumber(value.step) ? { step: value.step } : {},
    ...translations ? { translations } : {},
    ...typeof value.clipId === 'string' ? { clipId: value.clipId } : {},
    ...Array.isArray(value.narrationIds) && value.narrationIds.every(id => typeof id === 'string') ? { narrationIds: value.narrationIds as string[] } : {},
    ...value.recording === true ? { recording: true as const } : {},
    ...value.silent === true ? { silent: true as const } : {},
    ...typeof value.clip === 'string' && CLIP_FILE.test(value.clip) ? { clip: value.clip } : {},
    ...isRecord(value.voice) ? { voice: voice(value.voice) } : {},
    ...typeof value.unsaid === 'string' ? { unsaid: value.unsaid } : {},
  }
}

function segment(value: unknown): MediaSegment | undefined {
  if (!isRecord(value) || typeof value.section !== 'string' || !isNumber(value.start) || typeof value.src !== 'string' || !isNumber(value.duration)) return undefined
  return { ...value.role === 'recording' ? { role: 'recording' as const } : {}, ...typeof value.stepId === 'string' ? { stepId: value.stepId } : {}, ...Array.isArray(value.narrationIds) && value.narrationIds.every(id => typeof id === 'string') ? { narrationIds: value.narrationIds as string[] } : {}, section: value.section, start: value.start, src: value.src, duration: value.duration, ...typeof value.sha256 === 'string' ? { sha256: value.sha256 } : {}, ...typeof value.clipId === 'string' ? { clipId: value.clipId } : {}, ...typeof value.assetId === 'string' ? { assetId: value.assetId } : {}, ...typeof value.mediaClipId === 'string' ? { mediaClipId: value.mediaClipId } : {}, ...isNumber(value.sourceStartMs) && value.sourceStartMs >= 0 ? { sourceStartMs: value.sourceStartMs } : {}, ...isNumber(value.volume) && value.volume >= 0 && value.volume <= 1 ? { volume: value.volume } : {}, ...typeof value.muted === 'boolean' ? { muted: value.muted } : {} }
}

function irOf(value: unknown): LectureTrack['ir'] {
  const hash = isRecord(value) && typeof value.hash === 'string' ? value.hash : ''
  const sections = isRecord(value) && isRecord(value.sections)
    ? Object.fromEntries(Object.entries(value.sections).filter((entry): entry is [string, string] => typeof entry[1] === 'string'))
    : undefined
  return sections ? { hash, sections } : { hash }
}

function voice(value: unknown): Voice {
  if (isRecord(value) && value.kind === 'silent') return { kind: 'silent' }
  if (isRecord(value) && value.kind === 'synthetic' && typeof value.engine === 'string' && typeof value.voice === 'string') {
    return {
      kind: 'synthetic',
      engine: value.engine,
      voice: value.voice,
      ...typeof value.model === 'string' ? { model: value.model } : {},
      ...typeof value.provider === 'string' ? { provider: value.provider } : {},
    }
  }
  return { kind: 'recorded', ...isRecord(value) && typeof value.speaker === 'string' ? { speaker: value.speaker } : {} }
}

export function parseTrack(value: unknown): { track?: LectureTrack, problems: string[] } {
  const problems: string[] = []
  if (!isRecord(value) || value.track !== TRACK_VERSION || typeof value.id !== 'string') {
    return { problems: [`not a lecture track of version ${TRACK_VERSION} with an id`] }
  }
  const events: TrackEvent[] = []
  for (const [i, event] of (Array.isArray(value.events) ? value.events : []).entries()) {
    if (Array.isArray(event) && isNumber(event[0]) && typeof event[1] === 'string' && isRecord(event[2])) events.push([event[0], event[1], event[2]])
    else problems.push(`event ${i} is not [ms, type, data]`)
  }
  const utterances = (Array.isArray(value.utterances) ? value.utterances : []).flatMap((u, i) => utterance(u, problems, i) ?? [])
  const blocks = isRecord(value.blocks)
    ? Object.fromEntries(Object.entries(value.blocks).flatMap(([key, b]) => isRecord(b) && typeof b.fp === 'string' ? [[key, { fp: b.fp, ...isNumber(b.lines) ? { lines: b.lines } : {} }]] : []))
    : {}
  const audio = Array.isArray(value.audio) ? value.audio.flatMap(a => segment(a) ?? []) : undefined
  const video = Array.isArray(value.video)
    ? value.video.flatMap((v) => {
        const base = segment(v)
        return base && isRecord(v) && (v.kind === 'camera' || v.kind === 'screen') ? [{ ...base, kind: v.kind as VideoSegment['kind'] }] : []
      })
    : undefined
  return {
    track: {
      track: TRACK_VERSION,
      id: value.id,
      doc: typeof value.doc === 'string' ? value.doc : DOCUMENT_ENTRY,
      lang: typeof value.lang === 'string' ? value.lang : 'zh-CN',
      ir: irOf(value.ir),
      voice: voice(value.voice),
      ...isNumber(value.durationMs) && value.durationMs >= 0 ? { durationMs: value.durationMs } : {},
      ...isRecord(value.binding) && typeof value.binding.planId === 'string' && typeof value.binding.irRevision === 'string' && isRecord(value.binding.source) && typeof value.binding.source.documentId === 'string' && typeof value.binding.source.version === 'string' && typeof value.binding.source.fingerprint === 'string' ? { binding: value.binding as unknown as ProductionBinding } : {},
      ...audio?.length ? { audio } : {},
      ...video?.length ? { video } : {},
      blocks,
      utterances: utterances.sort((a, b) => a.t - b.t),
      events: sortEvents(events),
    },
    problems,
  }
}

export function sortEvents(events: TrackEvent[]): TrackEvent[] {
  return events.map((event, i) => [event, i] as const).sort(([a, i], [b, j]) => a[0] - b[0] || i - j).map(([event]) => event)
}

export function formatTrack(track: LectureTrack): string {
  const lines: string[] = []
  const entries = Object.entries(track).filter(([, value]) => value !== undefined)
  entries.forEach(([key, value], i) => {
    const comma = i < entries.length - 1 ? ',' : ''
    if (Array.isArray(value) && value.length > 0) {
      lines.push(`  ${JSON.stringify(key)}: [`)
      value.forEach((item, j) => lines.push(`    ${JSON.stringify(item)}${j < value.length - 1 ? ',' : ''}`))
      lines.push(`  ]${comma}`)
    } else if (key === 'blocks' && isRecord(value) && Object.keys(value).length > 0) {
      const blocks = Object.entries(value)
      lines.push(`  "blocks": {`)
      blocks.forEach(([block, data], j) => lines.push(`    ${JSON.stringify(block)}: ${JSON.stringify(data)}${j < blocks.length - 1 ? ',' : ''}`))
      lines.push(`  }${comma}`)
    } else {
      lines.push(`  ${JSON.stringify(key)}: ${JSON.stringify(value)}${comma}`)
    }
  })
  return `{\n${lines.join('\n')}\n}\n`
}

export function eventLine(text: string, index: number): number | undefined {
  const lines = text.split('\n')
  const start = lines.findIndex(line => line.startsWith('  "events": ['))
  return start === -1 || start + 1 + index >= lines.length ? undefined : start + 2 + index
}

export function utteranceLine(text: string, id: string): number | undefined {
  const lines = text.split('\n')
  const from = lines.findIndex(line => line.trimStart().startsWith('"utterances"'))
  const at = lines.findIndex((line, i) => i > from && line.includes(`"id":${JSON.stringify(id)}`))
  return from === -1 || at === -1 ? undefined : at + 1
}

export function trackDuration(track: LectureTrack): number {
  return Math.max(
    0, track.durationMs ?? 0,
    ...(track.audio ?? []).map(a => (a.start + a.duration) * 1000),
    ...track.utterances.map(u => u.t + u.d),
    ...track.events.map(([t, type, data]) => (type === 'pause' && typeof data.ms === 'number' ? t + data.ms : t)),
  )
}

export interface AudioSegment {
  clipId?: string
  src: string
  start: number
  duration: number
  sourceStartMs?: number
  volume?: number
  muted?: boolean
}

export function audioSegments(track: LectureTrack): AudioSegment[] {
  const said = track.utterances.filter(u => u.clip).map(u => ({ src: `${CLIPS_DIR}/${u.clip}`, start: u.t, duration: u.d, ...u.clipId ? { clipId: u.clipId } : {} }))
  return [...said, ...(track.audio ?? []).map(a => ({ src: a.src, start: a.start * 1000, duration: a.duration * 1000, ...a.clipId ? { clipId: a.clipId } : {}, ...a.sourceStartMs !== undefined ? { sourceStartMs: a.sourceStartMs } : {}, ...a.volume !== undefined ? { volume: a.volume } : {}, ...a.muted !== undefined ? { muted: a.muted } : {} }))]
}
