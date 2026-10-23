import { errorMessage, isRecord, jsonResponse, problemResponse } from '@lincyaw/kernel'
import type { Route } from '@lincyaw/kernel'
import { editUtterance, lexiconOf, resynthesizedTrack } from '../../domain/index.ts'
import type { LectureTrack, Voice } from '../../domain/index.ts'
import { whyNoTranscriptionEngine, synthesisEngine, transcriptionEngine } from '../engines.ts'
import { latestDoc } from '../latest-ir.ts'
import { writeTrack } from '../store.ts'
import { clipVoice, synthesizeClip } from '../synthesize.ts'
import type { SynthesizedClip } from '../synthesize.ts'
import { transcribeLecture } from '../transcribe.ts'
import { decodedPath, RouteRefusal } from './served-deck.ts'
import type { ServedDeck } from './served-deck.ts'

export function editingRoutes(served: ServedDeck): Record<string, Route> {
  const { ctx, deckDir, files } = served
  const lexicon = lexiconOf(ctx.config)

  const save = async (track: LectureTrack) => {
    await writeTrack(files, deckDir, track)
    return jsonResponse({ track })
  }
  const resynthesize = async (track: LectureTrack, voice: { engine?: string, voice: string }, only?: string): Promise<LectureTrack> => {
    const clips = new Map<string, SynthesizedClip>()
    for (const u of track.utterances) {
      if (only && u.id !== only) continue
      clips.set(u.id, await synthesizeClip(served.speech(), { text: u.text, spoken: u.text, spans: [] }, { voice, lang: track.lang, ...lexicon ? { lexicon } : {} }))
    }
    const said: Voice = clips.size ? clipVoice(clips.values(), voice) : track.voice
    return resynthesizedTrack(track, clips, said)
  }

  return {
    'speech': {
      async handle(request) {
        try {
          const speech = served.speech()
          const doc = latestDoc(deckDir)
          const engine = new URL(request.url).searchParams.get('engine') || undefined
          const [transcribe, synthesize] = await Promise.all([transcriptionEngine(speech, doc), synthesisEngine(speech, doc, engine)])
          const voices = synthesize ? await speech.voices(synthesize.id, doc?.meta.lang).catch(() => []) : []
          const info = (e: typeof transcribe) => e && { engine: e.id, provider: e.provider, local: e.local }
          return jsonResponse({ transcribe: info(transcribe), synthesize: synthesize && { ...info(synthesize), voices } })
        } catch (error) {
          return error instanceof RouteRefusal ? problemResponse(error.status, error.message) : problemResponse(502, errorMessage(error))
        }
      },
    },
    'editing/*': {
      async handle(request, { rest }) {
        const [id = '', action, ...path] = rest.split('/')
        try {
          const track = served.getStoredTrack(id)
          if (action === 'transcribe' && request.method === 'POST') {
            if (!(await transcriptionEngine(served.speech(), latestDoc(deckDir)))) throw new RouteRefusal(503, whyNoTranscriptionEngine(latestDoc(deckDir)))
            const { track: transcribed, bound, provider } = await transcribeLecture(files, deckDir, track.id, served.speech(), latestDoc(deckDir), request.signal)
            ctx.log.info(`lecture ${id}: transcribed by ${provider}, ${transcribed.utterances.length} utterances, ${bound} events bound to words`)
            return jsonResponse({ provider, bound, track: transcribed })
          }
          if (action === 'utterances' && request.method === 'PUT' && path.length === 1) {
            const body: unknown = await request.json().catch(() => undefined)
            if (!isRecord(body) || typeof body.text !== 'string' || !body.text.trim()) throw new RouteRefusal(400, 'expected { text }')
            const edited = editUtterance(track, decodedPath(path), body.text)
            if (!edited) throw new RouteRefusal(404, `lecture ${id} has no utterance ${decodedPath(path)}`)
            const { voice } = track
            return await save(voice.kind === 'synthetic' ? await resynthesize(edited, { engine: voice.engine, voice: voice.voice }, decodedPath(path)) : edited)
          }
          if (action === 'synthesize' && request.method === 'POST') {
            const body: unknown = await request.json().catch(() => undefined)
            if (!isRecord(body) || typeof body.voice !== 'string' || !body.voice) throw new RouteRefusal(400, 'expected { voice, engine? }')
            if (track.utterances.length === 0) throw new RouteRefusal(409, `lecture ${id} has no utterances to say: transcribe it first`)
            const engine = typeof body.engine === 'string' && body.engine ? body.engine : undefined
            return await save(await resynthesize(track, { ...engine ? { engine } : {}, voice: body.voice }))
          }
          return problemResponse(404, 'unknown editing action')
        } catch (error) {
          if (error instanceof RouteRefusal) return problemResponse(error.status, error.message)
          ctx.log.error(`lecture ${id}: ${errorMessage(error)}`)
          return problemResponse(502, errorMessage(error))
        }
      },
    },
  }
}
