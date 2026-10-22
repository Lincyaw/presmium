import { isRecord, speechEngineId } from '@lincyaw/kernel'
import type { IRDocument, SpeechEngineInfo, SpeechService } from '@lincyaw/kernel'

export function sameEngine(a: string, b: string): boolean {
  return speechEngineId(a) === speechEngineId(b)
}

function speechConfig(doc: IRDocument | undefined): Record<string, unknown> {
  const config = doc?.config.presmium['presmium.speech']
  return isRecord(config) ? config : {}
}

export async function transcriptionEngine(speech: SpeechService, doc: IRDocument | undefined): Promise<SpeechEngineInfo | undefined> {
  const config = speechConfig(doc)
  const named = [config.transcribe, config.engine].find((v): v is string => typeof v === 'string' && v.length > 0)
  const engines = (await speech.engines()).filter(e => e.stt)
  return named ? engines.find(e => sameEngine(e.id, named)) : engines[0]
}

export async function synthesisEngine(speech: SpeechService, doc: IRDocument | undefined, engine?: string): Promise<SpeechEngineInfo | undefined> {
  const config = speechConfig(doc)
  const named = [engine, config.engine].find((v): v is string => typeof v === 'string' && v.length > 0)
  const engines = (await speech.engines()).filter(e => e.tts)
  return named ? engines.find(e => sameEngine(e.id, named)) : engines[0]
}
