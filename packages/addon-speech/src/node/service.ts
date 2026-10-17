/**
 * The Node `SPEECH` service (docs/architecture.md 4.8) of a deck, which the
 * lecture plugin's renderer, checks and agent tools use: it calls the
 * engines of this process's environment directly. Synthesis goes through
 * the deck's cache, and `audio` is the path of the file in it.
 */
import { DOCUMENT_FILES } from '@presmium/kernel'
import type { NodeServiceContext, SpeechService } from '@presmium/kernel'
import { deckSpeechConfig } from '../domain/index.ts'
import { SynthesisCache } from './cache.ts'
import { speechCore } from './core.ts'
import { DeckSpeech } from './deck.ts'

export function nodeSpeech(ctx: NodeServiceContext): SpeechService {
  const inner = speechCore({ names: () => Object.keys(process.env), secret: name => ctx.secret(name), settings: ctx.settings, operatorDir: ctx.operatorDir, log: ctx.log })
  // Written through the workspace's writer in `presmium serve` (WP-91).
  const deck = new DeckSpeech(inner, new SynthesisCache(ctx.deckDir, ctx.workspaceRoot, () => ctx.service?.(DOCUMENT_FILES)), deckSpeechConfig(ctx.config).config)
  return {
    async engines() {
      return (await deck.listing(ctx.lang)).engines.map(({ model: _model, transcribeModel: _transcribe, ...info }) => info)
    },
    voices: (engine, lang) => deck.voices(engine, lang),
    async synthesize(request, signal) {
      const { result, file } = await deck.cached(request, signal)
      return {
        audio: file,
        mime: result.mime,
        duration: result.duration,
        ...result.words ? { words: result.words } : {},
        key: result.key,
        engine: result.engine,
        model: result.model,
        voice: result.voice,
        synthetic: true,
      }
    },
    transcribe: (request, signal) => deck.transcribe(request, signal),
  }
}
