import { randomBytes } from 'node:crypto'
import { renameSync, writeFileSync } from 'node:fs'
import { basename, join, relative } from 'node:path'
import { isRecord } from '@lincyaw/kernel'
import type { IRDocument, SpeechEngineInfo, SpeechService, Synthesis } from '@lincyaw/kernel'
import { CLIP_FILE, irHash, referencedBlocks, SCRIPT_TRACK, scriptTrack, sectionHashes, transcribedTrack } from '../domain/index.ts'
import type { LectureTrack } from '../domain/index.ts'
import type { DeckPlan } from './plan.ts'
import { deckPlan } from './plan.ts'
import type { MadeClip, Unsaid } from './speak.ts'
import { audioBlob, clipVoice, sameEngine, synthesizePlan, transcribeSegments } from './speak.ts'
import { mediaFile, readInDeck, readRegular, readTrack, trackDir, writeTrack } from './store.ts'
import type { DeckFiles } from './store.ts'

export function speechDir(deckDir: string): string {
  return join(deckDir, '.presmium', 'speech')
}

export function clipFile(deckDir: string, name: string): string | undefined {
  return CLIP_FILE.test(name) ? join(speechDir(deckDir), name) : undefined
}

export async function cachedClip(speech: SpeechService, name: string, signal?: AbortSignal): Promise<Synthesis | undefined> {
  if (!CLIP_FILE.test(name)) return undefined
  if (!speech.cached) throw new Error('the speech service cannot look a clip up in its cache')
  const found = await speech.cached(name.replace(/\.\w+$/, ''), signal)
  return found && typeof found.audio === 'string' && basename(found.audio) === name ? found : undefined
}

export interface SynthesizedLecture {
  deck: DeckPlan
  track?: LectureTrack
  clips: Map<string, MadeClip>
  unsaid: Unsaid[]
}

export async function synthesizedLecture(doc: IRDocument, deckDir: string, speech: SpeechService, signal?: AbortSignal, options: { files?: DeckFiles } = {}): Promise<SynthesizedLecture> {
  const deck = deckPlan(doc, deckDir)
  const clips = new Map<string, MadeClip>()
  if (!deck.voice) return { deck, clips, unsaid: [] }
  const made = await synthesizePlan(speech, deck.plan, { voice: deck.voice, lang: deck.lang, ...deck.lexicon ? { lexicon: deck.lexicon } : {}, ...options.files ? { files: options.files } : {} }, signal)
  if (made.unsaid.length > 0) return { deck, clips: made.clips, unsaid: made.unsaid }
  const track = scriptTrack(deck.plan, made.clips, {
    id: SCRIPT_TRACK,
    doc: relative(deckDir, doc.meta.entry) || doc.meta.entry,
    lang: deck.lang,
    ir: { hash: irHash(doc), sections: sectionHashes(doc) },
    voice: clipVoice(made.clips.values(), deck.voice),
    gap: deck.gap,
  }, events => referencedBlocks(doc, events))
  return { deck, track, clips: made.clips, unsaid: [] }
}

export function unsaidMessage(u: Unsaid): string {
  const text = u.text.length > 40 ? `${u.text.slice(0, 40)}…` : u.text
  return `lecture ${SCRIPT_TRACK}: 「${text}」 (section ${u.section}) could not be said from the synthesis cache nor synthesized: ${u.reason}`
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

export async function synthesisEngineOf(speech: SpeechService, doc: IRDocument | undefined, engine?: string): Promise<SpeechEngineInfo | undefined> {
  const config = speechConfig(doc)
  const named = [engine, config.engine].find((v): v is string => typeof v === 'string' && v.length > 0)
  const engines = (await speech.engines()).filter(e => e.tts)
  return named ? engines.find(e => sameEngine(e.id, named)) : engines[0]
}

export async function transcribeLecture(files: DeckFiles, deckDir: string, id: string, speech: SpeechService, doc: IRDocument | undefined, signal?: AbortSignal): Promise<{ track: LectureTrack, bound: number, provider: string }> {
  const stored = trackDir(deckDir, id) ? readTrack(deckDir, id) : undefined
  if (!stored) throw new Error(`no lecture ${id}`)
  const engine = await transcriptionEngine(speech, doc)
  if (!engine) throw new Error('no speech engine transcribes: the operator defines one (PRESMIUM_SPEECH_<ID>_URL and _PROVIDER)')
  const audio = (segment: { src: string }) => {
    const file = mediaFile(deckDir, id, segment.src)
    const bytes = file && readInDeck(deckDir, file)
    return file && bytes ? audioBlob(file, bytes) : undefined
  }
  const transcripts = await transcribeSegments(speech, stored.track.audio ?? [], audio, { engine: engine.id, lang: stored.track.lang }, signal)
  const { track, bound } = transcribedTrack(stored.track, transcripts)
  await writeTrack(files, deckDir, track)
  return { track, bound, provider: engine.provider }
}

export function clipKeys(tracks: Iterable<LectureTrack>): Set<string> {
  const keys = new Set<string>()
  for (const track of tracks) for (const u of track.utterances) if (u.clip) keys.add(u.clip.replace(/\.\w+$/, ''))
  return keys
}

export function pruneLock(deckDir: string, used: ReadonlySet<string>): number {
  const file = join(deckDir, '.presmium', 'speech.lock.json')
  const text = readRegular(file)?.toString('utf8')
  if (text === undefined) return 0
  let synthesis: Record<string, unknown>
  try {
    const lock: unknown = JSON.parse(text)
    if (!isRecord(lock) || !isRecord(lock.synthesis)) return 0
    synthesis = lock.synthesis
  } catch {
    return 0
  }
  const keys = Object.keys(synthesis).filter(key => used.has(key)).sort()
  const dropped = Object.keys(synthesis).length - keys.length
  if (dropped === 0) return 0
  const entries = keys.map(key => `    ${JSON.stringify(key)}: ${JSON.stringify(synthesis[key])}`)
  const temporary = `${file}.${process.pid}.${randomBytes(6).toString('hex')}.tmp`
  writeFileSync(temporary, `{\n  "version": 1,\n  "synthesis": {${entries.length ? `\n${entries.join(',\n')}\n  ` : ''}}\n}\n`, { flag: 'wx' })
  renameSync(temporary, file)
  return dropped
}
