import { isAbsolute, relative, resolve } from 'node:path'
import { defineService, DOCUMENT_FILES, SPEECH } from '@lincyaw/kernel'
import type { AgentTool, AgentToolContext, IRDocument, SourceRange, SpeechService } from '@lincyaw/kernel'
import { LECTURES_DIR, narrationDraft, narrationPlace, SCRIPT_TRACK, trackDuration, translationItems } from '../domain/index.ts'
import type { LecturePlan, LectureTrack } from '../domain/index.ts'
import { synthesizedLecture, transcribeLecture, unsaidMessage } from './lecture.ts'
import { deckPlan, latestView } from './plan.ts'
import { digest } from './renderer.ts'
import { deckFiles, readTrack, TRACK_FILE, trackDir } from './store.ts'
import type { DeckFiles } from './store.ts'

export interface LectureDeck {
  deckDir: string
  workspaceRoot: string
}

export const LECTURE_DECK = defineService<LectureDeck>('presmium.lecture.deck')

function deckOf(ctx: AgentToolContext): { deckDir: string, doc: IRDocument, files: DeckFiles } {
  const deck = ctx.service(LECTURE_DECK)
  if (!deck) throw new Error('this document does not use the lecture plugin')
  const doc = latestView(deck.deckDir)
  if (!doc) throw new Error('the document has not compiled yet')
  return { deckDir: deck.deckDir, doc, files: deckFiles(deck.workspaceRoot, () => ctx.service(DOCUMENT_FILES)) }
}

function speechOf(ctx: AgentToolContext): SpeechService {
  const speech = ctx.service(SPEECH)
  if (!speech) throw new Error('no speech service: the deck needs @lincyaw/slidev-addon-speech')
  return speech
}

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
    const { deckDir, doc, files } = deckOf(ctx)
    const made = await synthesizedLecture(doc, deckDir, speechOf(ctx), ctx.signal, { files })
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
    const { deckDir, doc, files } = deckOf(ctx)
    if (typeof input.track !== 'string' || !input.track) throw new Error('track: the lecture id is required')
    const { track, bound, provider } = await transcribeLecture(files, deckDir, input.track, speechOf(ctx), doc, ctx.signal)
    return { track: track.id, provider, utterances: track.utterances.map(u => ({ id: u.id, section: u.section, t: u.t, text: u.text })), bound }
  },
}

function storedTrack(deckDir: string, input: Record<string, unknown>): LectureTrack {
  if (typeof input.track !== 'string' || !input.track) throw new Error('track: the lecture id is required')
  const track = trackDir(deckDir, input.track) ? readTrack(deckDir, input.track)?.track : undefined
  if (!track) throw new Error(`no lecture ${input.track} (lectures/${input.track}/${TRACK_FILE})`)
  return track
}

const TRACK_INPUT = { track: { type: 'string', description: 'The lecture id (a directory of lectures/)' } }

export const trackNarration: AgentTool = {
  name: 'track_narration',
  description: 'A recorded lecture\'s transcript as narration, to write it back into the deck (P-136): per section and step, the sentences said there joined (draft), with a {cue …}`…` role before the word each action of the lecture (spotlight, pointer, next step, run …) was bound to; and where that step\'s narration is in the source (narration: file and lines of its paragraphs; for a step without narration, the on-screen block it follows: after). Reads only.',
  input: { type: 'object', properties: { ...TRACK_INPUT, section: { type: 'string', description: 'Only this section id' } }, required: ['track'] },
  kind: 'read',
  async run(input, ctx) {
    const { deckDir, doc } = deckOf(ctx)
    const track = storedTrack(deckDir, input)
    const draft = narrationDraft(track, typeof input.section === 'string' ? input.section : undefined)
    const { plan } = deckPlan(doc, deckDir)
    const file = (range: SourceRange): SourceRange => ({ ...range, file: relative(deckDir, isAbsolute(range.file) ? range.file : resolve(deckDir, range.file)) })
    return {
      track: track.id,
      lang: track.lang,
      sections: draft.sections.map(s => ({
        section: s.section,
        title: doc.sections.find(own => own.id === s.section)?.title ?? '(the deck has no such section now)',
        steps: s.steps.map((step) => {
          const place = narrationPlace(doc, plan, s.section, step.step)
          return { ...step, narration: place.narration.map(file), ...place.after ? { after: { ...file(place.after), block: place.after.block } } : {} }
        }),
      })),
      ...draft.skipped ? { skipped: `${draft.skipped} actions bound to words have no {cue}` } : {},
    }
  },
}

export const trackTranslations: AgentTool = {
  name: 'track_translations',
  description: 'The sentences (utterances) of a recorded lecture to translate (P-137): each with its id, text and source, the digest of the text that its translation records; with the translation into lang it has, if any, and whether that is stale. Write a translation into the utterance\'s line of lectures/<track>/track.json as "translations": { "<lang>": { "text": "…", "source": "<source>" } }. Reads only.',
  input: { type: 'object', properties: { ...TRACK_INPUT, lang: { type: 'string', description: 'The language to translate into (BCP 47), e.g. en' } }, required: ['track', 'lang'] },
  kind: 'read',
  async run(input, ctx) {
    const { deckDir } = deckOf(ctx)
    const track = storedTrack(deckDir, input)
    if (typeof input.lang !== 'string' || !input.lang) throw new Error('lang: the language to translate into is required')
    return { track: track.id, file: `${LECTURES_DIR}/${track.id}/${TRACK_FILE}`, lang: track.lang, into: input.lang, utterances: translationItems(track, input.lang, digest) }
  },
}

export const lectureTools: AgentTool[] = [lecturePreview, lectureSynthesize, trackTranscribe, trackNarration, trackTranslations]
