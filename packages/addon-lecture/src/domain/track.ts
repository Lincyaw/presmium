/**
 * The lecture track (P-130, docs/ir.md section 9): what was said (utterances,
 * with optional audio) and what was done (events), by time, anchored to
 * sections, blocks and anchors. Stored as `lectures/<id>/track.json` in the
 * deck directory: plain text that diffs line by line (`formatTrack`).
 */
import { isRecord } from '@presmium/kernel'
import type { TrackEvent } from '@presmium/kernel'

export const LECTURE_ID = 'presmium.lecture'

/** Version of the track format. */
export const TRACK_VERSION = 1

/** Where recorded lectures live, relative to the deck directory. */
export const LECTURES_DIR = 'lectures'

/** `[start ms, duration ms, character or word]`; one character per entry in Chinese. */
export type Word = [t: number, d: number, text: string]

export interface Translation {
  text: string
  /** `sha256:<hex>` of the original text it translates; another digest means it is stale (P-137). */
  source: string
}

export interface Utterance {
  id: string
  /** Start, ms since the lecture started. */
  t: number
  /** Duration, ms. */
  d: number
  text: string
  words?: Word[]
  section?: string
  step?: number
  /** Language tag to translation. */
  translations?: Record<string, Translation>
  /**
   * Its synthesized audio (WP-83): a file of the deck's synthesis cache,
   * `<key>.wav` or `<key>.ogg` (`CLIP_FILE`), published beside the track
   * under `clips/`. A synthesized lecture plays these clips at the
   * utterances' times (`ClipClock`).
   */
  clip?: string
}

/** The name of a clip: a file of the synthesis cache (docs/ir.md 9.1). */
export const CLIP_FILE = /^[0-9a-f]{32}\.(wav|ogg)$/

/** Where a track's clips are published, relative to its directory. */
export const CLIPS_DIR = 'clips'

/** The id of the lecture synthesized from the deck's narration or script (P-134). */
export const SCRIPT_TRACK = 'script'

/** Recorded media of one section: `start` and `duration` in seconds; `src` relative to the track's directory, or a URL. */
export interface MediaSegment {
  section: string
  start: number
  src: string
  duration: number
  sha256?: string
}

export interface VideoSegment extends MediaSegment {
  kind: 'camera' | 'screen'
}

export type Voice =
  | { kind: 'recorded', speaker?: string }
  /** `provider`: the engine's provider (N-08), which the player names with the AI-generated label. */
  | { kind: 'synthetic', engine: string, model?: string, voice: string, provider?: string }

/** Content fingerprint and line count of a block an event refers to. */
export interface TrackBlock {
  fp: string
  lines?: number
}

export interface LectureTrack {
  track: typeof TRACK_VERSION
  id: string
  /** The deck's entry file, relative to the deck directory. */
  doc: string
  /** Language of the utterances (BCP 47). */
  lang: string
  /**
   * Hash of the IR the lecture was recorded on (`irHash`), and of each of its
   * sections (`sectionHashes`); a section recorded again has the hash of its
   * new recording, the others keep theirs (`presmium check` compares them).
   */
  ir: { hash: string, sections?: Record<string, string> }
  voice: Voice
  /** Recorded lectures: one audio segment per section. */
  audio?: MediaSegment[]
  /** Optional camera and screen recordings (P-90). */
  video?: VideoSegment[]
  /** Keyed `<section id>/<block id>`. */
  blocks: Record<string, TrackBlock>
  utterances: Utterance[]
  events: TrackEvent[]
}

/** A track id: what a directory name and a URL path segment can hold. */
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
    ...typeof value.section === 'string' ? { section: value.section } : {},
    ...isNumber(value.step) ? { step: value.step } : {},
    ...translations ? { translations } : {},
    ...typeof value.clip === 'string' && CLIP_FILE.test(value.clip) ? { clip: value.clip } : {},
  }
}

function segment(value: unknown): MediaSegment | undefined {
  if (!isRecord(value) || typeof value.section !== 'string' || !isNumber(value.start) || typeof value.src !== 'string' || !isNumber(value.duration)) return undefined
  return { section: value.section, start: value.start, src: value.src, duration: value.duration, ...typeof value.sha256 === 'string' ? { sha256: value.sha256 } : {} }
}

function irOf(value: unknown): LectureTrack['ir'] {
  const hash = isRecord(value) && typeof value.hash === 'string' ? value.hash : ''
  const sections = isRecord(value) && isRecord(value.sections)
    ? Object.fromEntries(Object.entries(value.sections).filter((entry): entry is [string, string] => typeof entry[1] === 'string'))
    : undefined
  return sections ? { hash, sections } : { hash }
}

function voice(value: unknown): Voice {
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

/**
 * Reads a track from its JSON. Unknown fields and events of unknown types
 * are kept (players ignore them); malformed entries are left out and named
 * in `problems`. Undefined when it is no track at all.
 */
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
      doc: typeof value.doc === 'string' ? value.doc : 'lecture.md',
      lang: typeof value.lang === 'string' ? value.lang : 'zh-CN',
      ir: irOf(value.ir),
      voice: voice(value.voice),
      ...audio?.length ? { audio } : {},
      ...video?.length ? { video } : {},
      blocks,
      utterances: utterances.sort((a, b) => a.t - b.t),
      events: sortEvents(events),
    },
    problems,
  }
}

/** Events in time order; events at the same time keep their order. */
export function sortEvents(events: TrackEvent[]): TrackEvent[] {
  return events.map((event, i) => [event, i] as const).sort(([a, i], [b, j]) => a[0] - b[0] || i - j).map(([event]) => event)
}

/**
 * The track as `track.json` writes it: one line per field, and one per
 * entry of the lists (events, utterances, segments, blocks), so a change to
 * one event is a change to one line.
 */
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

/** The line of `track.json` (1-based) that holds event `index`, as `formatTrack` writes it. */
export function eventLine(text: string, index: number): number | undefined {
  const lines = text.split('\n')
  const start = lines.findIndex(line => line.startsWith('  "events": ['))
  return start === -1 || start + 1 + index >= lines.length ? undefined : start + 2 + index
}

/** Length of the lecture, ms: the end of its last audio segment, utterance or event. */
export function trackDuration(track: LectureTrack): number {
  return Math.max(
    0,
    ...(track.audio ?? []).map(a => (a.start + a.duration) * 1000),
    ...track.utterances.map(u => u.t + u.d),
    ...track.events.map(([t]) => t),
  )
}

/** `m:ss` of a time in ms, or `h:mm:ss` from an hour on. */
export function clockText(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000))
  const s = String(total % 60).padStart(2, '0')
  const m = Math.floor(total / 60) % 60
  const h = Math.floor(total / 3600)
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`
}

/** A section id as a file name: characters a path or a URL would misread replaced by `_`. */
export function fileStem(section: string): string {
  // eslint-disable-next-line no-control-regex
  const stem = section.replace(/[/\\?%*:|"<>#\u0000-\u001F\s]/g, '_').replace(/^\.+/, '_')
  return stem.slice(0, 80) || 'section'
}
