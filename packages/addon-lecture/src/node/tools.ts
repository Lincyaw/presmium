/**
 * The lecture plugin's agent tools (docs/architecture.md 4.8, MCP's
 * plugin tools): an agent writing a lecture reads the plan its narration
 * and cues make (`lecture_preview`), has it said (`lecture_synthesize`,
 * paid: the clips the synthesis cache lacks go to the engine), and has a
 * recorded lecture transcribed (`track_transcribe`, paid: its audio goes to
 * the transcription engine's provider). MCP asks for approval of the paid
 * ones (`spend`) before calling them. A tool reaches its deck through the
 * deck's Node service `LECTURE_DECK`, and plans from the latest IR (the
 * lecture renderer's view of it, as a build does).
 */
import { defineService, SPEECH } from '@presmium/kernel'
import type { AgentTool, AgentToolContext, IRDocument, SpeechService } from '@presmium/kernel'
import { SCRIPT_TRACK, trackDuration } from '../domain/index.ts'
import type { LecturePlan } from '../domain/index.ts'
import { synthesizedLecture, transcribeLecture, unsaidMessage } from './lecture.ts'
import { deckPlan, latestView } from './plan.ts'

/** The deck of a document, for the tools: a Node service of the lecture plugin. */
export interface LectureDeck {
  deckDir: string
}

export const LECTURE_DECK = defineService<LectureDeck>('presmium.lecture.deck')

function deckOf(ctx: AgentToolContext): { deckDir: string, doc: IRDocument } {
  const deck = ctx.service(LECTURE_DECK)
  if (!deck) throw new Error('this document does not use the lecture plugin')
  const doc = latestView(deck.deckDir)
  if (!doc) throw new Error('the document has not compiled yet')
  return { deckDir: deck.deckDir, doc }
}

function speechOf(ctx: AgentToolContext): SpeechService {
  const speech = ctx.service(SPEECH)
  if (!speech) throw new Error('no speech service: the deck needs @presmium/slidev-addon-speech')
  return speech
}

/** The plan as the agent reads it: per section and step, what is said and the cues in it (at the word they sit before). */
function planView(plan: LecturePlan, section?: string) {
  return plan.sections.filter(s => !section || s.id === section).map(s => ({
    section: s.id,
    title: s.title,
    from: s.from,
    steps: s.steps,
    paragraphs: s.paragraphs.map(p => ({
      step: p.step,
      said: p.pieces.map(piece => ({
        ...piece.id ? { utterance: piece.id } : {},
        text: piece.text,
        ...piece.spoken !== piece.text ? { spoken: piece.spoken } : {},
        cues: piece.cues.map(c => ({ cue: c.name, before: piece.text.slice(c.offset, c.offset + 8) || '(end)', ...c.data })),
        ...piece.pause ? { pauseMs: piece.pause } : {},
      })),
    })),
  }))
}

export const lecturePreview: AgentTool = {
  name: 'lecture_preview',
  description: 'The lecture plan of the deck: per section and step, the narration the synthesized lecture says (or the separate script\'s, renderers.lecture.script) and the {cue} marks in it with the operation each makes; the voice; and problems (unknown cues, missing blocks). Reads only; nothing is synthesized.',
  input: { type: 'object', properties: { section: { type: 'string', description: 'Only this section id' } } },
  kind: 'read',
  async run(input, ctx) {
    const { deckDir, doc } = deckOf(ctx)
    const deck = deckPlan(doc, deckDir)
    return {
      voice: deck.voice ?? null,
      gapMs: deck.gap,
      sections: planView(deck.plan, typeof input.section === 'string' ? input.section : undefined),
      problems: [...deck.findings.map(f => f.message), ...deck.plan.problems.filter(p => p.compiled).map(p => p.message)],
      play: deck.voice ? `?view=lecture&track=${SCRIPT_TRACK}` : null,
    }
  },
}

export const lectureSynthesize: AgentTool = {
  name: 'lecture_synthesize',
  description: 'Says the deck\'s lecture plan with its voice (renderers.lecture.voice): the clips the synthesis cache (.presmium/speech/) lacks are synthesized by the speech engine, which costs money; the others come from the cache. Returns the synthesized lecture\'s length and parts; play it with ?view=lecture&track=script.',
  input: { type: 'object', properties: {} },
  kind: 'spend',
  async run(_input, ctx) {
    const { deckDir, doc } = deckOf(ctx)
    const made = await synthesizedLecture(doc, deckDir, speechOf(ctx), ctx.signal)
    if (!made.deck.voice) throw new Error('renderers.lecture.voice names no voice: the deck has no synthesized lecture')
    if (!made.track) throw new Error(made.unsaid.map(unsaidMessage).join('\n'))
    return {
      track: SCRIPT_TRACK,
      voice: made.track.voice,
      durationMs: trackDuration(made.track),
      utterances: made.track.utterances.length,
      events: made.track.events.length,
      problems: made.deck.findings.map(f => f.message),
    }
  },
}

export const trackTranscribe: AgentTool = {
  name: 'track_transcribe',
  description: 'Transcribes a recorded lecture (lectures/<track>/): its audio goes to the speech engine\'s provider, which costs money; the transcript becomes the lecture\'s utterances, and the actions taken while a sentence was said are bound to its words. Writes lectures/<track>/track.json.',
  input: { type: 'object', properties: { track: { type: 'string', description: 'The lecture id (a directory of lectures/)' } }, required: ['track'] },
  kind: 'spend',
  async run(input, ctx) {
    const { deckDir, doc } = deckOf(ctx)
    if (typeof input.track !== 'string' || !input.track) throw new Error('track: the lecture id is required')
    const { track, bound, provider } = await transcribeLecture(deckDir, input.track, speechOf(ctx), doc, ctx.signal)
    return { track: track.id, provider, utterances: track.utterances.map(u => ({ id: u.id, section: u.section, t: u.t, text: u.text })), bound }
  },
}

export const lectureTools: AgentTool[] = [lecturePreview, lectureSynthesize, trackTranscribe]
