// Smoke cases of the real engines (WP-82), through the speech gateway's routes of `presmium dev`: they run
// only with the test credentials in the environment, and say how to enable them otherwise.
// - Volcengine (火山引擎): PRESMIUM_TEST_VOLCENGINE_KEY (and PRESMIUM_TEST_VOLCENGINE_APPID for a key of the
//   old console): synthesis of a sentence that mixes Chinese and English, with times per character and the
//   label in the Ogg/Opus comment header, then its transcription.
// - Groq: PRESMIUM_TEST_GROQ_KEY: transcription (whisper-large-v3-turbo) of the fake engine's audio.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Child, Fake } from './helpers.ts'
import { dev, post, remove, speechUrl, startFake, testDeck } from './helpers.ts'

const VOLCENGINE_KEY = process.env.PRESMIUM_TEST_VOLCENGINE_KEY
const VOLCENGINE_APPID = process.env.PRESMIUM_TEST_VOLCENGINE_APPID
const GROQ_KEY = process.env.PRESMIUM_TEST_GROQ_KEY

if (!VOLCENGINE_KEY) console.warn('engines.test.ts: Volcengine skipped: set PRESMIUM_TEST_VOLCENGINE_KEY (and PRESMIUM_TEST_VOLCENGINE_APPID for a key of the old console) to run it; it synthesizes about 40 characters')
if (!GROQ_KEY) console.warn('engines.test.ts: Groq skipped: set PRESMIUM_TEST_GROQ_KEY (a key of console.groq.com, free tier) to run it')

async function transcribe(server: string, audio: Buffer, mime: string, engine: string): Promise<{ status: number, body: { text: string, duration: number, segments: { words: unknown[] }[] } }> {
  const form = new FormData()
  form.set('file', new Blob([new Uint8Array(audio)], { type: mime }), mime.includes('ogg') ? 'clip.ogg' : 'clip.wav')
  form.set('engine', engine)
  form.set('language', 'zh-CN')
  form.append('hints[]', 'BPE')
  const response = await fetch(speechUrl(server, 'v1/audio/transcriptions'), { method: 'POST', body: form })
  return { status: response.status, body: await response.json() as never }
}

describe.skipIf(!VOLCENGINE_KEY)('Volcengine', () => {
  let dir: string
  let started: Child
  let server: string

  beforeAll(async () => {
    dir = testDeck('speech-volcengine', 'presmium:\n  presmium.speech: { engine: volcengine }')
    ;({ dev: started, server } = await dev(dir, { PRESMIUM_SPEECH_VOLCENGINE_KEY: VOLCENGINE_KEY!, ...VOLCENGINE_APPID ? { PRESMIUM_SPEECH_VOLCENGINE_APPID: VOLCENGINE_APPID } : {} }))
  }, 240_000)

  afterAll(async () => {
    await started?.stop()
    remove(dir)
  })

  it('synthesizes mixed Chinese and English with times per character, labels the Ogg/Opus, and transcribes it back', async () => {
    const text = '我们先看 BPE 的合并规则，再运行 Python 代码。'
    const synthesized = await post(speechUrl(server, 'v1/audio/speech/timestamps'), { voice: 'zh_female_vv_uranus_bigtts', input: text, lang: 'zh-CN' })
    expect(synthesized.status, synthesized.text).toBe(200)
    const timed = synthesized.json<{ key: string, mime: string, provider: string, words: { text: string }[] }>()
    expect(timed).toMatchObject({ mime: 'audio/ogg', provider: '火山引擎' })
    expect(timed.words.length).toBeGreaterThan(10)
    const audio = readFileSync(join(dir, '.presmium/speech', `${timed.key}.ogg`))
    expect(audio.includes('AIGC={"Label":"1"')).toBe(true)

    const { status, body } = await transcribe(server, audio, 'audio/ogg', 'volcengine')
    expect(status).toBe(200)
    expect(body.text).toContain('合并')
    expect(body.text.toUpperCase()).toContain('BPE')
    expect(body.segments[0]!.words.length).toBeGreaterThan(5)
    console.info(`Volcengine transcribed "${text}" as "${body.text}"`)
  }, 120_000)
})

describe.skipIf(!GROQ_KEY)('Groq', () => {
  let fake: Fake
  let dir: string
  let started: Child
  let server: string

  beforeAll(async () => {
    fake = await startFake()
    dir = testDeck('speech-groq', 'presmium:\n  presmium.speech: { engine: fake, transcribe: groq }')
    ;({ dev: started, server } = await dev(dir, {
      PRESMIUM_SPEECH_FAKE_URL: fake.url,
      PRESMIUM_SPEECH_FAKE_PROVIDER: 'Presmium fake',
      PRESMIUM_SPEECH_GROQ_URL: 'https://api.groq.com/openai/v1',
      PRESMIUM_SPEECH_GROQ_PROVIDER: 'Groq',
      PRESMIUM_SPEECH_GROQ_KEY: GROQ_KEY!,
      PRESMIUM_SPEECH_GROQ_TRANSCRIBE_MODEL: 'whisper-large-v3-turbo',
    }))
  }, 240_000)

  afterAll(async () => {
    await started?.stop()
    await fake?.stop()
    remove(dir)
  })

  it('transcribes audio in the OpenAI shape and gives its duration', async () => {
    const { key } = (await post(speechUrl(server, 'v1/audio/speech/timestamps'), { voice: 'alpha', input: '转写的冒烟测试。', lang: 'zh-CN' })).json<{ key: string }>()
    const { status, body } = await transcribe(server, readFileSync(join(dir, '.presmium/speech', `${key}.wav`)), 'audio/wav', 'groq')
    expect(status, JSON.stringify(body)).toBe(200)
    expect(body.duration).toBeGreaterThan(1)
    expect(Array.isArray(body.segments)).toBe(true)
  }, 120_000)
})
