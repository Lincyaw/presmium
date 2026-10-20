import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { request as httpRequest } from 'node:http'
import { join } from 'node:path'
import { networkAddresses } from '@lincyaw/server'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Child } from './serve-helpers.ts'
import { cleanEnv, FIXTURES, presmiumProcess, raw, remove, ROOT, waitFor, workspace } from './serve-helpers.ts'

describe('presmium serve on this machine', () => {
  let dir: string
  let serve: Child
  beforeAll(() => {
    dir = workspace('local', 'basic')
  })
  afterAll(async () => {
    await serve?.stop()
    remove(dir)
  }, 60_000)

  it('starts with one command and prints its address; the site and the workspace answer there', async () => {
    serve = presmiumProcess(dir, ['serve', '--port', '0'], cleanEnv({ PRESMIUM_DEBUG: '1' }))
    const url = (await waitFor(serve, /^serve {2}(http:\/\/127\.0\.0\.1:\d+)$/m))[1]!
    expect(serve.output()).toMatch(/^workspace {2}\S+$/m)
    const [, endpoint, stateFile] = await waitFor(serve, /^mcp {2}(http:\/\/127\.0\.0\.1:\d+\/mcp) \(its token is in (.+)\)$/m)
    expect(endpoint).toBe(`${url}/mcp`)
    expect(stateFile!.startsWith(dir)).toBe(false)
    expect(statSync(stateFile!).mode & 0o777).toBe(0o600)
    const state = JSON.parse(readFileSync(stateFile!, 'utf8')) as { mcp: string, token: string }
    expect(state.mcp).toBe(endpoint)
    const initialize = { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'presmium-test', version: '0.1.0' } } }
    const accept = { Accept: 'application/json, text/event-stream' }
    expect((await raw(endpoint!, { headers: accept, json: initialize })).status).toBe(401)
    const initialized = await raw(endpoint!, { headers: { ...accept, Authorization: `Bearer ${state.token}` }, json: initialize })
    expect(initialized.status, initialized.text).toBe(200)
    expect(initialized.text).toContain('"serverInfo"')
    expect(serve.output()).toMatch(/\[presmium serve\] listening at http:\/\/127\.0\.0\.1:\d+/)
    const documents = await raw(`${url}/__presmium/presmium.workspace/documents`)
    expect(documents.json()).toMatchObject({ documents: [{ dir: 'intro', title: '导论' }], git: true, single: false })
    const home = await raw(`${url}/`)
    expect(home.status).toBe(200)
    expect(home.text).toContain('<div id="app">')

    const router = (await waitFor(serve, /dev router is at (http:\/\/127\.0\.0\.1:\d+)/))[1]!
    const port = Number(new URL(router).port)
    const ask = (headers: Record<string, string>, path = '/@lincyaw/documents.json') => new Promise<number>((done, fail) => {
      const req = httpRequest({ host: '127.0.0.1', port, path, headers }, (res) => {
        res.resume()
        done(res.statusCode!)
      })
      req.on('error', fail)
      req.end()
    })
    expect(await ask({ Host: 'rebind.attacker.example' })).toBe(403)
    expect(await ask({ Host: 'rebind.attacker.example' }, '/intro/@lincyaw/ir')).toBe(403)
    expect(await ask({ 'Host': `127.0.0.1:${port}`, 'Sec-Fetch-Site': 'cross-site' })).toBe(403)
    expect(await ask({ Host: `127.0.0.1:${port}` })).not.toBe(403)
  }, 180_000)

  it('serves the operator plugins\' routes: for document \'\' they find no file of the workspace, for a document its files', async () => {
    const home = workspace('home', 'basic')
    try {
      const plugin = join(ROOT, 'e2e/fixtures/workspace/plugins/presmium-fixture-workspace-home')
      cpSync(plugin, join(home, 'node_modules/presmium-fixture-workspace-home'), { recursive: true })
      writeFileSync(join(home, 'presmium.workspace.yaml'), `${readFileSync(join(home, 'presmium.workspace.yaml'), 'utf8')}settings:\n  presmium.workspace:\n    plugins: [presmium-fixture-workspace-home]\n`)
      const local = presmiumProcess(home, ['serve', '--port', '0'])
      try {
        const url = (await waitFor(local, /^serve {2}(http:\/\/127\.0\.0\.1:\d+)$/m))[1]!
        const where = async (document: string) => (await raw(`${url}/__presmium/fixture.home/where`, { headers: { 'Presmium-Document': document } })).json()
        expect(await where('')).toEqual({ document: '', sees: [] })
        expect(await where('intro')).toEqual({ document: 'intro', sees: ['presmium.workspace.yaml', '.git', 'lecture.md'] })
      } finally {
        await local.stop()
      }
    } finally {
      remove(home)
    }
  }, 180_000)

  it('takes a deleted document\'s plugin routes down; made again with another configuration, its routes have that one', async () => {
    const changing = workspace('remount', 'basic')
    try {
      const plugin = join(changing, 'node_modules/presmium-fixture-echo')
      mkdirSync(plugin, { recursive: true })
      writeFileSync(join(plugin, 'package.json'), JSON.stringify({ name: 'presmium-fixture-echo', private: true, type: 'module', exports: { './presmium': './presmium.ts' } }))
      writeFileSync(join(plugin, 'presmium.ts'), `export default { id: 'fixture.echo', version: '0.1.0', kernel: '^1.0.0', server: ctx => ({ routes: { config: { role: 'reader', handle: () => Response.json(ctx.config) } } }) }\n`)
      const deck = (color: string) => `---\ntitle: 导论\nplugins:\n  - presmium-fixture-echo\npresmium:\n  fixture.echo:\n    color: ${color}\n---\n\n# 导论\n`
      writeFileSync(join(changing, 'intro/lecture.md'), deck('red'))
      mkdirSync(join(changing, 'templates/blue'), { recursive: true })
      writeFileSync(join(changing, 'templates/blue/lecture.md'), deck('blue'))
      writeFileSync(join(changing, 'presmium.workspace.yaml'), `${readFileSync(join(changing, 'presmium.workspace.yaml'), 'utf8')}templates: templates\nsettings:\n  presmium.workspace:\n    plugins: [presmium-fixture-echo]\n`)
      const local = presmiumProcess(changing, ['serve', '--port', '0'])
      try {
        const url = (await waitFor(local, /^serve {2}(http:\/\/127\.0\.0\.1:\d+)$/m))[1]!
        const echo = () => raw(`${url}/__presmium/fixture.echo/config`, { headers: { 'Presmium-Document': 'intro' } })
        const operate = (body: Record<string, unknown>) => raw(`${url}/__presmium/presmium.workspace/documents`, { json: body })
        expect((await echo()).json()).toEqual({ color: 'red' })
        expect((await operate({ op: 'delete', dir: 'intro' })).status).toBe(200)
        expect((await echo()).status).toBe(404)
        expect((await operate({ op: 'create', dir: 'intro', template: 'blue', title: '导论' })).status).toBe(200)
        expect((await echo()).json()).toEqual({ color: 'blue' })
      } finally {
        await local.stop()
      }
    } finally {
      remove(changing)
    }
  }, 180_000)

  it('listens on the local network with --host, saying there is no login, and on a name of this machine (E-3, revised)', async () => {
    const network = presmiumProcess(dir, ['serve', '--host', '0.0.0.0', '--port', '0'])
    try {
      const port = (await waitFor(network, /^serve {2}http:\/\/127\.0\.0\.1:(\d+)$/m))[1]!
      await waitFor(network, /with no login: anyone who reaches port \d+ uses this workspace as you/)
      if (networkAddresses().length > 0) expect(network.output()).toContain(`network  http://${networkAddresses()[0]}:${port}/`)
    } finally {
      await network.stop()
    }
    const local = presmiumProcess(dir, ['serve', '--host', 'localhost', '--port', '0'])
    try {
      await waitFor(local, /^serve {2}http:\/\/localhost:\d+$/m)
      expect(local.output()).not.toContain('no login')
    } finally {
      await local.stop()
    }
  }, 180_000)
})

