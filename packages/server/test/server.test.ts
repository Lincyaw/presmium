import { readFileSync, writeFileSync } from 'node:fs'
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
    const value = await fetch(`${web}/__presmium/fixture.server/value`)
    expect(value.status).toBe(200)
    expect(await value.json()).toEqual({ value: 'from the node service' })

    expect((await raw(`${server}/__presmium/fixture.server/value`, { headers: { Host: 'evil.example' } })).status).toBe(403)
    expect((await raw(`${server}/__presmium/fixture.server/value`, { headers: { Origin: 'https://evil.example' } })).status).toBe(403)
    expect((await raw(`${server}/__presmium/fixture.server/value`, { headers: { Origin: web } })).status).toBe(200)

    expect((await raw(`${server}/mcp`, { method: 'POST' })).status).toBe(401)
    const state = JSON.parse(readFileSync(join(dir, '.presmium/server.json'), 'utf8')) as { token: string, url: string }
    expect(state.url).toBe(server)
    expect((await raw(`${server}/mcp`, { method: 'POST', headers: { Authorization: `Bearer ${state.token}` } })).status).toBe(415)

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
    expect(context.operatorDir).toMatch(/presmium\/operator\/[0-9a-f]{16}$/)
    expect(context.operatorDir.startsWith(dir)).toBe(false)
  })

  it('refreshes the mounted services after configuration or language changes, and keeps them for body edits', async () => {
    const context = () => fetch(`${server}/__presmium/fixture.server/context`).then(response => response.json())
    const closed = () => fetch(`${server}/__presmium/fixture.server/closed`).then(response => response.json())
    const before = await closed()
    const file = join(dir, 'lecture.md')
    const original = readFileSync(file, 'utf8')
    const compilations = () => (dev.output().match(/^compiled /gm) ?? []).length
    const count = compilations()
    writeFileSync(file, original.replace('正文。', '编辑过的正文。'))
    await expect.poll(compilations, { timeout: 30_000 }).toBeGreaterThan(count)
    expect(await closed()).toEqual(before)

    writeFileSync(file, original.replace('title:', 'lang: en\ntitle:').replace('来自文稿', 'saved configuration'))
    await expect.poll(context, { timeout: 30_000 }).toMatchObject({
      lang: 'en', config: { greeting: 'saved configuration' },
      service: { lang: 'en', config: { greeting: 'saved configuration' } },
    })
    expect(await closed()).toEqual({ closed: before.closed + 1 })
  }, 60_000)
})

describe('presmium serve configuration updates', () => {
  let dir: string
  let serve: Child
  let url: string
  beforeAll(async () => {
    dir = workspace('server-config', { doc: DECK })
    writeFileSync(join(dir, 'presmium.workspace.yaml'), 'title: Server configuration\ndocuments:\n  - doc/lecture.md\n')
    serve = presmiumProcess(dir, ['serve', '--port', '0'])
    url = (await waitFor(serve, /^serve {2}(http\S+)$/m))[1]!
  }, 120_000)
  afterAll(async () => {
    await serve?.stop()
    remove(dir)
  })

  it('uses the saved configuration and language in a document\'s HTTP routes', async () => {
    const context = () => raw(`${url}/__presmium/fixture.server/context`, { headers: { 'Presmium-Document': 'doc' } }).then(response => response.json())
    expect(await context()).toMatchObject({ config: { greeting: '来自文稿' } })
    const ir = await raw(`${url}/__presmium/presmium.workspace/ir?document=doc`)
    const section = ir.json<{ doc: { sections: { id: string }[] } }>().doc.sections[0]!.id
    await fetch(`${url}/__presmium/presmium.server/focus`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ document: 'doc', focus: [{ id: 'kept', from: 'web', section }] }) })
    const file = join(dir, 'doc/lecture.md')
    writeFileSync(file, readFileSync(file, 'utf8').replace('title:', 'lang: en\ntitle:').replace('来自文稿', 'workspace configuration'))
    await expect.poll(context, { timeout: 30_000 }).toMatchObject({
      lang: 'en', config: { greeting: 'workspace configuration' },
      service: { lang: 'en', config: { greeting: 'workspace configuration' } },
    })
    expect((await raw(`${url}/__presmium/presmium.server/focus?document=doc`)).json()).toMatchObject({ focus: [{ id: 'kept' }] })
  }, 60_000)
})
