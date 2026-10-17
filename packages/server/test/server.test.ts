// The server (WP-73a, docs/architecture.md section 10): `presmium dev` mounts a test plugin's routes,
// which the web dev server proxies, and keeps other machines and sites out.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Child } from './helpers.ts'
import { FIXTURES, presmiumProcess, raw, remove, waitFor, workspace } from './helpers.ts'

const DECK = join(FIXTURES, 'deck')

describe('presmium dev', () => {
  let dir: string
  let dev: Child
  let web: string
  let server: string
  beforeAll(async () => {
    dir = workspace('server-dev', { '.': DECK })
    dev = presmiumProcess(dir, ['dev', '--to', 'web', '--allow', 'operate'])
    web = (await waitFor(dev, /^web {2}(http\S+)$/m))[1]!.replace(/\/$/, '')
    server = (await waitFor(dev, /^server {2}(http\S+)$/m))[1]!
  }, 300_000)
  afterAll(async () => {
    await dev?.stop()
    remove(dir)
  })

  it('serves a plugin\'s route through the web dev server, and keeps other hosts, sites and token-less MCP clients out', async () => {
    // The route returns the value of the plugin's own Node service.
    const value = await fetch(`${web}/__presmium/fixture.server/value`)
    expect(value.status).toBe(200)
    expect(await value.json()).toEqual({ value: 'from the node service' })

    // DNS rebinding and other sites: another Host, another Origin.
    expect((await raw(`${server}/__presmium/fixture.server/value`, { headers: { Host: 'evil.example' } })).status).toBe(403)
    expect((await raw(`${server}/__presmium/fixture.server/value`, { headers: { Origin: 'https://evil.example' } })).status).toBe(403)
    // A page of the dev server (another port of this machine) is welcome.
    expect((await raw(`${server}/__presmium/fixture.server/value`, { headers: { Origin: web } })).status).toBe(200)

    // /mcp needs the token; the per-process one is in .presmium/server.json (0600). With it the MCP service
    // (packages/mcp/test) answers, here that a request without a JSON body is not one it takes.
    expect((await raw(`${server}/mcp`, { method: 'POST' })).status).toBe(401)
    const state = JSON.parse(readFileSync(join(dir, '.presmium/server.json'), 'utf8')) as { token: string, url: string }
    expect(state.url).toBe(server)
    expect((await raw(`${server}/mcp`, { method: 'POST', headers: { Authorization: `Bearer ${state.token}` } })).status).toBe(415)

    // `--allow operate`: the route's approval is given without asking.
    const approved = await fetch(`${web}/__presmium/fixture.server/approve`, { method: 'POST' })
    expect(await approved.json()).toEqual({ allowed: true })
  })

  it('gives the plugin the operator\'s settings of presmium.workspace.yaml, and the deck\'s configuration only as config', async () => {
    const context = await (await fetch(`${web}/__presmium/fixture.server/context`)).json() as Record<string, any>
    const operator = { mode: 'operator', quota: 3 }
    const deck = { greeting: '来自文稿', mode: 'deck' }
    expect(context.settings).toEqual(operator)
    expect(context.service.settings).toEqual(operator)
    expect(context.config).toEqual(deck)
    expect(context.service.config).toEqual(deck)
    // The operator directory lies outside the workspace.
    expect(context.operatorDir).toMatch(/presmium\/operator\/[0-9a-f]{16}$/)
    expect(context.operatorDir.startsWith(dir)).toBe(false)
  })
})
