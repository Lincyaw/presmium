import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Child } from './helpers.ts'
import { cleanEnv, FIXTURES, presmiumProcess, raw, remove, waitFor, workspace } from './helpers.ts'

const TOKEN = 'service-test-token'
const WORKBENCH = 'http://127.0.0.1:5617'
const ALL = { Authorization: `Bearer ${TOKEN}` }

async function events(url: string, until: (data: Record<string, unknown>) => boolean, act: () => void): Promise<Record<string, unknown>[]> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 60_000)
  const response = await fetch(url, { headers: ALL, signal: controller.signal })
  expect(response.headers.get('content-type')).toMatch(/^text\/event-stream/)
  const reader = response.body!.getReader()
  const decoder = new TextDecoder()
  const seen: Record<string, unknown>[] = []
  let text = ''
  let acted = false
  try {
    for (;;) {
      const { value, done } = await reader.read()
      if (done) break
      text += decoder.decode(value, { stream: true })
      let end
      while ((end = text.indexOf('\n\n')) >= 0) {
        const block = text.slice(0, end)
        text = text.slice(end + 2)
        const data = block.split('\n').filter(line => line.startsWith('data: ')).map(line => line.slice(6)).join('\n')
        if (!data) continue
        const event = JSON.parse(data) as Record<string, unknown>
        seen.push(event)
        if (until(event)) return seen
      }
      if (!acted && seen.length > 0) {
        acted = true
        act()
      }
    }
  } finally {
    clearTimeout(timer)
    controller.abort()
  }
  return seen
}

describe('presmium serve: the workspace service for a workbench', () => {
  let dir: string
  let home: string
  let serve: Child
  let url: string
  const route = (path: string, options: Parameters<typeof raw>[1] = {}) => raw(`${url}/__presmium/presmium.workspace/${path}`, { ...options, headers: { ...ALL, ...options.headers } })

  beforeAll(async () => {
    dir = workspace('service', join(FIXTURES, 'service'), { '@lincyaw/addon-assistant': 'packages/addon-assistant' })
    home = `${dir}.home`
    mkdirSync(home)
    serve = presmiumProcess(dir, ['serve', '--preview-origin', WORKBENCH, '--port', '0'], cleanEnv({ PRESMIUM_SERVICE_TOKEN: TOKEN, HOME: home, XDG_CACHE_HOME: join(home, 'cache'), XDG_STATE_HOME: join(home, 'state'), XDG_CONFIG_HOME: join(home, 'config') }))
    url = (await waitFor(serve, /^serve {2}(http\S+)$/m))[1]!
  }, 120_000)
  afterAll(async () => {
    await serve?.stop()
    remove(dir)
    remove(home)
  })

  it('gives the revision first to a workbench that asks for the events of a document nothing has compiled', async () => {
    const seen = await events(`${url}/__presmium/presmium.workspace/ir/events?document=fresh`, () => true, () => {})
    const { revision } = (await route('ir?document=fresh')).json<{ revision: string }>()
    expect(seen).toEqual([{ document: 'fresh', revision, diagnostics: { errors: 0, warnings: 0 }, files: [] }])
  }, 120_000)

  it('asks every route of the workspace and the server\'s diagnostics for the service token, and refuses a token that differs only in a non-ASCII letter', async () => {
    for (const [path, init] of [['ir?document=talk', {}], ['documents', {}], ['files?document=talk', {}], ['source?document=talk', { method: 'POST', json: { path: 'talk/lecture.md', content: 'x', base: 'x' } }]] as const) {
      expect((await raw(`${url}/__presmium/presmium.workspace/${path}`, init)).status, path).toBe(401)
      expect((await raw(`${url}/__presmium/presmium.workspace/${path}`, { ...init, headers: { Authorization: 'Bearer another' } })).status, path).toBe(401)
    }
    const lookalike = { Authorization: `Bearer ${TOKEN.slice(0, -1)}é` }
    expect((await raw(`${url}/__presmium/presmium.workspace/documents`, { headers: lookalike })).status).toBe(401)
    expect((await raw(`${url}/__presmium/presmium.server/diagnostics?document=talk`, { headers: lookalike })).status).toBe(401)
    expect((await raw(`${url}/__presmium/presmium.server/diagnostics?document=talk`, { headers: ALL })).status).toBe(200)
    expect((await route('documents')).status).toBe(200)
    expect((await raw(`${url}/__presmium/presmium.server/hello`)).status).toBe(200)
  })

  function serveState(): string {
    const state = /its token is in (\S+)\/server\.json/.exec(serve.output())?.[1]
    if (!state) throw new Error(`no state directory in:\n${serve.output()}`)
    return state.split('/').at(-1)!
  }
})
