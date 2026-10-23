import { isRecord, speechEngineId } from '@lincyaw/kernel'
import type { IRDocument, SpeechEngineInfo, SpeechService } from '@lincyaw/kernel'

export function sameEngine(a: string, b: string): boolean {
  return speechEngineId(a) === speechEngineId(b)
}

function speechConfig(doc: IRDocument | undefined): Record<string, unknown> {
  const config = doc?.config.presmium['presmium.speech']
  return isRecord(config) ? config : {}
}

function setting(doc: IRDocument | undefined, key: 'transcribe' | 'engine'): string | undefined {
  const value = speechConfig(doc)[key]
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

/**
 * The engine that transcribes the document's recordings: the one presmium.speech.transcribe names, else
 * its default engine (presmium.speech.engine) when that one transcribes, else the first that does.
 */
export async function transcriptionEngine(speech: SpeechService, doc: IRDocument | undefined): Promise<SpeechEngineInfo | undefined> {
  const engines = (await speech.engines()).filter(e => e.stt)
  const named = setting(doc, 'transcribe')
  if (named) return engines.find(e => sameEngine(e.id, named))
  const preferred = setting(doc, 'engine')
  return (preferred && engines.find(e => sameEngine(e.id, preferred))) || engines[0]
}

/** Why the document has no transcription engine. */
export function whyNoTranscriptionEngine(doc: IRDocument | undefined): string {
  const named = setting(doc, 'transcribe')
  return named
    ? `presmium.speech.transcribe names speech engine "${named}", which is not defined or does not transcribe; name an engine that transcribes`
    : 'no speech engine transcribes: the operator defines one (PRESMIUM_SPEECH_<ID>_URL and _PROVIDER)'
}

export async function synthesisEngine(speech: SpeechService, doc: IRDocument | undefined, engine?: string): Promise<SpeechEngineInfo | undefined> {
  const config = speechConfig(doc)
  const named = [engine, config.engine].find((v): v is string => typeof v === 'string' && v.length > 0)
  const engines = (await speech.engines()).filter(e => e.tts)
  return named ? engines.find(e => sameEngine(e.id, named)) : engines[0]
}
