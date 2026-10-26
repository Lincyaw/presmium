import { existsSync } from 'node:fs'
import { irRevision } from '@lincyaw/kernel/node'
import { errorMessage, jsonResponse, problemResponse } from '@lincyaw/kernel'
import type { Route } from '@lincyaw/kernel'
import { CLIPS_DIR, SCRIPT_TRACK, trackDuration } from '../../domain/index.ts'
import type { LectureTrack, MediaSegment } from '../../domain/index.ts'
import { cachedClip } from '../clips.ts'
import { latestDoc } from '../latest-ir.ts'
import { mediaFile, publishedMedia, trackIds } from '../store.ts'
import { productionSnapshot } from '../production.ts'
import { deckPlan } from '../plan.ts'
import { serveFile } from './serve-file.ts'
import { decodedPath, RouteRefusal } from './served-deck.ts'
import type { ServedDeck } from './served-deck.ts'

const RECENT_CLIP_SETS = 8

export function trackRoutes(served: ServedDeck): Record<string, Route> {
  const { deckDir } = served

  const recentClipSets = new Map<string, Set<string>>()
  const synthesizeScriptTrack = async (request: Request): Promise<LectureTrack> => {
    const planId = new URL(request.url).searchParams.get('planId')
    const doc = latestDoc(deckDir)
    const expected = planId && doc?.source ? { planId, source: doc.source, irRevision: irRevision(doc) } : undefined
    const snapshot = await productionSnapshot(served, expected, request.signal)
    if (snapshot.plan.diagnostics.some(issue => issue.severity === 'error')) throw new RouteRefusal(409, 'production-plan-unavailable')
    const names = snapshot.track.utterances.flatMap(utterance => utterance.clip ?? []), key = names.join('\n')
    recentClipSets.delete(key); recentClipSets.set(key, new Set(names))
    if (recentClipSets.size > RECENT_CLIP_SETS) recentClipSets.delete(recentClipSets.keys().next().value!)
    return snapshot.track
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
        const silent = doc && deckPlan(doc).silent
        const synthetic = (voice || silent) && doc && !deckPlan(doc).findings.some(finding => finding.severity === 'error') ? [{ id: SCRIPT_TRACK, lang: doc.meta.lang ?? 'zh-CN', voice: voice ? { kind: 'synthetic', ...voice } : { kind: 'silent' } }] : []
        return jsonResponse([...synthetic, ...trackIds(deckDir).filter(id => !((voice || silent) && id === SCRIPT_TRACK)).flatMap((id) => {
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
          if (id === SCRIPT_TRACK && (served.configuredVoice() || latestDoc(deckDir) && deckPlan(latestDoc(deckDir)!).silent)) return jsonResponse(await synthesizeScriptTrack(request))
          const track = served.findStoredTrack(id)
          return track ? jsonResponse(withPublishedMedia(track)) : problemResponse(404, `no lecture ${id}`)
        } catch (error) {
          return problemResponse(error instanceof RouteRefusal ? error.status : 500, errorMessage(error))
        }
      },
    },
  }
}
