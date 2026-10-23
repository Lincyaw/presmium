import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { run } from '@lincyaw/cli/testing'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { opusComments } from '../src/node/audio/ogg.ts'
import { infoEntries } from '../src/node/audio/riff.ts'
import type { Child, Fake } from './helpers.ts'
import { cleanEnv, dev, front, listener, oggPackets, PACKAGE, post, PROBE, probeUrl, remove, speechUrl, startFake, temporary, testDeck, wavInfo } from './helpers.ts'

const KEY = 'fake-engine-key-only-the-operator-holds'
const SENTENCE = '我们先看这三行 BPE 合并。'

interface Timed {
  audio: string
  mime: string
  key: string
  words: { text: string, start: number, end: number }[]
  duration: number
  provider: string
}

let fake: Fake

beforeAll(async () => {
  fake = await startFake()
}, 60_000)

afterAll(async () => {
  await fake?.stop()
})

describe('presmium dev with the fake engine defined', () => {
  let dir: string
  let operator: string
  let other: Awaited<ReturnType<typeof listener>>
  let server: string
  let devProcess: Child

  beforeAll(async () => {
    dir = testDeck('speech', 'presmium:\n  presmium.speech: { engine: fake }', [PROBE])
    operator = temporary('speech-operator')
    other = await listener()
    ;({ dev: devProcess, server } = await dev(dir, {
      PRESMIUM_SPEECH_FAKE_URL: fake.url,
      PRESMIUM_SPEECH_FAKE_PROVIDER: 'Presmium fake',
      PRESMIUM_SPEECH_FAKE_KEY: KEY,
      PRESMIUM_SPEECH_OTHER_URL: other.url,
      PRESMIUM_SPEECH_OTHER_KEY: 'other-key',
      PRESMIUM_OPERATOR_DIR: operator,
    }))
  }, 240_000)

  afterAll(async () => {
    await devProcess?.stop()
    await other?.close()
    remove(dir, operator)
  })

  it('synthesizes into the cache, answers a repeat from it without asking the engine, and transcribes the audio back with its words', async () => {
    const before = (await fake.requests()).length
    const first = await post(speechUrl(server, 'v1/audio/speech/timestamps'), { voice: 'alpha', input: SENTENCE, lang: 'zh-CN' })
    expect(first.status, first.text).toBe(200)
    const a = first.json<Timed>()
    expect(a).toMatchObject({ mime: 'audio/wav', provider: 'Presmium fake' })
    expect(a.words.map(w => w.text)).toEqual(['我', '们', '先', '看', '这', '三', '行', 'BPE', '合', '并'])
    expect(a.words[0]).toEqual({ text: '我', start: 0, end: 0.22 })

    const cache = join(dir, '.presmium/speech')
    const audio = readFileSync(join(cache, `${a.key}.wav`))
    expect(JSON.parse(readFileSync(join(cache, `${a.key}.json`), 'utf8'))).toMatchObject({ key: a.key, voice: 'alpha', engine: 'fake', words: a.words, text: SENTENCE })
    const lock = JSON.parse(readFileSync(join(dir, '.presmium/speech.lock.json'), 'utf8'))
    expect(lock.synthesis[a.key]).toEqual({ audio: `${a.key}.wav`, sha256: createHash('sha256').update(audio).digest('hex') })
    const asked = (await fake.requests()).slice(before)
    expect(asked.map(r => `${r.method} ${r.path}`)).toEqual(['GET /v1/audio/voices', 'POST /v1/audio/speech/timestamps'])
    expect(asked.every(r => r.authorization === `Bearer ${KEY}`)).toBe(true)

    const again = await post(speechUrl(server, 'v1/audio/speech/timestamps'), { voice: 'alpha', input: SENTENCE, lang: 'zh-CN' })
    expect(again.json<Timed>().key).toBe(a.key)
    expect((await fake.requests()).length).toBe(before + 2)

    const beta = await post(speechUrl(server, 'v1/audio/speech/timestamps'), { voice: 'beta', input: SENTENCE, lang: 'zh-CN' })
    const b = beta.json<Timed>()
    expect(b.key).not.toBe(a.key)
    expect(existsSync(join(cache, `${b.key}.wav`))).toBe(true)
    expect(readFileSync(join(cache, `${b.key}.wav`)).equals(audio)).toBe(false)
    expect((await fake.requests()).slice(before + 2).map(r => r.path)).toEqual(['/v1/audio/speech/timestamps'])

    const form = new FormData()
    form.set('file', new Blob([audio], { type: 'audio/wav' }), 'clip.wav')
    form.set('language', 'zh-CN')
    const transcribed = await fetch(speechUrl(server, 'v1/audio/transcriptions'), { method: 'POST', body: form })
    const transcript = await transcribed.json() as { text: string, segments: { text: string, words: Timed['words'] }[] }
    expect(transcribed.status).toBe(200)
    expect(transcript.text).toBe(SENTENCE)
    expect(transcript.segments).toHaveLength(1)
    expect(transcript.segments[0]!.words).toEqual(a.words)

    for (const text of [first.text, again.text, beta.text, JSON.stringify(transcript), devProcess.output()]) expect(text).not.toContain(KEY)
  }, 120_000)

  it('never reads a file outside the cache through an edited record or a linked clip: the clip is synthesized again', async () => {
    const outside = join(dir, '..', `speech-outside-${process.pid}.txt`)
    writeFileSync(outside, 'NOT-A-CLIP-OUTSIDE-THE-DECK')
    try {
      const input = '只看缓存里的文件。'
      const first = (await post(speechUrl(server, 'v1/audio/speech/timestamps'), { voice: 'alpha', input, lang: 'zh-CN' })).json<Timed>()
      const cache = join(dir, '.presmium/speech')
      const recordFile = join(cache, `${first.key}.json`)
      const record = JSON.parse(readFileSync(recordFile, 'utf8')) as { audio: string }

      writeFileSync(recordFile, JSON.stringify({ ...record, audio: `../../../${outside.split('/').pop()}` }))
      const before = (await fake.requests()).length
      const traversed = await post(speechUrl(server, 'v1/audio/speech/timestamps'), { voice: 'alpha', input, lang: 'zh-CN' })
      expect(traversed.status, traversed.text).toBe(200)
      expect(Buffer.from(traversed.json<Timed>().audio, 'base64').toString('latin1')).not.toContain('NOT-A-CLIP')
      expect((await fake.requests()).length).toBeGreaterThan(before)

      const clip = join(cache, `${first.key}.wav`)
      rmSync(clip)
      symlinkSync(outside, clip)
      const linked = await post(speechUrl(server, 'v1/audio/speech/timestamps'), { voice: 'alpha', input, lang: 'zh-CN' })
      expect(linked.status, linked.text).toBe(200)
      expect(Buffer.from(linked.json<Timed>().audio, 'base64').toString('latin1')).not.toContain('NOT-A-CLIP')
    } finally {
      rmSync(outside, { force: true })
    }
  }, 120_000)

  it('lists the engines with their providers; one without a provider is unavailable, naming the variable, and gets no request', async () => {
    const listed = await (await fetch(speechUrl(server, 'v1/engines'))).json() as { engines: { id: string, provider: string }[], unavailable: { id: string, reason: string }[] }
    expect(listed.engines).toEqual([expect.objectContaining({ id: 'fake', provider: 'Presmium fake', tts: true, stt: true, wordTimes: true })])
    expect(listed.unavailable).toEqual([{ id: 'other', reason: expect.stringContaining('PRESMIUM_SPEECH_OTHER_PROVIDER is not set') }])
    expect(devProcess.output()).toMatch(/speech engine other is unavailable: PRESMIUM_SPEECH_OTHER_PROVIDER is not set/)
    const refused = await post(speechUrl(server, 'v1/audio/speech/timestamps'), { engine: 'other', voice: 'alpha', input: SENTENCE })
    expect(refused.status).toBe(400)
    expect(refused.json().error).toContain('PRESMIUM_SPEECH_OTHER_PROVIDER is not set')
    expect(other.received).toEqual([])
  }, 60_000)

  it('labels the cached audio and its record as AI-generated with the GB 45438 fields, keeping what the fake engine embedded', async () => {
    const { key } = (await post(speechUrl(server, 'v1/audio/speech/timestamps'), { voice: 'alpha', input: '标识测试。', lang: 'zh-CN' })).json<Timed>()
    const bytes = readFileSync(join(dir, '.presmium/speech', `${key}.wav`))
    const { info, chunks } = wavInfo(bytes)
    const label = { Label: '1', ContentProducer: 'Presmium fake', ProduceID: key, ReservedCode1: '', ContentPropagator: '', PropagateID: '', ReservedCode2: '' }
    expect(JSON.parse(info.AIGC!)).toEqual(label)
    expect(info.ICMT).toBe(`AIGC=${JSON.stringify(label)}`)
    expect(infoEntries(bytes)).toEqual(info)
    expect(JSON.parse(readFileSync(join(dir, '.presmium/speech', `${key}.json`), 'utf8'))).toMatchObject({ synthetic: true, AIGC: label })
    expect(JSON.parse(chunks.pmfk!.toString('utf8'))).toMatchObject({ text: '标识测试。', voice: 'alpha' })
    const form = new FormData()
    form.set('file', new Blob([readFileSync(join(dir, '.presmium/speech', `${key}.wav`))], { type: 'audio/wav' }), 'clip.wav')
    expect((await (await fetch(speechUrl(server, 'v1/audio/transcriptions'), { method: 'POST', body: form })).json() as { text: string }).text).toBe('标识测试。')
  }, 60_000)

  it('sends the lexicon\'s spoken form to the engine and gives the words of the written text', async () => {
    const timed = (await post(speechUrl(server, 'v1/audio/speech/timestamps'), { voice: 'alpha', input: SENTENCE, lang: 'zh-CN', lexicon: { BPE: 'B P E' } })).json<Timed>()
    const form = new FormData()
    form.set('file', new Blob([Buffer.from(timed.audio, 'base64')], { type: 'audio/wav' }), 'clip.wav')
    expect((await (await fetch(speechUrl(server, 'v1/audio/transcriptions'), { method: 'POST', body: form })).json() as { text: string }).text).toBe('我们先看这三行 B P E 合并。')
    expect(timed.words.map(w => w.text)).toEqual(['我', '们', '先', '看', '这', '三', '行', 'BPE', '合', '并'])
    expect(timed.words.slice(7, 9)).toEqual([{ text: 'BPE', start: 2.1, end: 2.44 }, { text: '合', start: 2.52, end: 2.74 }])
    const end = (await post(speechUrl(server, 'v1/audio/speech/timestamps'), { voice: 'alpha', input: '我们用 BPE', lang: 'zh-CN', lexicon: { BPE: 'B P E' } })).json<Timed>()
    expect(end.words).toEqual([{ text: '我', start: 0, end: 0.22 }, { text: '们', start: 0.3, end: 0.52 }, { text: '用', start: 0.6, end: 0.82 }, { text: 'BPE', start: 0.9, end: 1.24 }])
  }, 60_000)

  it('gives the Node SPEECH the deck\'s cache too: its clip is the file in the cache, a hit for the routes, and transcribes back', async () => {
    const engines = await (await fetch(probeUrl(server, 'engines'))).json()
    expect(engines).toEqual([{ id: 'fake', provider: 'Presmium fake', stt: true, tts: true, wordTimes: true, local: true }])
    const request = { voice: 'beta', text: '节点端的语音服务。', lang: 'zh-CN' }
    const synthesized = await post(probeUrl(server, 'synthesize'), request)
    expect(synthesized.status, synthesized.text).toBe(200)
    const { key, audio } = synthesized.json<{ key: string, audio: string }>()
    expect(synthesized.json()).toMatchObject({ mime: 'audio/wav', engine: 'fake', voice: 'beta', synthetic: true })
    expect(audio).toBe(join(dir, '.presmium/speech', `${key}.wav`))
    expect(JSON.parse(readFileSync(join(dir, '.presmium/speech.lock.json'), 'utf8')).synthesis[key]).toBeDefined()

    const before = (await fake.requests()).length
    expect((await post(probeUrl(server, 'synthesize'), request)).json<{ key: string }>().key).toBe(key)
    expect((await post(speechUrl(server, 'v1/audio/speech/timestamps'), { voice: 'beta', input: request.text, lang: 'zh-CN' })).json<Timed>().key).toBe(key)
    expect((await fake.requests()).length).toBe(before)

    const transcribed = await post(probeUrl(server, 'transcribe'), { audio, lang: 'zh-CN' })
    expect(transcribed.status, transcribed.text).toBe(200)
    expect(transcribed.json<{ text: string }>().text).toBe(request.text)
  }, 60_000)
})

