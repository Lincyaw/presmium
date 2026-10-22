import type { NodeServiceContext, SpeechService } from '@lincyaw/kernel'
import { createDeckSpeech } from './cached-speech.ts'

export function nodeSpeech(ctx: NodeServiceContext): SpeechService {
  const { speech } = createDeckSpeech(ctx)
  return {
    async engines() {
      return (await speech.listEngines(ctx.lang)).engines.map(({ model: _model, transcribeModel: _transcribe, ...info }) => info)
    },
    voices: (engine, lang) => speech.voices(engine, lang),
    async synthesize(request, signal) {
      const { result, file } = await speech.synthesizeThroughCache(request, signal)
      return {
        audio: file,
        mime: result.mime,
        duration: result.duration,
        ...result.words ? { words: result.words } : {},
        key: result.key,
        engine: result.engine,
        model: result.model,
        voice: result.voice,
        provider: result.provider,
        synthetic: true,
      }
    },
    async cached(key, signal) {
      const hit = await speech.cache.find(key)
      if (!hit) return undefined
      const { record, file } = hit
      await speech.consent(record.engine, record.voice, record.cloned === true, signal)
      return {
        audio: file,
        mime: record.mime,
        duration: record.duration,
        ...record.words ? { words: record.words } : {},
        key,
        engine: record.engine,
        model: record.model,
        voice: record.voice,
        provider: record.provider,
        synthetic: true,
      }
    },
    alignWords: (key, options, signal) => speech.alignWords(key, options, signal),
    pruneLock: keep => speech.cache.pruneLock(keep),
    transcribe: (request, signal) => speech.transcribe(request, signal),
  }
}
