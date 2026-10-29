import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import type { SpeechWord, VoiceInfo } from '@lincyaw/kernel'
import { isCjk, isRecord, splitWords } from '@lincyaw/kernel'
import { bracketIPv6 } from '@lincyaw/kernel/node'
import { oneSegment } from '../domain/index.ts'
import { isWav, makeWav, wavChunks, wavDuration } from './audio/riff.ts'

const RATE = 8000
const CHUNK = 'pmfk'

function fakeWords(text: string): { words: SpeechWord[], duration: number } {
  const words: SpeechWord[] = []
  let ms = 0
  for (const { text: word } of splitWords(text)) {
    const length = isCjk(word) ? 220 : 60 * [...word].length
    if (words.length) ms += 80
    words.push({ text: word, start: ms / 1000, end: (ms + length) / 1000 })
    ms += length
  }
  return { words, duration: ms / 1000 }
}

export const FAKE_VOICES: VoiceInfo[] = [
  { id: 'alpha', label: '假音色甲 Alpha', lang: ['zh-CN', 'en-US'] },
  { id: 'beta', label: '假音色乙 Beta', lang: ['zh-CN', 'en-US'] },
  { id: 'cloned-lin', label: '林老师（克隆音色）', lang: ['zh-CN'], cloned: true },
]

export interface FakeContent {
  text: string
  voice: string
  lang: string
  words: SpeechWord[]
}

export function fakeAudio(text: string, voice: string, lang: string): { audio: Uint8Array, words: SpeechWord[], duration: number } {
  const { words, duration } = fakeWords(text)
  const samples = new Int16Array(Math.round(duration * RATE))
  for (const word of words) {
    const frequency = 220 + (word.text.codePointAt(0)! % 64) * 8
    for (let i = Math.round(word.start * RATE); i < Math.round(word.end * RATE); i++) samples[i] = Math.round(6000 * Math.sin((2 * Math.PI * frequency * i) / RATE))
  }
  const content: FakeContent = { text, voice, lang, words }
  return { audio: makeWav(samples, RATE, [{ id: CHUNK, data: new TextEncoder().encode(JSON.stringify(content)) }]), words, duration }
}

export function fakeContent(bytes: Uint8Array): FakeContent | undefined {
  if (!isWav(bytes)) return undefined
  const chunk = wavChunks(bytes).find(c => c.id === CHUNK)
  if (!chunk) return undefined
  try {
    return JSON.parse(new TextDecoder().decode(chunk.data)) as FakeContent
  } catch {
    return undefined
  }
}

export interface FakeEngine {
  url: string
  close(): Promise<void>
}

interface Logged {
  method: string
  path: string
  authorization: string | null
}