describe('cloned voices', () => {
  let dir: string
  let operator: string
  const record = { speaker: '林老师', scope: '课程讲授的合成', date: '2026-10-01', statementSha256: 'a'.repeat(64) }
  const env = () => ({ PRESMIUM_SPEECH_FAKE_URL: fake.url, PRESMIUM_SPEECH_FAKE_PROVIDER: 'Presmium fake', PRESMIUM_OPERATOR_DIR: operator })
  const clone = (server: string) => post(speechUrl(server, 'v1/audio/speech/timestamps'), { voice: 'cloned-lin', input: '克隆音色。', lang: 'zh-CN' })

  beforeAll(() => {
    dir = testDeck('speech-clone', 'presmium:\n  presmium.speech: { engine: fake }')
    operator = temporary('speech-operator')
  })

  afterAll(() => remove(dir, operator))

  it('refuses a cloned voice when the engine\'s voice list fails, and asks for the list again on the next synthesis', async () => {
    const proxy = await front(fake)
    proxy.failVoices = 1
    const started = await dev(dir, { ...env(), PRESMIUM_SPEECH_FAKE_URL: proxy.url })
    const before = (await fake.requests()).length
    try {
      const failed = await clone(started.server)
      expect(failed.status).toBe(502)
      expect(failed.json().error).toContain('the voices of speech engine "fake" are not known, so a cloned voice cannot be told')
      const refused = await clone(started.server)
      expect(refused.status).toBe(403)
      expect(refused.json().error).toContain('settings.presmium.speech.cloned: true')
      expect(proxy.voiceRequests).toBe(2)
    } finally {
      await started.dev.stop()
      await proxy.close()
    }
    expect((await fake.requests()).slice(before).map(r => `${r.method} ${r.path}`)).toEqual(['GET /v1/audio/voices'])
  }, 240_000)

  it('refuses a cloned voice until the operator allows them and the owner registers the consent record outside the workspace', async () => {
    let started = await dev(dir, env())
    try {
      const refused = await clone(started.server)
      expect(refused.status).toBe(403)
      expect(refused.json().error).toContain('settings.presmium.speech.cloned: true')
    } finally {
      await started.dev.stop()
    }

    writeFileSync(join(dir, 'presmium.workspace.yaml'), 'settings:\n  presmium.speech:\n    cloned: true\n')
    mkdirSync(join(dir, '.presmium/speech/consent/fake'), { recursive: true })
    writeFileSync(join(dir, '.presmium/speech/consent/fake/cloned-lin.json'), JSON.stringify(record))
    started = await dev(dir, env())
    try {
      const missing = await clone(started.server)
      expect(missing.status).toBe(403)
      expect(missing.json().error).toContain(`${join(operator, 'consent/fake/cloned-lin.json')} is missing`)

      const registered = await post(speechUrl(started.server, 'consent/fake/cloned-lin'), record)
      expect(registered.status, registered.text).toBe(200)
      expect(JSON.parse(readFileSync(join(operator, 'consent/fake/cloned-lin.json'), 'utf8'))).toEqual(record)
      const allowed = await clone(started.server)
      expect(allowed.status, allowed.text).toBe(200)
      expect(allowed.json()).toMatchObject({ voice: 'cloned-lin', synthetic: true })

      const before = (await fake.requests()).length
      rmSync(join(operator, 'consent/fake/cloned-lin.json'))
      const withdrawn = await clone(started.server)
      expect(withdrawn.status).toBe(403)
      expect(withdrawn.json().error).toContain(`${join(operator, 'consent/fake/cloned-lin.json')} is missing`)
      const cache = join(dir, '.presmium/speech')
      for (const name of readdirSync(cache).filter(file => file.endsWith('.json'))) {
        const cached = JSON.parse(readFileSync(join(cache, name), 'utf8')) as Record<string, unknown>
        if (cached.voice === 'cloned-lin') writeFileSync(join(cache, name), JSON.stringify({ ...cached, cloned: false }))
      }
      const edited = await clone(started.server)
      expect(edited.status).toBe(403)
      expect(edited.json().error).toContain(`${join(operator, 'consent/fake/cloned-lin.json')} is missing`)
      expect((await fake.requests()).length).toBe(before)
    } finally {
      await started.dev.stop()
    }
    started = await dev(dir, env())
    try {
      const before = (await fake.requests()).length
      const fresh = await clone(started.server)
      expect(fresh.status).toBe(403)
      expect(fresh.json().error).toContain(`${join(operator, 'consent/fake/cloned-lin.json')} is missing`)
      expect((await fake.requests()).slice(before).map(r => `${r.method} ${r.path}`)).toEqual(['GET /v1/audio/voices'])
    } finally {
      await started.dev.stop()
    }
  }, 300_000)
})