async function siteIR(url: string, dir: string, headers: Record<string, string> = {}): Promise<{ text: string, doc: { diagnostics: { checkId: string, severity: string, message: string }[] } }> {
  const answer = await raw(`${url}/${dir}/@lincyaw/ir`, { headers })
  expect(answer.status, answer.text).toBe(200)
  return { text: answer.text, doc: answer.json<{ doc: { diagnostics: { checkId: string, severity: string, message: string }[] } }>().doc }
}

describe('the plugins of presmium serve are those the deck lists, as in presmium dev (E-2)', () => {
  let dir: string
  let serve: Child
  afterAll(async () => {
    await serve?.stop()
    remove(dir)
  }, 60_000)

  it('loads the deck\'s plugin named by a relative path and the one installed only in its node_modules', async () => {
    dir = workspace('deck-plugins', 'deck-plugins')
    cpSync(join(FIXTURES, 'plugins/presmium-fixture-deckonly'), join(dir, 'doc/node_modules/presmium-fixture-deckonly'), { recursive: true })
    serve = presmiumProcess(dir, ['serve', '--port', '0'])
    const url = (await waitFor(serve, /^serve {2}(http\S+)$/m))[1]!
    const { doc } = await siteIR(url, 'doc')
    expect(doc.diagnostics.filter(d => d.checkId === 'presmium.plugins')).toEqual([])
    for (const marker of ['doc/relative/loaded', 'doc/node_modules/presmium-fixture-deckonly/loaded']) expect(existsSync(join(dir, marker)), marker).toBe(true)
  }, 180_000)
})

