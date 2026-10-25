import { existsSync } from 'node:fs'
import { relative } from 'node:path'
import { errorMessage, jsonResponse, problemResponse } from '@lincyaw/kernel'
import type { IRDocument, Route } from '@lincyaw/kernel'
import { CLIPS_DIR, SCRIPT_TRACK, trackDuration } from '../../domain/index.ts'
import type { LectureTrack, MediaSegment } from '../../domain/index.ts'
import { cachedClip } from '../clips.ts'
import { latestDoc, latestView } from '../latest-ir.ts'
import { mediaFile, publishedMedia, trackIds } from '../store.ts'
import { synthesisFailureMessage, synthesizeLecture } from '../synthesize.ts'
import { serveFile } from './serve-file.ts'
import { decodedPath, RouteRefusal } from './served-deck.ts'
import type { ServedDeck } from './served-deck.ts'

const RECENT_CLIP_SETS = 8

export function trackRoutes(served: ServedDeck): Record<string, Route> {
  const { deckDir } = served
  const compiled = (): IRDocument => {
    const doc = latestView(deckDir)
    if (!doc) throw new RouteRefusal(503, 'the deck has not compiled yet')
    return doc
  }

  const recentClipSets = new Map<string, Set<string>>()
  let pendingScriptTrack: { doc: IRDocument, made: Promise<LectureTrack> } | undefined
  const synthesizeScriptTrack = (): Promise<LectureTrack> => {
    const doc = compiled()
    if (pendingScriptTrack?.doc === doc) return pendingScriptTrack.made
    const started = Date.now()
    const document = JSON.stringify(relative(served.ctx.workspaceRoot, deckDir) || '.')
    served.ctx.log.info(`[lecture] document=${document} track=${SCRIPT_TRACK} state=preparing`)
    // A sentence that could not be said plays silent, its caption shown: the lecture still plays on its timeline.
    const made = synthesizeLecture(doc, deckDir, served.speech(), undefined, { cacheOnly: true }).then(({ deck, preview: track, failures, clips }) => {
      for (const failure of failures) served.ctx.log.warn(`[lecture] section=${JSON.stringify(failure.section)} source=${JSON.stringify(failure.source)} ${synthesisFailureMessage(failure, true)}`)
      if (!deck.voice) throw new RouteRefusal(404, `no lecture ${SCRIPT_TRACK}: renderers.lecture.voice names no voice`)
      if (!track) throw new RouteRefusal(502, failures.map(failure => synthesisFailureMessage(failure, true)).join('\n'))
      served.ctx.log.info(`[lecture] document=${document} track=${SCRIPT_TRACK} state=${failures.length ? 'silent-fallback' : 'ready'} elapsedMs=${Date.now() - started} clips=${clips.size} unsaid=${failures.length}`)
      const names = [...new Set([...clips.values()].map(clip => clip.file))].sort()
      const key = names.join('\n')
      recentClipSets.delete(key)
      recentClipSets.set(key, new Set(names))
      if (recentClipSets.size > RECENT_CLIP_SETS) recentClipSets.delete(recentClipSets.keys().next().value!)
      return track
    })
    pendingScriptTrack = { doc, made }
    const done = () => {
      if (pendingScriptTrack?.made === made) pendingScriptTrack = undefined
    }
    made.then(done, (error: unknown) => {
      served.ctx.log.warn(`[lecture] document=${document} track=${SCRIPT_TRACK} state=failed elapsedMs=${Date.now() - started} error=${errorMessage(error)}`)
      done()
    })
    return made
  }

  const serveClip = async (id: string, name: string, request: Request): Promise<Response> => {
    const said = id === SCRIPT_TRACK && served.configuredVoice()
      ? [...recentClipSets.values()].some(names => names.has(name))
      : served.findStoredTrack(id)?.utterances.some(u => u.clip === name)
    if (!said) return problemResponse(404, `no clip ${name} in the lecture ${id}`)
    let clip
    try {
      clip = await cachedClip(served.speech(), name)
    } catch (error) {
      if (error instanceof RouteRefusal) return problemResponse(error.status, error.message)
      return problemResponse(403, `the clip ${name} may not be given: ${errorMessage(error)}`)
    }
    if (!clip) return problemResponse(404, `the clip ${name} is not in the synthesis cache`)
    return serveFile(deckDir, clip.audio, request)
  }

  const withPublishedMedia = (track: LectureTrack): LectureTrack => {
    const isLocal = (segment: MediaSegment) => {
      const file = mediaFile(deckDir, track.id, segment.src)
      return Boolean(file && existsSync(file))
    }
    const audio = publishedMedia(track.audio, track.id, served.policy, isLocal)
    const video = publishedMedia(track.video, track.id, served.policy, isLocal)
    return { ...track, ...audio ? { audio } : {}, ...video ? { video } : {} }
  }

  const serveTrackFile = (id: string, path: string[], request: Request): Promise<Response> | Response => {
    if (path[0] === CLIPS_DIR && path.length === 2) return serveClip(id, decodedPath(path.slice(1)), request)
    return serveFile(deckDir, mediaFile(deckDir, id, decodedPath(path)), request)
  }

  return {
    'tracks': {
      role: 'reader',
      handle() {
        const doc = latestDoc(deckDir)
        const voice = served.configuredVoice()
        const synthetic = voice && doc ? [{ id: SCRIPT_TRACK, lang: doc.meta.lang ?? 'zh-CN', voice: { kind: 'synthetic', ...voice } }] : []
        return jsonResponse([...synthetic, ...trackIds(deckDir).filter(id => !(voice && id === SCRIPT_TRACK)).flatMap((id) => {
          try {
            const track = served.findStoredTrack(id)
            return track ? [{ id, lang: track.lang, voice: track.voice, duration: trackDuration(track), utterances: track.utterances.length }] : []
          } catch {
            return []
          }
        })])
      },
    },
    'tracks/*': {
      role: 'reader',
      async handle(request, { rest }) {
        const [id = '', ...path] = rest.split('/')
        try {
          if (path.length > 0) return await serveTrackFile(id, path, request)
          if (id === SCRIPT_TRACK && served.configuredVoice()) return jsonResponse(await synthesizeScriptTrack())
          const track = served.findStoredTrack(id)
          return track ? jsonResponse(withPublishedMedia(track)) : problemResponse(404, `no lecture ${id}`)
        } catch (error) {
          return problemResponse(error instanceof RouteRefusal ? error.status : 500, errorMessage(error))
        }
      },
    },
  }
}