describe('an engine that answers Ogg/Opus', () => {
  const tone = readFileSync(join(PACKAGE, 'test/fixtures/tone.ogg'))
  let engine: { url: string, close(): Promise<void> }
  let dir: string
  let started: Awaited<ReturnType<typeof dev>> | undefined

  beforeAll(async () => {
    const server = createServer((req, res) => {
      req.resume()
      req.on('end', () => {
        const path = (req.url ?? '').split('?')[0]
        res.writeHead(path === '/v1/audio/voices' || path === '/v1/audio/speech/timestamps' ? 200 : 404, { 'Content-Type': 'application/json' })
        if (path === '/v1/audio/voices') res.end(JSON.stringify({ voices: [{ id: 'v1', label: 'V1', lang: ['zh-CN'] }] }))
        else if (path === '/v1/audio/speech/timestamps') res.end(JSON.stringify({ audio: tone.toString('base64'), format: 'opus', duration: 2, words: [{ word: '标', start: 0, end: 0.5 }, { word: '识', start: 0.6, end: 1 }] }))
        else res.end('{}')
      })
    })
    await new Promise<void>(done => server.listen(0, '127.0.0.1', done))
    engine = {
      url: `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1`,
      close: () => new Promise((done) => {
        server.close(() => done())
        server.closeAllConnections()
      }),
    }
    dir = testDeck('speech-ogg', 'presmium:\n  presmium.speech: { engine: oggy }')
    started = await dev(dir, { PRESMIUM_SPEECH_OGGY_URL: engine.url, PRESMIUM_SPEECH_OGGY_PROVIDER: 'Ogg Test' })
  }, 240_000)

  afterAll(async () => {
    await started?.dev.stop()
    await engine?.close()
    remove(dir)
  })

  it('labels the clip in its comment header and keeps its audio: every page checks, the packets are the engine\'s', async () => {
    const synthesized = await post(speechUrl(started!.server, 'v1/audio/speech/timestamps'), { voice: 'v1', input: '标识。', lang: 'zh-CN' })
    expect(synthesized.status, synthesized.text).toBe(200)
    const { key, mime } = synthesized.json<Timed>()
    expect(mime).toBe('audio/ogg')
    const clip = readFileSync(join(dir, '.presmium/speech', `${key}.ogg`))
    const label = { Label: '1', ContentProducer: 'Ogg Test', ProduceID: key, ReservedCode1: '', ContentPropagator: '', PropagateID: '', ReservedCode2: '' }
    expect(opusComments(clip)).toEqual([...opusComments(tone), `AIGC=${JSON.stringify(label)}`])
    const [head, , ...audio] = oggPackets(clip)
    const [engineHead, , ...engineAudio] = oggPackets(tone)
    expect(head!.equals(engineHead!)).toBe(true)
    expect(audio.length).toBe(engineAudio.length)
    expect(audio.every((packet, i) => packet.equals(engineAudio[i]!))).toBe(true)
    const ffmpeg = spawnSync('ffmpeg', ['-v', 'error', '-i', join(dir, '.presmium/speech', `${key}.ogg`), '-f', 'null', '-'], { encoding: 'utf8' })
    if (!ffmpeg.error) expect([ffmpeg.status, ffmpeg.stderr]).toEqual([0, ''])
  }, 60_000)
})