export async function startFakeEngine(options: { port?: number, listenAddress?: string } = {}): Promise<FakeEngine> {
  const requests: Logged[] = []
  // Voices trained through audio/voices/clone: training on the first status check, ready on the next.
  const trained = new Map<string, { label: string, checks: number }>()
  const voices = () => [...FAKE_VOICES, ...[...trained].filter(([, voice]) => voice.checks > 1).map(([id, voice]): VoiceInfo => ({ id, label: voice.label, lang: ['zh-CN'], cloned: true }))]
  const answer = (status: number, body: unknown, type = 'application/json; charset=utf-8') => new Response(body instanceof Uint8Array ? new Blob([new Uint8Array(body)]) : JSON.stringify(body), { status, headers: { 'Content-Type': type } })

  const route = async (request: Request, path: string): Promise<Response> => {
    if (path === '/v1/audio/voices' && request.method === 'GET') return answer(200, { voices: voices() })
    if (path === '/v1/audio/voices/clone' && request.method === 'POST') {
      const form = await request.formData().catch(() => undefined)
      const file = form?.get('file'), voice = form?.get('voice')
      if (!(file instanceof Blob) || typeof voice !== 'string' || !voice) return answer(400, { error: { message: 'multipart form data with `file` and `voice` expected' } })
      if (file.size < 1000) return answer(400, { error: { message: 'the sample is too short to train from' } })
      trained.set(voice, { label: `${voice}（克隆音色）`, checks: 0 })
      return answer(200, { voice, state: 'training', trainingsLeft: 9 })
    }
    if (path === '/v1/audio/voices/clone' && request.method === 'GET') {
      const voice = new URL(request.url).searchParams.get('voice') ?? ''
      const found = trained.get(voice)
      if (!found) return answer(200, { voice, state: 'unknown' })
      found.checks++
      return answer(200, { voice, state: found.checks > 1 ? 'ready' : 'training', trainingsLeft: 9 })
    }
    if ((path === '/v1/audio/speech' || path === '/v1/audio/speech/timestamps') && request.method === 'POST') {
      const body: unknown = await request.json().catch(() => undefined)
      if (!isRecord(body) || typeof body.input !== 'string' || typeof body.voice !== 'string') return answer(400, { error: { message: '{ model, voice, input } expected' } })
      if (!voices().some(voice => voice.id === body.voice)) return answer(400, { error: { message: `no voice "${body.voice}"; the fake engine has ${voices().map(v => v.id).join(', ')}` } })
      const { audio, words, duration } = fakeAudio(body.input, body.voice, typeof body.language === 'string' ? body.language : 'zh-CN')
      if (path === '/v1/audio/speech') return answer(200, audio, 'audio/wav')
      return answer(200, { audio: Buffer.from(audio).toString('base64'), format: 'wav', duration, words })
    }
    if (path === '/v1/audio/transcriptions' && request.method === 'POST') {
      const form = await request.formData().catch(() => undefined)
      const file = form?.get('file')
      if (!(file instanceof Blob)) return answer(400, { error: { message: 'multipart form data with `file` expected' } })
      const bytes = new Uint8Array(await file.arrayBuffer())
      const content = fakeContent(bytes)
      const language = typeof form?.get('language') === 'string' ? form.get('language') as string : undefined
      const duration = isWav(bytes) ? wavDuration(bytes) : 0
      const transcript = oneSegment(content?.text ?? '', content?.words ?? [], language ?? content?.lang ?? 'zh-CN', duration)
      return answer(200, { ...transcript, language: transcript.lang, words: content?.words ?? [] })
    }
    if (path === '/v1/models' && request.method === 'GET') return answer(200, { object: 'list', data: [{ id: 'fake-tts', object: 'model' }, { id: 'fake-stt', object: 'model' }] })
    return answer(404, { error: { message: `no route ${request.method} ${path}` } })
  }

  const server = createServer((req, res) => {
    const chunks: Buffer[] = []
    req.on('data', (chunk: Buffer) => chunks.push(chunk))
    req.on('end', () => {
      const path = (req.url ?? '/').split('?')[0]!
      const send = (response: Response) => response.arrayBuffer().then((body) => {
        res.writeHead(response.status, Object.fromEntries(response.headers))
        res.end(Buffer.from(body))
      })
      if (path === '/requests' && req.method === 'GET') {
        void send(answer(200, { requests }))
        return
      }
      requests.push({ method: req.method ?? 'GET', path, authorization: req.headers.authorization ?? null })
      const headers = new Headers()
      for (const [name, value] of Object.entries(req.headers)) if (typeof value === 'string') headers.set(name, value)
      const method = req.method ?? 'GET'
      const request = new Request(`http://fake${req.url ?? '/'}`, { method, headers, ...method === 'GET' || method === 'HEAD' ? {} : { body: Buffer.concat(chunks) } })
      void route(request, path).catch((error: unknown) => answer(500, { error: { message: String(error) } })).then(send)
    })
  })
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(options.port ?? 0, options.listenAddress ?? '127.0.0.1', () => resolve())
  })
  const { port } = server.address() as AddressInfo
  const host = options.listenAddress && options.listenAddress !== '0.0.0.0' ? options.listenAddress : '127.0.0.1'
  return {
    url: `http://${bracketIPv6(host)}:${port}/v1`,
    close: () => new Promise((resolve) => {
      server.close(() => resolve())
      server.closeAllConnections()
    }),
  }
}