function execWorkspace(prefix: string): string {
  const dir = workspace(prefix, 'exec', { '@lincyaw/slidev-addon-exec': 'packages/addon-exec' })
  writeFileSync(join(dir, 'presmium.workspace.yaml'), `title: 编译时执行
settings:
  presmium.workspace:
    plugins: ['@lincyaw/slidev-addon-exec']
`)
  return dir
}

function recordings(dir: string): { env: Record<string, string>, parent: string }[] {
  const freeze = join(dir, 'code/.presmium/freeze')
  if (!existsSync(freeze)) return []
  return readdirSync(freeze).filter(name => name.endsWith('.json')).flatMap((name) => {
    const stdout = (JSON.parse(readFileSync(join(freeze, name), 'utf8')) as { run?: { stdout?: string } }).run?.stdout ?? ''
    const env = /^ENV (.*)$/m.exec(stdout)?.[1]
    const parent = /^PARENT (.*)$/m.exec(stdout)?.[1]
    return env && parent ? [{ env: JSON.parse(env) as Record<string, string>, parent }] : []
  })
}

async function until<T>(get: () => T | undefined | Promise<T | undefined>, timeoutMs = 90_000): Promise<T> {
  const end = Date.now() + timeoutMs
  for (;;) {
    const value = await get()
    if (value) return value
    if (Date.now() > end) throw new Error('timed out waiting')
    await new Promise(done => setTimeout(done, 250))
  }
}

describe('compile-time execution in presmium serve (N-08)', () => {
  const cleanups: (() => Promise<void> | void)[] = []
  afterAll(async () => {
    for (const cleanup of cleanups.reverse()) await cleanup()
  }, 120_000)

  it('runs the code in serve without asking, with the serve rules\' HOME', async () => {
    const dir = execWorkspace('exec-local')
    const serve = presmiumProcess(dir, ['serve', '--port', '0'])
    cleanups.push(() => serve.stop(), () => remove(dir))
    const url = (await waitFor(serve, /^serve {2}(http\S+)$/m))[1]!
    expect((await raw(`${url}/code/`)).status).toBe(200)
    const [run] = await until(() => recordings(dir).length > 0 ? recordings(dir) : undefined)
    expect(run!.parent).toMatch(/presmium\.mjs serve/)
    expect(run!.env.HOME).toMatch(/\/presmium\/run-home\/[0-9a-f]{16}$/)
  }, 300_000)
})