describe('presmium-speech consent', () => {
  const SPEECH_BIN = fileURLToPath(new URL('../bin/presmium-speech.mjs', import.meta.url))
  let dir: string
  let operator: string

  beforeAll(() => {
    dir = temporary('speech-consent')
    operator = temporary('speech-consent-operator')
  })

  afterAll(() => remove(dir, operator))

  it('registers a consent record in the operator directory, and refuses one whose statement digest is no sha256', async () => {
    const record = { speaker: '林老师', scope: '课程讲授的合成', date: '2026-10-01', statementSha256: 'c'.repeat(64) }
    writeFileSync(join(dir, 'good.json'), JSON.stringify(record))
    writeFileSync(join(dir, 'bad.json'), JSON.stringify({ ...record, statementSha256: 'not-a-digest' }))
    const consent = (file: string) => run(process.execPath, [SPEECH_BIN, 'consent', 'fake', 'cloned-lin', file, '--operator-dir', operator], { cwd: dir, env: cleanEnv() })
    const file = join(operator, 'consent/fake/cloned-lin.json')

    const refused = await consent('bad.json')
    expect(refused.code).toBe(2)
    expect(refused.stderr).toContain('statementSha256 is not a sha256 in hex')
    expect(existsSync(file)).toBe(false)

    const registered = await consent('good.json')
    expect(registered.code, registered.stderr).toBe(0)
    expect(registered.stdout).toBe(`consent  ${file}\n`)
    expect(JSON.parse(readFileSync(file, 'utf8'))).toEqual(record)
  }, 60_000)
})

