// `presmium serve` (WP-79, docs/architecture.md section 10): one command starts the workspace service for the
// one user on this machine, on the loopback; with `--host` on the local network too, for that user's other
// devices, saying there is no login (E-3, revised). The home page has the operator plugins: their routes answer for it, and
// it loads their browser parts (WP-81e2). A document loads the plugins its deck lists, as in `presmium dev` (E-2).
// With PRESMIUM_DEBUG its server says more (F-35). A document deleted under serve has no plugin routes any more,
// and made again with another configuration, its routes have that one (C-7, F-40). Compile-time code runs in
// serve without asking, with the `serve` rules of its environment (N-08).
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { request as httpRequest } from 'node:http'
import { join } from 'node:path'
import { networkAddresses } from '@presmium/server'
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
    // Its server's debug lines, with PRESMIUM_DEBUG (F-35).
    expect(serve.output()).toMatch(/\[presmium serve\] listening at http:\/\/127\.0\.0\.1:\d+/)
    const documents = await raw(`${url}/__presmium/presmium.workspace/documents`)
    expect(documents.json()).toMatchObject({ documents: [{ dir: 'intro', title: '导论' }], git: true, single: false })
    const home = await raw(`${url}/`)
    expect(home.status).toBe(200)
    expect(home.text).toContain('<div id="app">')

    // The site's own dev router (a port of its own on this machine) refuses other sites' pages: a rebound
    // host name and a cross-site request get 403, whatever path they ask for; serve's loopback Host passes.
    const router = (await waitFor(serve, /dev router is at (http:\/\/127\.0\.0\.1:\d+)/))[1]!
    const port = Number(new URL(router).port)
    const ask = (headers: Record<string, string>, path = '/@presmium/documents.json') => new Promise<number>((done, fail) => {
      const req = httpRequest({ host: '127.0.0.1', port, path, headers }, (res) => {
        res.resume()
        done(res.statusCode!)
      })
      req.on('error', fail)
      req.end()
    })
    expect(await ask({ Host: 'rebind.attacker.example' })).toBe(403)
    expect(await ask({ Host: 'rebind.attacker.example' }, '/intro/@presmium/ir')).toBe(403)
    expect(await ask({ 'Host': `127.0.0.1:${port}`, 'Sec-Fetch-Site': 'cross-site' })).toBe(403)
    expect(await ask({ Host: `127.0.0.1:${port}` })).not.toBe(403)
  }, 180_000)

  it('serves the operator plugins on the home page: their route answers for document \'\' and finds no file of the workspace there, the home page loads their browser part', async () => {
    const home = workspace('home', 'basic')
    try {
      const plugin = join(ROOT, 'e2e/fixtures/workspace/plugins/presmium-fixture-workspace-home')
      cpSync(plugin, join(home, 'node_modules/presmium-fixture-workspace-home'), { recursive: true })
      writeFileSync(join(home, 'presmium.workspace.yaml'), `${readFileSync(join(home, 'presmium.workspace.yaml'), 'utf8')}settings:\n  presmium.workspace:\n    plugins: [presmium-fixture-workspace-home]\n`)
      const local = presmiumProcess(home, ['serve', '--port', '0'])
      try {
        const url = (await waitFor(local, /^serve {2}(http:\/\/127\.0\.0\.1:\d+)$/m))[1]!
        const where = async (document: string) => (await raw(`${url}/__presmium/fixture.home/where`, { headers: { 'Presmium-Document': document } })).json()
        // The home page is no document: the plugin's deck directory there holds none of the workspace's files.
        expect(await where('')).toEqual({ document: '', sees: [] })
        expect(await where('intro')).toEqual({ document: 'intro', sees: ['presmium.workspace.yaml', '.git', 'lecture.md'] })
        // The home page's theme imports the plugin's browser part; a document's page does not (its deck does not list it).
        const theme = await raw(`${url}/.vitepress/theme/index.ts`)
        expect(theme.status, theme.text).toBe(200)
        expect(theme.text).toContain('createSiteHomeTheme')
        expect(theme.text).toContain('presmium-fixture-workspace-home/src/client/plugin.ts')
        const page = await raw(`${url}/intro/.vitepress/theme/index.ts`)
        expect(page.status, page.text).toBe(200)
        expect(page.text).toContain('createPresmiumTheme')
        expect(page.text).not.toContain('presmium-fixture-workspace-home')
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
      // An operator plugin whose route answers with the document's configuration of it.
      const plugin = join(changing, 'node_modules/presmium-fixture-echo')
      mkdirSync(plugin, { recursive: true })
      writeFileSync(join(plugin, 'package.json'), JSON.stringify({ name: 'presmium-fixture-echo', private: true, type: 'module', exports: { './presmium': './presmium.ts' } }))
      writeFileSync(join(plugin, 'presmium.ts'), `export default { id: 'fixture.echo', version: '0.1.0', kernel: '^0.1.0', server: ctx => ({ routes: { config: { role: 'reader', handle: () => Response.json(ctx.config) } } }) }\n`)
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
      // Its own address is a loopback one; another device reaches it at the machine's addresses on the network.
      const port = (await waitFor(network, /^serve {2}http:\/\/127\.0\.0\.1:(\d+)$/m))[1]!
      await waitFor(network, /with no login: anyone who reaches port \d+ uses this workspace as you/)
      if (networkAddresses().length > 0) expect(network.output()).toContain(`network  http://${networkAddresses()[0]}:${port}/`)
    } finally {
      await network.stop()
    }
    // A name of this machine is taken, and says nothing of the network.
    const local = presmiumProcess(dir, ['serve', '--host', 'localhost', '--port', '0'])
    try {
      await waitFor(local, /^serve {2}http:\/\/localhost:\d+$/m)
      expect(local.output()).not.toContain('no login')
    } finally {
      await local.stop()
    }
  }, 180_000)
})

/** The IR the site of `presmium serve` shows of a document (its dev server's endpoint), as a member asks for it. */
async function siteIR(url: string, dir: string, headers: Record<string, string> = {}): Promise<{ text: string, doc: { diagnostics: { checkId: string, severity: string, message: string }[] } }> {
  const answer = await raw(`${url}/${dir}/@presmium/ir`, { headers })
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

/** A workspace whose document `code` runs Python at compile time (the exec plugin, installed at the root and listed). */
function execWorkspace(prefix: string): string {
  const dir = workspace(prefix, 'exec', { '@presmium/slidev-addon-exec': 'packages/addon-exec' })
  writeFileSync(join(dir, 'presmium.workspace.yaml'), `title: 编译时执行
settings:
  presmium.workspace:
    plugins: ['@presmium/slidev-addon-exec']
  # This case checks the process that runs the code and its HOME, not the process sandbox.
  presmium.deltabox:
    sandbox: false
`)
  return dir
}

/** The recorded runs of the document `code` that printed their environment. */
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
