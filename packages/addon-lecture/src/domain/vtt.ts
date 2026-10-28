import { timedEvents, trackChapters } from './timing.ts'
import type { LectureTrack, Utterance } from './track.ts'
import { trackDuration } from './track.ts'
import { isStale } from './translation.ts'
import { captionGroups } from './captions.ts'

export function vttTime(ms: number): string {
  const total = Math.max(0, Math.round(ms))
  const pad = (n: number, width = 2) => String(n).padStart(width, '0')
  return `${pad(Math.floor(total / 3_600_000))}:${pad(Math.floor(total / 60_000) % 60)}:${pad(Math.floor(total / 1000) % 60)}.${pad(total % 1000, 3)}`
}

function cueText(text: string): string {
  return text.replace(/\r?\n\s*\n/g, '\n').replace(/-->/g, '->').trim()
}

export function captionLanguages(track: LectureTrack): string[] {
  return [...new Set([track.lang, ...track.utterances.flatMap(u => Object.keys(u.translations ?? {}))])]
}

/** A sentence's caption in a language: its text, or its translation; undefined when it has none in that language. */
export function captionText(track: LectureTrack, utterance: Utterance, lang: string): string | undefined {
  return lang === track.lang ? utterance.text : utterance.translations?.[lang]?.text
}

export interface Captions {
  lang: string
  vtt: string
  missing: string[]
  stale: string[]
}

export function captionsVtt(track: LectureTrack, lang: string): Captions {
  const cues: string[] = []
  const missing: string[] = []
  const stale: string[] = []
  for (const u of track.utterances) {
    const original = lang === track.lang
    const text = captionText(track, u, lang)
    if (text === undefined) {
      missing.push(u.id)
      continue
    }
    if (!original && isStale(u, lang)) {
      stale.push(u.id)
      cues.push(`NOTE stale: the original of ${u.id} changed after it was translated`)
    }
    for (const group of original ? captionGroups(u) : [{ id: u.id, t: u.t, d: u.d, text }]) {
      cues.push(`${group.id}\n${vttTime(group.t)} --> ${vttTime(group.t + Math.max(group.d, 1))}\n${cueText(group.text)}`)
    }
  }
  return { lang, vtt: `WEBVTT\n\n${cues.join('\n\n')}\n`, missing, stale }
}

export function chaptersVtt(track: LectureTrack, titles: (section: string) => string | undefined = () => undefined): string {
  const list = trackChapters(timedEvents(track), titles)
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
