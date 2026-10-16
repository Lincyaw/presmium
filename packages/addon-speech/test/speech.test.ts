// Speech with the deterministic fake engine (WP-82, P-132, P-133, N-08), through the speech gateway's routes
// of `presmium dev` (`/__presmium/presmium.speech/v1/…`, the path the browser's SPEECH uses), which call the
// engines of dev's environment and keep the deck's synthesis cache. The fake engine is a process of its own,
// defined like any engine (PRESMIUM_SPEECH_FAKE_URL, _PROVIDER, _KEY); it lists the requests it got.
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Child, Fake } from './helpers.ts'
import { dev, listener, post, remove, speechUrl, startFake, temporary, testDeck, wavInfo } from './helpers.ts'

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
    dir = testDeck('speech', 'presmium:\n  presmium.speech: { engine: fake }')
    operator = temporary('speech-operator')
    // `other` has an address and a key but no provider: unavailable.
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

    // The cache holds the audio and its words, and the lock lists the key with the audio's sha256.
    const cache = join(dir, '.presmium/speech')
    const audio = readFileSync(join(cache, `${a.key}.wav`))
    expect(JSON.parse(readFileSync(join(cache, `${a.key}.json`), 'utf8'))).toMatchObject({ key: a.key, voice: 'alpha', engine: 'fake', words: a.words, text: SENTENCE })
    const lock = JSON.parse(readFileSync(join(dir, '.presmium/speech.lock.json'), 'utf8'))
    expect(lock.synthesis[a.key]).toEqual({ audio: `${a.key}.wav`, sha256: createHash('sha256').update(audio).digest('hex') })
    const asked = (await fake.requests()).slice(before)
    expect(asked.map(r => `${r.method} ${r.path}`)).toEqual(['GET /v1/audio/voices', 'POST /v1/audio/speech/timestamps'])
    // The key went to the engine's address only, and to nothing else.
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

    // Neither the answers nor dev's output carry the engine's key.
    for (const text of [first.text, again.text, beta.text, JSON.stringify(transcript), devProcess.output()]) expect(text).not.toContain(KEY)
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
    const { info, chunks } = wavInfo(readFileSync(join(dir, '.presmium/speech', `${key}.wav`)))
    const label = { Label: '1', ContentProducer: 'Presmium fake', ProduceID: key, ReservedCode1: '', ContentPropagator: '', PropagateID: '', ReservedCode2: '' }
    expect(JSON.parse(info.AIGC!)).toEqual(label)
    expect(info.ICMT).toBe(`AIGC=${JSON.stringify(label)}`)
    expect(JSON.parse(readFileSync(join(dir, '.presmium/speech', `${key}.json`), 'utf8'))).toMatchObject({ synthetic: true, AIGC: label })
    // The fake engine's chunk is untouched: its text and voice are still there, and transcription gives the text back.
    expect(JSON.parse(chunks.pmfk!.toString('utf8'))).toMatchObject({ text: '标识测试。', voice: 'alpha' })
    const form = new FormData()
    form.set('file', new Blob([readFileSync(join(dir, '.presmium/speech', `${key}.wav`))], { type: 'audio/wav' }), 'clip.wav')
    expect((await (await fetch(speechUrl(server, 'v1/audio/transcriptions'), { method: 'POST', body: form })).json() as { text: string }).text).toBe('标识测试。')
  }, 60_000)
})

describe('cloned voices in LOCAL mode', () => {
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

  it('refuses a cloned voice until the operator allows them and the owner registers the consent record outside the workspace', async () => {
    let started = await dev(dir, env())
    try {
      const refused = await clone(started.server)
      expect(refused.status).toBe(403)
      expect(refused.json().error).toContain('settings.presmium.speech.cloned: true')
    } finally {
      await started.dev.stop()
    }

    // The operator allows cloned voices (read when the process starts); a record in the deck does not count.
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
    } finally {
      await started.dev.stop()
    }
  }, 300_000)
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
