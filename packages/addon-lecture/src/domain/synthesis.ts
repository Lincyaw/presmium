import type { TrackEvent, WrittenWord } from '@presmium/kernel'
import type { LecturePlan, PlannedCue } from './plan.ts'
import { wordTime } from './timing.ts'
import type { LectureTrack, TrackBlock, Utterance, Voice } from './track.ts'
import { sortEvents, TRACK_VERSION } from './track.ts'
import { charOffset, trackWords, wordIndexAt } from './words.ts'

export interface Clip {
  file: string
  duration: number
  words?: WrittenWord[]
}

export interface ScriptHead {
  id: string
  doc: string
  lang: string
  ir: LectureTrack['ir']
  voice: Voice
  gap: number
}

function anchorAt(utterance: Utterance, words: readonly WrittenWord[] | undefined, offset: number): number {
  return words?.length ? wordIndexAt(words, offset, utterance.text.length) : charOffset(utterance.text, offset)
}

export function scriptTrack(plan: LecturePlan, clips: ReadonlyMap<string, Clip>, head: ScriptHead, blocks: (events: TrackEvent[]) => Record<string, TrackBlock>): LectureTrack {
  const events: TrackEvent[] = []
  const utterances: Utterance[] = []
  let t = 0
  let inked = false
  for (const section of plan.sections) {
    let current = 0
    const go = (at: number, step: number) => events.push([at, 'go', { section: section.id, step: section.webStep(step) }])
    go(t, 0)
    if (inked) events.push([t, 'ink', { clear: true }])
    inked = false
    for (let step = 0; step <= section.steps; step++) {
      if (step > current) {
        go(t, step)
        current = step
      }
      const paragraphs = section.paragraphs.filter(p => p.step === step)
      for (const paragraph of paragraphs) {
        for (const piece of paragraph.pieces) {
          const clip = piece.id ? clips.get(piece.id) : undefined
          let utterance: Utterance | undefined
          if (piece.id && clip) {
            utterance = { id: piece.id, t, d: Math.round(clip.duration * 1000), text: piece.text, section: section.id, step: section.webStep(current), clip: clip.file }
            if (clip.words?.length) utterance.words = trackWords(clip.words, t)
            utterances.push(utterance)
          }
          const cue = (c: PlannedCue, data: Record<string, unknown>) => {
            if (c.name === 'ink') inked = true
            if (!utterance) return events.push([t, c.name === 'next' ? 'go' : c.name, data])
            const at = anchorAt(utterance, clip?.words, c.offset)
            events.push([wordTime(utterance, at), c.name === 'next' ? 'go' : c.name, { ...data, at: [utterance.id, at] }])
          }
          for (const c of piece.cues) {
            if (c.name === 'next') {
              if (current >= section.steps) continue
              current++
              cue(c, { section: section.id, step: section.webStep(current) })
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
  }
  return {
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
}
