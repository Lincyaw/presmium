// Speech in SHARED mode (D13, WP-82): `presmium gateway` has the fake engine's variables and its own
// operator directory; `presmium serve` has no speech variable and answers the speech gateway's routes (and
// the Node SPEECH of the test plugin, fixtures/speech-probe) through the document's synthesis cache over the
// gateway, which alone calls the engine and checks consent records. And a deck cannot define an engine:
// `engines.x` with an address and a variable of a credential is an error and leads nowhere (N-08).
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Fake, Shared } from './helpers.ts'
import { dev, listener, post, presmium, PROBE_NAME, probeUrl, raw, remove, shared, speechUrl, startFake, temporary, testDeck, workspace } from './helpers.ts'

const KEY = 'fake-engine-key-in-the-gateway-only'
const RECORD = { speaker: '林老师', scope: '课程讲授的合成', date: '2026-10-01', statementSha256: 'b'.repeat(64) }

describe('speech through serve and the gateway (SHARED)', () => {
  let fake: Fake
  let dir: string
  let operator: string
  let setup: Shared

  beforeAll(async () => {
    fake = await startFake()
    operator = temporary('speech-gateway-operator')
    dir = workspace('shared', {
      'presmium.workspace.yaml': [
        'title: 语音网关测试',
        'members:',
        '  owners: [owner@test]',
        '  editors: [editor@test]',
        'settings:',
        '  presmium.workspace:',
        `    plugins: ["@presmium/slidev-addon-speech", ${PROBE_NAME}]`,
        '  presmium.speech:',
        '    cloned: true',
        '',
      ].join('\n'),
      'talk/lecture.md': `---\ntitle: 讲授\nplugins: [${PROBE_NAME}]\npresmium:\n  presmium.speech: { engine: fake }\n---\n\n# 讲授\n\n讲解。\n`,
    })
    setup = await shared(dir, operator, { PRESMIUM_SPEECH_FAKE_URL: fake.url, PRESMIUM_SPEECH_FAKE_PROVIDER: 'Presmium fake', PRESMIUM_SPEECH_FAKE_KEY: KEY })
  }, 240_000)

  afterAll(async () => {
    await setup?.stop()
    await fake?.stop()
    remove(dir, operator)
  }, 60_000)

  const site = (email: string) => setup.as(email, 'site', { 'Presmium-Document': 'talk', 'Content-Type': 'application/json' })
  const postAs = (url: string, body: unknown) => raw(url, { method: 'POST', headers: { ...site('editor@test'), Origin: `http://${site('editor@test').Host}` }, body: JSON.stringify(body) })
  const synthesize = (voice: string, input = '经网关合成。') => postAs(speechUrl(setup.url, 'v1/audio/speech/timestamps'), { voice, input, lang: 'zh-CN' })
  const cache = () => join(dir, 'talk/.presmium/speech')

  it('lists the gateway\'s engines with their provider through serve and synthesizes there; the engine is asked by the gateway only', async () => {
    expect(setup.gateway.output()).toMatch(/^plugins {2}.*presmium\.speech/m)
    const listed = await raw(speechUrl(setup.url, 'v1/engines'), { headers: site('editor@test') })
    expect(listed.status, listed.text).toBe(200)
    expect(listed.json<{ engines: unknown[] }>().engines).toEqual([expect.objectContaining({ id: 'fake', provider: 'Presmium fake' })])
    // Readers do not synthesize.
    expect((await raw(speechUrl(setup.url, 'v1/engines'), { headers: site('reader@test') })).status).toBe(403)

    const before = (await fake.requests()).length
    const synthesized = await synthesize('alpha')
    expect(synthesized.status, synthesized.text).toBe(200)
    expect(synthesized.json()).toMatchObject({ engine: 'fake', voice: 'alpha', provider: 'Presmium fake', synthetic: true })
    // The engine's key is in the gateway's environment only: every request that reached the engine carries it.
    const asked = (await fake.requests()).slice(before)
    expect(asked.map(r => r.path)).toEqual(['/v1/audio/voices', '/v1/audio/speech/timestamps'])
    expect(asked.every(r => r.authorization === `Bearer ${KEY}`)).toBe(true)
    expect(synthesized.text).not.toContain(KEY)
    expect(setup.serve.output()).not.toContain(KEY)

    // serve keeps the clip in the document's synthesis cache, and a repeat is answered from it without a request.
    const { key } = synthesized.json<{ key: string }>()
    expect(existsSync(join(cache(), `${key}.wav`))).toBe(true)
    expect(JSON.parse(readFileSync(join(cache(), `${key}.json`), 'utf8'))).toMatchObject({ key, engine: 'fake', model: 'fake-tts', provider: 'Presmium fake' })
    const again = await synthesize('alpha')
    expect(again.json<{ key: string }>().key).toBe(key)
    expect((await fake.requests()).length).toBe(before + 2)
  }, 120_000)

  it('gives the Node SPEECH of serve the gateway\'s engines and the document\'s cache', async () => {
    const engines = await raw(probeUrl(setup.url, 'engines'), { headers: site('editor@test') })
    expect(engines.status, engines.text).toBe(200)
    expect(engines.json()).toEqual([expect.objectContaining({ id: 'fake', provider: 'Presmium fake' })])

    // A clip the browser's path made is a hit for the Node SPEECH: no request, and its audio is the file in the document's cache.
    const text = '浏览器与节点端共用缓存。'
    const { key } = (await synthesize('beta', text)).json<{ key: string }>()
    const before = (await fake.requests()).length
    const hit = await postAs(probeUrl(setup.url, 'synthesize'), { voice: 'beta', text, lang: 'zh-CN' })
    expect(hit.status, hit.text).toBe(200)
    expect(hit.json()).toMatchObject({ key, audio: join(cache(), `${key}.wav`), engine: 'fake', synthetic: true })
    expect((await fake.requests()).length).toBe(before)

    // Transcription goes through the gateway, which alone holds the engine's key.
    const transcribed = await postAs(probeUrl(setup.url, 'transcribe'), { audio: join(cache(), `${key}.wav`), lang: 'zh-CN' })
    expect(transcribed.status, transcribed.text).toBe(200)
    expect(transcribed.json<{ text: string }>().text).toBe(text)
    expect((await fake.requests()).slice(before).map(r => `${r.method} ${r.path} ${r.authorization}`)).toEqual([`POST /v1/audio/transcriptions Bearer ${KEY}`])
  }, 120_000)

  it('refuses a cloned voice whose consent record is in the workspace, and takes the owner\'s registration from the owner console only', async () => {
    // Records in the document and at the workspace root do not count: the gateway reads its own operator directory.
    for (const path of ['talk/.presmium/speech/consent/fake', 'consent/fake']) {
      mkdirSync(join(dir, path), { recursive: true })
      writeFileSync(join(dir, path, 'cloned-lin.json'), JSON.stringify(RECORD))
    }
    const refused = await synthesize('cloned-lin')
    expect(refused.status).toBe(403)
    expect(refused.json<{ error: string }>().error).toContain(`${join(operator, 'consent/fake/cloned-lin.json')} is missing`)

    const route = speechUrl(setup.url, 'consent/fake/cloned-lin')
    const body = JSON.stringify(RECORD)
    expect((await raw(route, { method: 'POST', headers: site('owner@test'), body })).status).toBe(404)
    const consoleHeaders = setup.as('owner@test', 'console', { 'Presmium-Document': 'talk', 'Content-Type': 'application/json', 'Presmium-Console': '1' })
    const registered = await raw(route, { method: 'POST', headers: { ...consoleHeaders, Origin: `http://${consoleHeaders.Host}` }, body })
    expect(registered.status, registered.text).toBe(200)
    expect(JSON.parse(readFileSync(join(operator, 'consent/fake/cloned-lin.json'), 'utf8'))).toEqual(RECORD)

    const allowed = await synthesize('cloned-lin')
    expect(allowed.status, allowed.text).toBe(200)
    expect(allowed.json()).toMatchObject({ voice: 'cloned-lin', cloned: true })
  }, 120_000)

  it('gives a scoped token without presmium.speech no speech route of the gateway', async () => {
    const issued = await fetch(`${setup.gatewayUrl}/tokens`, { method: 'POST', headers: { 'Authorization': `Bearer ${setup.gatewayToken}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ plugins: ['presmium.assistant'], purpose: 'agent:test' }) })
    const { token } = await issued.json() as { token: string }
    expect((await fetch(`${setup.gatewayUrl}/presmium.speech/v1/engines`, { headers: { Authorization: `Bearer ${token}` } })).status).toBe(403)
    expect((await fetch(`${setup.gatewayUrl}/presmium.speech/v1/engines`, { headers: { Authorization: `Bearer ${setup.gatewayToken}` } })).status).toBe(200)
  }, 60_000)
})

describe('a deck that defines an engine', () => {
  const SECRET = 'value-of-the-proxy-secret-variable'
  let target: Awaited<ReturnType<typeof listener>>
  let dir: string

  beforeAll(async () => {
    target = await listener()
    dir = testDeck('speech-deck-engine', `presmium:\n  presmium.speech:\n    engine: x\n    engines:\n      x: { url: '${target.url}', keyEnv: PRESMIUM_PROXY_SECRET }`)
  })

  afterAll(async () => {
    await target?.close()
    remove(dir)
  })

  it('is an error of presmium check and presmium build, and synthesis through the gateway fails: engine x is not defined; nothing reaches the address', async () => {
    const env = { PRESMIUM_PROXY_SECRET: SECRET }
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
})
