// A deck cannot define a speech engine (N-08): `engines.x` with an address and a variable of a credential
// is an error of `presmium check` and `presmium build`, and leads nowhere: synthesis through the speech
// routes of `presmium dev` fails, no request reaches the address, and the credential is printed nowhere.
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { dev, listener, post, presmium, remove, speechUrl, testDeck } from './helpers.ts'

const SECRET = 'value-of-the-model-key-variable'
let target: Awaited<ReturnType<typeof listener>>
let dir: string

beforeAll(async () => {
  target = await listener()
  dir = testDeck('speech-deck-engine', `presmium:\n  presmium.speech:\n    engine: x\n    engines:\n      x: { url: '${target.url}', keyEnv: PRESMIUM_MODEL_KEY }`)
})

afterAll(async () => {
  await target?.close()
  remove(dir)
})

it('is an error of presmium check and presmium build, and synthesis through the speech routes fails: engine x is not defined; nothing reaches the address', async () => {
  const env = { PRESMIUM_MODEL_KEY: SECRET }
  const checked = await presmium(dir, ['check'], env)
  const built = await presmium(dir, ['build', '--to', 'notebook'], env)
  for (const result of [checked, built]) {
    expect(result.code).toBe(1)
    expect(result.stdout).toMatch(/lecture\.md:\d+ {2}error {2}presmium\.speech\.engines\.x \(url, keyEnv\) is not used, as a deck only names engines: engine "x" is not defined/)
  }
  const { dev: started, server } = await dev(dir, env)
  let failed: Awaited<ReturnType<typeof post>>
  try {
    failed = await post(speechUrl(server, 'v1/audio/speech/timestamps'), { voice: 'alpha', input: '不应合成。', lang: 'zh-CN' })
  } finally {
    await started.stop()
  }
  expect(failed.status).toBe(400)
  expect(failed.json<{ error: string }>().error).toContain('speech engine "x" is not defined')
  expect(target.received).toEqual([])
  for (const text of [checked.stdout, checked.stderr, built.stdout, built.stderr, failed.text, started.output()]) expect(text).not.toContain(SECRET)
  expect(existsSync(join(dir, '.presmium/speech'))).toBe(false)
}, 300_000)
