// `presmium agent-host`'s agent sessions (SHARED, docs/architecture.md 10.8), called as serve calls them, with the
// assistant's agent runtime whose agent is the scripted test agent (the operator plugin of
// fixtures/plugins/presmium-fixture-scripted-runtime): a learner's question (`tutor`) runs in an empty directory
// of agent-host's own, removed with the session, never in the document (D-13); a prompt whose caller goes away is
// cancelled, the agent hears `session/cancel` and the prompt ends (F-53); at most
// `settings.presmium.workspace.maxAgentSessions` sessions at a time, one more gets 429 (F-08).
import { cpSync, existsSync, readdirSync, readFileSync } from 'node:fs'
import { request as httpRequest } from 'node:http'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Child } from './helpers.ts'
import { cleanEnv, FIXTURES, presmiumProcess, raw, remove, ROOT, waitFor, workspace } from './helpers.ts'

const TOKEN = 'agent-host-token-89c'
const AGENT = `${process.execPath} ${join(ROOT, 'packages/addon-assistant/test/fixtures/scripted-agent.mjs')}`
const MEMBER = { id: 'editor@test', name: 'Editor', roles: ['editor'] }

/** What the scripted agent logged, one object a line. */
function agentLog(file: string): Record<string, any>[] {
  if (!existsSync(file)) return []
  return readFileSync(file, 'utf8').split('\n').filter(Boolean).map(line => JSON.parse(line) as Record<string, any>)
}

describe('agent-host\'s agent sessions', () => {
  let dir: string
  let log: string
  let host: Child
  let url: string
  const call = (path: string, method = 'GET', json?: unknown) => raw(`${url}${path}`, { method, headers: { Authorization: `Bearer ${TOKEN}` }, ...json === undefined ? {} : { json } })
  const open = (mode: 'tutor' | 'author') => call('/v1/sessions', 'POST', { document: 'doc', mode, member: MEMBER, cwd: join(dir, 'doc') })

  beforeAll(async () => {
    dir = workspace('agent-host', join(FIXTURES, 'agent-host'), { '@presmium/slidev-addon-assistant': 'packages/addon-assistant' })
    cpSync(join(FIXTURES, 'plugins/presmium-fixture-scripted-runtime'), join(dir, 'node_modules/presmium-fixture-scripted-runtime'), { recursive: true })
    log = `${dir}.agent.log`
    host = presmiumProcess(dir, ['agent-host', '--port', '0'], cleanEnv({ PRESMIUM_AGENT_HOST_TOKEN: TOKEN, PRESMIUM_DEBUG: '1', SCRIPTED_AGENT_COMMAND: AGENT, SCRIPTED_AGENT_LOG: log, XDG_CACHE_HOME: `${dir}.cache` }))
    url = (await waitFor(host, /^agent-host {2}(http\S+)$/m))[1]!
  }, 120_000)
  afterAll(async () => {
    await host?.stop()
    for (const path of [dir, `${dir}.cache`, log]) remove(path)
  })

  it('runs a question (tutor) in an empty directory of its own, not the document, and removes it with the session', async () => {
    const opened = await open('tutor')
    expect(opened.status, opened.text).toBe(201)
    const { id } = opened.json<{ id: string }>()
    const cwd = agentLog(log).filter(e => e.event === 'session/new').at(-1)!.cwd as string
    expect(cwd).not.toBe(join(dir, 'doc'))
    expect(cwd.startsWith(join(`${dir}.cache`, 'presmium/agent-host/questions'))).toBe(true)
    expect(readdirSync(cwd)).toEqual([])
    expect((await call(`/v1/sessions/${id}`, 'DELETE')).status).toBe(204)
    expect(existsSync(cwd)).toBe(false)
  }, 60_000)

  it('cancels a prompt whose caller went away: the agent gets session/cancel, and the prompt ends', async () => {
    const opened = await open('author')
    expect(opened.status, opened.text).toBe(201)
    const { id } = opened.json<{ id: string }>()
    try {
      // serve's prompt request, which goes away while the agent waits.
      const body = JSON.stringify({ kind: 'chat', prompt: '#wait', context: { document: 'doc' } })
      const req = httpRequest(`${url}/v1/sessions/${id}/prompt`, { method: 'POST', headers: { 'Authorization': `Bearer ${TOKEN}`, 'Content-Type': 'application/json' } })
      req.on('error', () => undefined)
      req.end(body)
      await expect.poll(() => agentLog(log).some(e => e.event === 'session/prompt' && e.question === '#wait'), { timeout: 30_000 }).toBe(true)
      req.destroy()
      await expect.poll(() => agentLog(log).some(e => e.event === 'session/cancel'), { timeout: 30_000 }).toBe(true)
      // The prompt's loop ended (its flush of permission requests stopped with it).
      await waitFor(host, new RegExp(`session ${id}: the prompt ended, its caller gone`), 30_000)
    } finally {
      await call(`/v1/sessions/${id}`, 'DELETE')
    }
  }, 90_000)

  it('runs two sessions at most (maxAgentSessions): one more gets 429 until one closed', async () => {
    const first = await open('author')
    const second = await open('author')
    expect([first.status, second.status]).toEqual([201, 201])
    const third = await open('tutor')
    expect(third.status).toBe(429)
    expect(third.json<{ error: string }>().error).toContain('maxAgentSessions')
    expect((await call(`/v1/sessions/${first.json<{ id: string }>().id}`, 'DELETE')).status).toBe(204)
    const again = await open('author')
    expect(again.status, again.text).toBe(201)
    for (const opened of [second, again]) await call(`/v1/sessions/${opened.json<{ id: string }>().id}`, 'DELETE')
  }, 90_000)
})
