import { isRecord } from '@lincyaw/kernel'
import type { TrackEvent } from '@lincyaw/kernel'

export const LECTURE_ID = 'presmium.lecture'

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
  section?: string
  step?: number
  translations?: Record<string, Translation>
  clip?: string
}

export const CLIP_FILE = /^[0-9a-f]{32}\.(wav|ogg)$/

export const CLIPS_DIR = 'clips'

export const SCRIPT_TRACK = 'script'

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

export function trackDuration(track: LectureTrack): number {
  return Math.max(
    0,
    ...(track.audio ?? []).map(a => (a.start + a.duration) * 1000),
    ...track.utterances.map(u => u.t + u.d),
    ...track.events.map(([t]) => t),
  )
}

export function clockText(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000))
  const s = String(total % 60).padStart(2, '0')
  const m = Math.floor(total / 60) % 60
  const h = Math.floor(total / 3600)
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`
}

export function fileStem(section: string): string {
  // eslint-disable-next-line no-control-regex
  const stem = section.replace(/[/\\?%*:|"<>#\u0000-\u001F\s]/g, '_').replace(/^\.+/, '_')
  return stem.slice(0, 80) || 'section'
}
