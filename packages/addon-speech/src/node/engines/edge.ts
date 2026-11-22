import type { VoiceCatalog, VoiceInfo } from '@lincyaw/kernel'
import { BufferSource, BufferTarget, Conversion, Input, OggOutputFormat, Output, WEBM } from 'mediabunny'
import { MsEdgeTTS, OUTPUT_FORMAT } from 'msedge-tts'
import type { EngineDefinition } from '../../domain/index.ts'
import { SpeechError } from '../errors.ts'
import type { EngineAdapter, EngineSynthesisRequest, EngineSynthesisResult } from './types.ts'
import { speaks } from './types.ts'

// Microsoft Edge's read-aloud voices, straight from Node through msedge-tts: no account, no key, no local service.
// Edge answers Opus in WebM with word boundaries; mediabunny moves the same Opus packets into Ogg, the container the
// synthesis cache writes its AI-generated label into, so nothing is re-encoded and FFmpeg is not needed.

const FORMAT = OUTPUT_FORMAT.WEBM_24KHZ_16BIT_MONO_OPUS
const CONCURRENT = 3
const ATTEMPTS = 3

/** The names the Chinese voices go by. */
const CHINESE_NAMES: Record<string, string> = {
  Xiaoxiao: '晓晓', Xiaoyi: '晓伊', Yunjian: '云健', Yunxi: '云希', Yunxia: '云夏', Yunyang: '云扬', Xiaobei: '晓北', Xiaoni: '晓妮',
  HiuGaai: '曉佳', HiuMaan: '曉曼', WanLung: '雲龍', HsiaoChen: '曉臻', HsiaoYu: '曉雨', YunJhe: '雲哲',
}

interface EdgeVoice { ShortName: string, Gender?: string, Locale: string }

function voiceOf(voice: EdgeVoice): VoiceInfo {
  const own = voice.ShortName.slice(voice.Locale.length + 1).replace(/Neural$/, '')
  const multilingual = own.endsWith('Multilingual'), name = own.replace(/Multilingual$/, '')
  const gender = voice.Gender === 'Female' ? 'female' : voice.Gender === 'Male' ? 'male' : undefined
  return { id: voice.ShortName, label: `${CHINESE_NAMES[name] ?? name}${multilingual ? ' Multilingual' : ''}`, lang: [voice.Locale], ...gender ? { gender } : {} }
}

/** Edge reads SSML, so the narration's own markup characters are escaped. */
function escaped(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/** Edge's rate is a percentage: rate 1.2 is "+20%". */
function edgeRate(rate: number | undefined): string {
  return rate !== undefined && Number.isFinite(rate) && rate > 0 ? `${rate >= 1 ? '+' : ''}${Math.round((rate - 1) * 100)}%` : '+0%'
}

async function webmToOgg(webm: Uint8Array): Promise<Uint8Array> {
  const input = new Input({ source: new BufferSource(webm), formats: [WEBM] })
  try {
    const output = new Output({ format: new OggOutputFormat(), target: new BufferTarget() })
    const conversion = await Conversion.init({ input, output, copy: { mode: 'forced' }, video: { discard: true } })
    if (!conversion.isValid) throw new Error('the audio is not Opus')
    await conversion.execute()
    return new Uint8Array(output.target.buffer!)
  } finally { input.dispose() }
}

export function edgeEngine(engine: EngineDefinition): EngineAdapter {
  const what = `speech engine "${engine.id}" (${engine.provider})`
  let running = 0
  const queue: (() => void)[] = []
  const limited = async <T>(task: () => Promise<T>): Promise<T> => {
    if (running >= CONCURRENT) await new Promise<void>(resume => queue.push(resume))
    running++
    try { return await task() } finally { running--; queue.shift()?.() }
  }

  const once = async (request: EngineSynthesisRequest, signal?: AbortSignal): Promise<EngineSynthesisResult> => {
    const tts = new MsEdgeTTS()
    const stop = () => tts.close()
    signal?.addEventListener('abort', stop, { once: true })
    try {
      await tts.setMetadata(request.voice, FORMAT, { wordBoundaryEnabled: true })
      const { audioStream, metadataStream } = tts.toStream(escaped(request.text), { rate: edgeRate(request.rate) })
      const chunks: Uint8Array[] = [], words: { text: string, start: number, end: number }[] = []
      metadataStream?.on('data', (data: Buffer) => {
        for (const item of (JSON.parse(data.toString()) as { Metadata?: { Type: string, Data: { Offset: number, Duration: number, text: { Text: string } } }[] }).Metadata ?? []) {
          if (item.Type !== 'WordBoundary') continue
          const { Offset, Duration, text } = item.Data
          if (text.Text.trim()) words.push({ text: text.Text.trim(), start: Offset / 1e7, end: (Offset + Duration) / 1e7 })
        }
      })
      await new Promise<void>((done, fail) => {
        audioStream.on('data', (chunk: Uint8Array) => chunks.push(chunk))
        audioStream.on('end', done)
        audioStream.on('error', fail)
      })
      signal?.throwIfAborted()
      if (!chunks.length) throw new Error('no audio')
      return { audio: await webmToOgg(Buffer.concat(chunks)), words }
    } finally {
      signal?.removeEventListener('abort', stop)
      tts.close()
    }
  }

  let listed: Promise<VoiceInfo[]> | undefined
  const voiceList = (signal?: AbortSignal) => {
    listed ??= new MsEdgeTTS().getVoices().then(list => (list as EdgeVoice[]).map(voiceOf), error => {
      listed = undefined
      throw new SpeechError(502, `${what} gave no voice list: ${error instanceof Error ? error.message : String(error)}`)
    })
    signal?.throwIfAborted()
    return listed
  }

  return {
    async voiceCatalog(lang, signal): Promise<VoiceCatalog> {
      return { status: 'available', source: 'provider', voices: (await voiceList(signal)).filter(voice => speaks(voice, lang)) }
    },
    async voices(lang, signal) { return (await voiceList(signal)).filter(voice => speaks(voice, lang)) },

    synthesize(request, signal) {
      return limited(async () => {
        for (let attempt = 1; ; attempt++) {
          signal?.throwIfAborted()
          try {
            return await once(request, signal)
          } catch (error) {
            if (signal?.aborted) throw signal.reason
            if (attempt >= ATTEMPTS) throw new SpeechError(502, `${what} failed: ${error instanceof Error ? error.message : String(error)}`)
            await new Promise(wait => setTimeout(wait, 500 * attempt))
          }
        }
      })
    },

    async transcribe() {
      throw new SpeechError(400, `${what} only says text; it does not transcribe`)
    },
  }
}
