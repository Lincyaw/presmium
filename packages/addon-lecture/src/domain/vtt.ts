import { chapters, timedEvents } from './timing.ts'
import type { LectureTrack, Utterance } from './track.ts'
import { trackDuration } from './track.ts'

export function vttTime(ms: number): string {
  const total = Math.max(0, Math.round(ms))
  const pad = (n: number, width = 2) => String(n).padStart(width, '0')
  return `${pad(Math.floor(total / 3_600_000))}:${pad(Math.floor(total / 60_000) % 60)}:${pad(Math.floor(total / 1000) % 60)}.${pad(total % 1000, 3)}`
}

function cueText(text: string): string {
  return text.replace(/\r?\n\s*\n/g, '\n').replace(/-->/g, '->').trim()
}

export type Digest = (text: string) => string

export function isStale(utterance: Utterance, lang: string, digest: Digest): boolean {
  const translation = utterance.translations?.[lang]
  return Boolean(translation && translation.source !== digest(utterance.text))
}

export function captionLanguages(track: LectureTrack): string[] {
  return [...new Set([track.lang, ...track.utterances.flatMap(u => Object.keys(u.translations ?? {}))])]
}

export interface Captions {
  lang: string
  vtt: string
  missing: string[]
  stale: string[]
}

export function captionsVtt(track: LectureTrack, lang: string, digest: Digest): Captions {
  const cues: string[] = []
  const missing: string[] = []
  const stale: string[] = []
  for (const u of track.utterances) {
    const original = lang === track.lang
    const text = original ? u.text : u.translations?.[lang]?.text
    if (text === undefined) {
      missing.push(u.id)
      continue
    }
    if (!original && isStale(u, lang, digest)) {
      stale.push(u.id)
      cues.push(`NOTE stale: the original of ${u.id} changed after it was translated`)
    }
    cues.push(`${u.id}\n${vttTime(u.t)} --> ${vttTime(u.t + Math.max(u.d, 1))}\n${cueText(text)}`)
  }
  return { lang, vtt: `WEBVTT\n\n${cues.join('\n\n')}\n`, missing, stale }
}

export function chaptersVtt(track: LectureTrack, titles: (section: string) => string | undefined = () => undefined): string {
  const list = chapters(timedEvents(track), titles)
  const end = trackDuration(track)
  const cues = list.map((chapter, i) => {
    const until = Math.max(list[i + 1]?.t ?? end, chapter.t + 1)
    return `${vttTime(chapter.t)} --> ${vttTime(until)}\n${cueText(chapter.title)}`
  })
  return `WEBVTT\n\n${cues.join('\n\n')}\n`
}

export function eventsVtt(track: LectureTrack): string {
  const json = (value: unknown) => JSON.stringify(value).replace(/-->/g, '--\\u003e')
  const cues = timedEvents(track).map(event => `${vttTime(event.t)} --> ${vttTime(event.t + 1)}\n${json({ type: event.type, data: event.data })}`)
  return `WEBVTT\n\n${cues.join('\n\n')}\n`
}
