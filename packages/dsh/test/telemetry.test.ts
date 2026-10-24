import { randomUUID } from 'node:crypto'
import { fakeCollector } from '../src/node/fake-collector.ts'
import type { Logged } from '../src/node/fake-collector.ts'
import { fakeModel } from '../src/node/fake-model.ts'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { testHome, turns } from './harness.ts'
import type { HostApi, Service, TestHome, Web } from './harness.ts'

const content = (record: Logged) => JSON.parse(String(record.attributes.content)) as { type: string, data: Record<string, any> }

describe('the operator\'s collector', () => {
  let home: TestHome
  let service: Service
  let otlp: Awaited<ReturnType<typeof fakeCollector>>
  beforeAll(async () => {
    home = testHome('telemetry')
    otlp = await fakeCollector()
    service = await home.serve(home.workspace('telemetry', { 'lecture.md': '---\ntitle: 采集\n---\n\n# 采集\n\n(one)=\n## 一节\n\n正文。\n' }).dir)
  }, 240_000)
  afterAll(async () => {
    await home?.close()
    await otlp?.close()
  })

  it('exports every event of a session and the workbench\'s operations, joined by the request\'s id', async () => {
    const model = await fakeModel([{ text: '这一段讲的是采集。' }])
    let web: Web | undefined
    try {
      web = await home.web(service.root, 5631, { model, env: { ...service.env, PRESMIUM_TELEMETRY_URL: `${otlp.url}/v1/logs`, PRESMIUM_TELEMETRY_HEADERS: 'authorization=Bearer%20t0ken', PRESMIUM_TELEMETRY_USER: 'teacher-7' } })
      const api: HostApi = await web.api()
      expect(await (await api.fetch('/api/presmium/telemetry')).json()).toEqual({ enabled: true })
      const { sessionId } = await api.call<{ sessionId: string }>('session/create', { request: { cwd: service.root } })
      const requestId = randomUUID()
      const report = (records: unknown[]) => api.fetch('/api/presmium/telemetry', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ client: { id: 'page-1', browser: 'browser-1', locale: 'zh-CN' }, records }) })
      expect((await report([{ name: 'agent.ask', time: Date.now(), seq: 1, attributes: { 'presmium.document': '', 'presmium.ask.text': '解释这一段', 'dsh.session.id': sessionId, 'dsh.request.id': requestId } }])).status).toBe(204)
      expect((await report([{ name: 'Not An Operation', time: Date.now(), seq: 2, attributes: {} }])).status).toBe(400)
      await api.call('session/prompt', { request: { requestId, sessionId, mode: 'queue', content: [{ type: 'text', text: '解释这一段' }] } })
      await expect.poll(() => turns(model).length, { timeout: 60_000 }).toBe(1)

      const sessionLogs = () => otlp.logged.filter(record => record.attributes.sessionId === sessionId)
      await expect.poll(() => sessionLogs().some(record => content(record).type === 'turn/end'), { timeout: 30_000 }).toBe(true)
      await expect.poll(() => otlp.logged.some(record => record.attributes['presmium.operation'] === 'agent.ask'), { timeout: 15_000, message: JSON.stringify(otlp.logged.filter(record => !('sessionId' in record.attributes)).slice(0, 3)) }).toBe(true)
      const asked = otlp.logged.find(record => record.attributes['presmium.operation'] === 'agent.ask')!
      expect(asked).toMatchObject({ body: 'agent.ask', attributes: { 'dsh.request.id': requestId, 'dsh.session.id': sessionId, 'presmium.client.id': 'page-1', 'presmium.browser.id': 'browser-1', 'presmium.ask.text': '解释这一段', 'presmium.seq': 1 } })
      // The operation's request id is the one the session's user message carries; the turn's events follow it.
      const message = sessionLogs().find(record => content(record).type === 'user/message' && content(record).data.source?.rpcId === requestId)
      expect(message, JSON.stringify(sessionLogs().map(record => content(record).type))).toBeDefined()
      const turn = message!.attributes['presmium.turn']
      const answer = sessionLogs().find(record => content(record).type === 'assistant/message')!
      expect(answer.attributes['presmium.turn']).toBe(turn)
      expect(JSON.stringify(content(answer).data)).toContain('这一段讲的是采集。')
      expect(new Set(sessionLogs().map(record => record.attributes['event.seq'] ?? content(record).type)).size).toBeGreaterThan(5)
      for (const record of [asked, message!]) {
        expect(record.resource).toMatchObject({ 'service.name': 'presmium-studio', 'user.id': 'teacher-7' })
        expect(record.resource['presmium.installation.id']).toEqual(expect.any(String))
        expect(record.headers.authorization).toBe('Bearer t0ken')
      }
    } finally {
      await web?.stop()
      await model.close()
    }
  }, 240_000)

  it('without a collector, nothing is recorded or sent', async () => {
    const model = await fakeModel([{ text: '好。' }])
    let web: Web | undefined
    try {
      const before = otlp.logged.length
      web = await home.web(service.root, 5632, { model, env: service.env })
      const api = await web.api()
      expect(await (await api.fetch('/api/presmium/telemetry')).json()).toEqual({ enabled: false })
      const { sessionId } = await api.call<{ sessionId: string }>('session/create', { request: { cwd: service.root } })
      expect((await api.fetch('/api/presmium/telemetry', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ client: { id: 'page-2' }, records: [{ name: 'document.open', time: Date.now(), seq: 1, attributes: {} }] }) })).status).toBe(204)
      await api.call('session/prompt', { request: { requestId: randomUUID(), sessionId, mode: 'queue', content: [{ type: 'text', text: '你好' }] } })
      await expect.poll(() => turns(model).length, { timeout: 60_000 }).toBe(1)
      await new Promise(done => setTimeout(done, 2500))
      expect(otlp.logged.length).toBe(before)
    } finally {
      await web?.stop()
      await model.close()
    }
  }, 240_000)
})
