import type { SourcePos, TrackEvent, WrittenWord } from '@lincyaw/kernel'
import type { LecturePlan, PlannedCue } from './plan.ts'
import { wordTime } from './timing.ts'
import type { LectureTrack, TrackBlock, Utterance, Voice } from './track.ts'
import { sortEvents, spokenDuration, TRACK_VERSION } from './track.ts'
import { charOffset, trackWords, wordIndexAt } from './words.ts'

export interface Clip {
  file: string
  duration: number
  words?: WrittenWord[]
  speech?: Voice
}

export interface ScriptHead {
  id: string
  doc: string
  lang: string
  ir: LectureTrack['ir']
  voice: Voice
  gap: number
}

/** A `{cue}next` that moved on before the animation of its step had played. */
export interface CutAnimation {
  section: string
  /** The step whose animation the cue cut short (as the plan counts steps). */
  step: number
  /** How much of the animation was left (ms). */
  left: number
  source?: SourcePos
}

function anchorAt(utterance: Utterance, words: readonly WrittenWord[] | undefined, offset: number): number {
  return words?.length ? wordIndexAt(words, offset, utterance.text.length) : charOffset(utterance.text, offset)
}

/**
 * The synthesized lecture's timeline. A step lasts as long as its longest animation, except where the
 * narration says `{cue}next` before then: the cue keeps the word it is bound to, and `cuts` list it.
 */
/**
 * The lecture of `plan` said with `clips`. `unsaid`: the sentences without a clip, by id, with the reason; each plays
 * silent for the time it would take to say, so that a preview keeps the lecture's timeline.
 */
export function scriptTrack(plan: LecturePlan, clips: ReadonlyMap<string, Clip>, head: ScriptHead, blocks: (events: TrackEvent[]) => Record<string, TrackBlock>, unsaid: ReadonlyMap<string, string> = new Map()): { track: LectureTrack, cuts: CutAnimation[] } {
  const cuts: CutAnimation[] = []
  const events: TrackEvent[] = []
  const utterances: Utterance[] = []
  let t = 0
  let inked = false
  for (const section of plan.sections) {
    let current = 0
    let since = t
    const go = (at: number, step: number) => events.push([at, 'go', { section: section.id, step: section.webStep(step) }])
    // A step lasts as long as its longest animation: the lecture waits for it before it moves on.
    const hold = () => {
      const until = since + (section.holds[current] ?? 0)
      if (until <= t) return
      events.push([t, 'pause', { ms: until - t, hold: true }])
      t = until
    }
    go(t, 0)
    if (inked) events.push([t, 'ink', { clear: true }])
    inked = false
    for (let step = 0; step <= section.steps; step++) {
      if (step > current) {
        hold()
        go(t, step)
        current = step
        since = t
      }
      const paragraphs = section.paragraphs.filter(p => p.step === step)
      for (const paragraph of paragraphs) {
        if (paragraph.mode === 'after') hold()
        for (const piece of paragraph.pieces) {
          const clip = piece.id ? clips.get(piece.id) : undefined
          let utterance: Utterance | undefined
          if (piece.id && clip) {
            utterance = { id: piece.id, t, d: Math.round(clip.duration * 1000), text: piece.text, section: section.id, step: section.webStep(current), clip: clip.file }
            if (clip.speech) utterance.voice = clip.speech
            if (clip.words?.length) utterance.words = trackWords(clip.words, t)
            utterances.push(utterance)
          } else if (piece.id && unsaid.has(piece.id)) {
            utterance = { id: piece.id, t, d: spokenDuration(piece.text, head.lang), text: piece.text, section: section.id, step: section.webStep(current), unsaid: unsaid.get(piece.id)! }
            utterances.push(utterance)
          }
          const cue = (c: PlannedCue, data: Record<string, unknown>): number => {
            if (c.name === 'ink') inked = true
            if (!utterance) {
              events.push([t, c.name === 'next' ? 'go' : c.name, data])
              return t
            }
            const at = anchorAt(utterance, clip?.words, c.offset)
            const time = wordTime(utterance, at)
            events.push([time, c.name === 'next' ? 'go' : c.name, { ...data, at: [utterance.id, at] }])
            return time
          }
          for (const c of piece.cues) {
            if (c.name === 'next') {
              if (current >= section.steps) continue
              const end = since + (section.holds[current] ?? 0)
              current++
              since = cue(c, { section: section.id, step: section.webStep(current) })
              if (since < end) cuts.push({ section: section.id, step: current - 1, left: end - since, ...paragraph.source ? { source: paragraph.source } : {} })
            } else {
              cue(c, c.data)
            }
          }
          if (utterance) t += utterance.d
          if (piece.pause) t += piece.pause
        }
        t += head.gap
      }
      if (paragraphs.length === 0) t += head.gap
    }
    hold()
  }
  const track: LectureTrack = {
    track: TRACK_VERSION,
    id: head.id,
    doc: head.doc,
    lang: head.lang,
    ir: head.ir,
    voice: head.voice,
    blocks: blocks(events),
    utterances,
    events: sortEvents(events),
  }
  return { track, cuts }
}
