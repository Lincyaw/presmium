import { DOCUMENT_FILES, SPEECH } from '@lincyaw/kernel'
import type { ServerContext, SpeechService } from '@lincyaw/kernel'
import { configuredLectureVoice } from '../../domain/index.ts'
import type { LectureTrack, LectureVoice } from '../../domain/index.ts'
import { latestDoc } from '../latest-ir.ts'
import { deckFiles, mediaPolicy, readTrack, trackDir } from '../store.ts'
import type { DeckFiles, MediaPolicy } from '../store.ts'

export class RouteRefusal extends Error {
  readonly status: number

  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

export interface ServedDeck {
  ctx: ServerContext
  deckDir: string
  files: DeckFiles
  policy: MediaPolicy
  speech(): SpeechService
  configuredVoice(): LectureVoice | undefined
  findStoredTrack(id: string): LectureTrack | undefined
  getStoredTrack(id: string): LectureTrack
}

export function createServedDeck(ctx: ServerContext): ServedDeck {
  const { deckDir } = ctx
  const findStoredTrack = (id: string) => (trackDir(deckDir, id) ? readTrack(deckDir, id)?.track : undefined)
  return {
    ctx,
    deckDir,
    files: deckFiles(ctx.workspaceRoot, () => ctx.service(DOCUMENT_FILES)),
    policy: mediaPolicy(ctx.settings),
    speech() {
      const found = ctx.service(SPEECH)
      if (!found) throw new RouteRefusal(503, 'no speech service: add @lincyaw/addon-speech to the deck\'s plugins')
      return found
    },
    configuredVoice() {
      const doc = latestDoc(deckDir)
      return doc ? configuredLectureVoice(doc) : undefined
    },
    findStoredTrack,
    getStoredTrack(id) {
      const track = findStoredTrack(id)
      if (!track) throw new RouteRefusal(404, `no lecture ${id}`)
      return track
    },
  }
}

export function decodedPath(segments: string[]): string {
  try {
    return segments.map(decodeURIComponent).join('/')
  } catch {
    return ''
  }
}
