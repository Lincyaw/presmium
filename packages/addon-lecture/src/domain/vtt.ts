/**
 * WebVTT exports of a lecture track (docs/ir.md 9.3), an exchange format
 * only: `captions.<lang>.vtt` for the utterances and each translation (a
 * translation whose original changed since is stale, P-137),
 * `chapters.vtt` from the moves to other sections and the `mark`s, and
 * `events.vtt`, a metadata track with each event as JSON.
 */
import { chapters, timedEvents } from './timing.ts'
import type { LectureTrack, Utterance } from './track.ts'
import { trackDuration } from './track.ts'

/** `hh:mm:ss.mmm`. */
export function vttTime(ms: number): string {
  const total = Math.max(0, Math.round(ms))
  const pad = (n: number, width = 2) => String(n).padStart(width, '0')
  return `${pad(Math.floor(total / 3_600_000))}:${pad(Math.floor(total / 60_000) % 60)}:${pad(Math.floor(total / 1000) % 60)}.${pad(total % 1000, 3)}`
}

/** Cue text: no blank line (it would end the cue) and no `-->`. */
function cueText(text: string): string {
  return text.replace(/\r?\n\s*\n/g, '\n').replace(/-->/g, '->').trim()
}

/** The digest a translation records of its original: `sha256:<hex>` of the utterance text. */
export type Digest = (text: string) => string

/** Whether the translation into `lang` of an utterance was made from another text than the one it has now. */
export function isStale(utterance: Utterance, lang: string, digest: Digest): boolean {
  const translation = utterance.translations?.[lang]
  return Boolean(translation && translation.source !== digest(utterance.text))
}

/** The languages of the captions: the track's, then each language some utterance has a translation into. */
export function captionLanguages(track: LectureTrack): string[] {
  return [...new Set([track.lang, ...track.utterances.flatMap(u => Object.keys(u.translations ?? {}))])]
}

export interface Captions {
  lang: string
  vtt: string
  /** Utterances without a translation into `lang` (left out). */
  missing: string[]
  /** Utterances whose translation into `lang` is stale (exported with a note). */
  stale: string[]
}

/** The captions in the track's language or a translation's. */
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

/** The chapters as cues, each until the next one (the last until the end of the lecture). */
export function chaptersVtt(track: LectureTrack, titles: (section: string) => string | undefined = () => undefined): string {
  const list = chapters(timedEvents(track), titles)
  const end = trackDuration(track)
  const cues = list.map((chapter, i) => {
    const until = Math.max(list[i + 1]?.t ?? end, chapter.t + 1)
    return `${vttTime(chapter.t)} --> ${vttTime(until)}\n${cueText(chapter.title)}`
  })
  return `WEBVTT\n\n${cues.join('\n\n')}\n`
}

/** A metadata track: each event at its time, as JSON `{ type, data }`. */
export function eventsVtt(track: LectureTrack): string {
  // `-->` would end the cue timings; escaped, the JSON reads the same.
  const json = (value: unknown) => JSON.stringify(value).replace(/-->/g, '--\\u003e')
  const cues = timedEvents(track).map(event => `${vttTime(event.t)} --> ${vttTime(event.t + 1)}\n${json({ type: event.type, data: event.data })}`)
  return `WEBVTT\n\n${cues.join('\n\n')}\n`
}
