import { DOCUMENT_FILES } from '@presmium/kernel'
import type { NodeServiceContext, SpeechService } from '@presmium/kernel'
import { deckSpeechConfig } from '../domain/index.ts'
import { SynthesisCache } from './cache.ts'
import { speechCore } from './core.ts'
import { DeckSpeech } from './deck.ts'

export function nodeSpeech(ctx: NodeServiceContext): SpeechService {
  const inner = speechCore({ names: () => Object.keys(process.env), secret: name => ctx.secret(name), settings: ctx.settings, operatorDir: ctx.operatorDir, log: ctx.log })
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
    async cached(key, signal) {
      const hit = await deck.cache.find(key)
      if (!hit) return undefined
      const { record, file } = hit
      await deck.consent(record.engine, record.voice, record.cloned === true, signal)
      return {
        audio: file,
        mime: record.mime,
        duration: record.duration,
        ...record.words ? { words: record.words } : {},
        key,
        engine: record.engine,
        model: record.model,
        voice: record.voice,
        synthetic: true,
      }
    },
    transcribe: (request, signal) => deck.transcribe(request, signal),
  }
}