describe('no engine defined', () => {
  let dir: string

  beforeAll(() => {
    dir = testDeck('speech-none', '')
  })

  afterAll(() => remove(dir))

  it('lists no engine and sends no request', async () => {
    const before = (await fake.requests()).length
    const { dev: started, server } = await dev(dir, {})
    try {
      expect((await (await fetch(speechUrl(server, 'v1/engines'))).json() as { engines: unknown[] }).engines).toEqual([])
      const refused = await post(speechUrl(server, 'v1/audio/speech/timestamps'), { voice: 'alpha', input: SENTENCE })
      expect(refused.status).toBe(400)
      expect(refused.json().error).toContain('no speech engine is defined')
    } finally {
      await started.stop()
    }
    expect((await fake.requests()).length).toBe(before)
  }, 240_000)
})

describe('engines that do one thing', () => {
  let dir: string

  beforeAll(() => {
    // The deck's default engine only synthesizes: transcription without an engine named goes to the one that transcribes.
    dir = testDeck('speech-uses', 'presmium:\n  presmium.speech: { engine: say }')
  })

  afterAll(() => remove(dir))

  it('reports what each engine does; synthesis takes the deck\'s default engine and transcription the engine that transcribes; naming one for what it cannot do is refused', async () => {
    const { dev: started, server } = await dev(dir, {
      PRESMIUM_SPEECH_SAY_URL: fake.url,
      PRESMIUM_SPEECH_SAY_PROVIDER: 'Says only',
      PRESMIUM_SPEECH_SAY_KEY: 'say-key',
      PRESMIUM_SPEECH_SAY_TRANSCRIBE_MODEL: 'none',
      PRESMIUM_SPEECH_HEAR_URL: fake.url,
      PRESMIUM_SPEECH_HEAR_PROVIDER: 'Hears only',
      PRESMIUM_SPEECH_HEAR_KEY: 'hear-key',
      PRESMIUM_SPEECH_HEAR_MODEL: 'none',
    })
    try {
      const listed = await (await fetch(speechUrl(server, 'v1/engines'))).json() as { engines: { id: string, tts: boolean, stt: boolean }[] }
      expect(listed.engines.map(({ id, tts, stt }) => ({ id, tts, stt }))).toEqual([{ id: 'hear', tts: false, stt: true }, { id: 'say', tts: true, stt: false }])

      const before = (await fake.requests()).length
      const said = await post(speechUrl(server, 'v1/audio/speech/timestamps'), { voice: 'alpha', input: SENTENCE, lang: 'zh-CN' })
      expect(said.status, said.text).toBe(200)
      expect(said.json<Timed>().provider).toBe('Says only')
      const form = new FormData()
      form.set('file', new Blob([Buffer.from(said.json<Timed>().audio, 'base64')], { type: 'audio/wav' }), 'clip.wav')
      form.set('language', 'zh-CN')
      const heard = await fetch(speechUrl(server, 'v1/audio/transcriptions'), { method: 'POST', body: form })
      expect(heard.status).toBe(200)
      const asked = (await fake.requests()).slice(before).filter(r => r.method === 'POST')
      expect(asked.map(r => `${r.path} ${r.authorization}`)).toEqual(['/v1/audio/speech/timestamps Bearer say-key', '/v1/audio/transcriptions Bearer hear-key'])

      form.set('engine', 'say')
      const refused = await fetch(speechUrl(server, 'v1/audio/transcriptions'), { method: 'POST', body: form })
      expect(refused.status).toBe(400)
      expect(((await refused.json()) as { error: string }).error).toContain('speech engine "say" does not transcribe: PRESMIUM_SPEECH_SAY_TRANSCRIBE_MODEL is none')
    } finally {
      await started.stop()
    }
  }, 240_000)
})
