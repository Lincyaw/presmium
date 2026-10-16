// `presmium serve` (WP-79, docs/architecture.md section 10): one command starts the workspace service;
// beyond this machine only behind a login proxy; with one (SHARED) members come from the proxy, editors
// change documents and readers cannot, and a single-deck repository is refused. Plugins come from the
// operator only (D14). In SHARED mode serve runs none of the decks' code: the site's dev servers (and a
// data loader of a deck's component) run in agent-host, whose process chain holds no secret; symbolic
// links out of the workspace are not read; code without a recording runs by `settings.presmium.exec.compile`.
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Child, SharedSetup } from './serve-helpers.ts'
import { cleanEnv, descendants, eventStream, exited, FIXTURES, presmiumProcess, raw, remove, shared, waitFor, workspace } from './serve-helpers.ts'

describe('presmium serve on this machine (LOCAL)', () => {
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
    serve = presmiumProcess(dir, ['serve', '--port', '0'])
    const url = (await waitFor(serve, /^serve {2}(http:\/\/127\.0\.0\.1:\d+)$/m))[1]!
    expect(serve.output()).toMatch(/^mode {2}local$/m)
    const documents = await raw(`${url}/__presmium/presmium.workspace/documents`)
    expect(documents.json()).toMatchObject({ documents: [{ dir: 'intro', title: '导论' }], git: true, single: false })
    const home = await raw(`${url}/`)
    expect(home.status).toBe(200)
    expect(home.text).toContain('<div id="app">')
  }, 180_000)

  it('refuses to listen beyond this machine without a login proxy', async () => {
    const refused = presmiumProcess(dir, ['serve', '--host', '0.0.0.0', '--port', '0'])
    expect(await exited(refused)).toBe(2)
    expect(refused.output()).toMatch(/only behind a login proxy: set PRESMIUM_PROXY_SECRET/)
  })
})

describe('presmium serve with a login proxy (SHARED)', () => {
  let dir: string
  let setup: SharedSetup
  beforeAll(async () => {
    dir = workspace('shared', 'basic')
    setup = await shared(dir)
  }, 180_000)
  afterAll(async () => {
    await setup?.stop()
    remove(dir)
  }, 60_000)

  it('lets an editor create a document; a reader gets 403; requests without the proxy\'s secret are refused', async () => {
    expect(setup.serve.output()).toMatch(/^mode {2}shared$/m)
    const route = `${setup.url}/__presmium/presmium.workspace/documents`
    const create = { op: 'create', dir: 'week2', title: '第二周' }
    expect((await raw(route, { json: create, headers: setup.as('reader@test') })).status).toBe(403)
    expect((await raw(route, { json: create, headers: { Host: new URL(setup.url).host, 'X-Forwarded-Email': 'editor@test' } })).status).toBe(403)
    const created = await raw(route, { json: create, headers: setup.as('editor@test') })
    expect(created.status).toBe(200)
    expect(readFileSync(join(dir, 'week2/lecture.md'), 'utf8')).toContain('第二周')
    const listed = await raw(route, { headers: setup.as('reader@test') })
    expect(listed.json<{ documents: { dir: string }[] }>().documents.map(doc => doc.dir)).toEqual(['intro', 'week2'])
  })

  it('refuses a single-deck repository, and says why', async () => {
    const single = workspace('single', 'single')
    try {
      const refused = presmiumProcess(single, ['serve', '--port', '0'], cleanEnv({
        PRESMIUM_PROXY_SECRET: 'secret',
        PRESMIUM_GATEWAY_URL: 'http://127.0.0.1:1',
        PRESMIUM_GATEWAY_TOKEN: 'gateway',
        PRESMIUM_AGENT_HOST_URL: 'http://127.0.0.1:1',
        PRESMIUM_AGENT_HOST_TOKEN: 'agent-host',
        PRESMIUM_CONSOLE_HOST: 'console.test',
      }))
      expect(await exited(refused)).toBe(2)
      expect(refused.output()).toMatch(/single-deck repository[\s\S]*supports only workspaces whose documents are in subdirectories/)
    } finally {
      remove(single)
    }
  })
})

/** The IR the site of `presmium serve` shows of a document (its dev server's endpoint), as a member asks for it. */
async function siteIR(url: string, dir: string, headers: Record<string, string> = {}): Promise<{ text: string, doc: { diagnostics: { checkId: string, severity: string, message: string }[] } }> {
  const answer = await raw(`${url}/${dir}/@presmium/ir`, { headers })
  expect(answer.status, answer.text).toBe(200)
  return { text: answer.text, doc: answer.json<{ doc: { diagnostics: { checkId: string, severity: string, message: string }[] } }>().doc }
}

describe('the plugins of presmium serve come from the operator (D14)', () => {
  const dirs: string[] = []
  const serves: Child[] = []
  afterAll(async () => {
    await Promise.all(serves.map(serve => serve.stop()))
    dirs.forEach(remove)
  }, 60_000)
  const start = async (dir: string) => {
    const serve = presmiumProcess(dir, ['serve', '--port', '0'])
    serves.push(serve)
    return (await waitFor(serve, /^serve {2}(http\S+)$/m))[1]!
  }

  it('refuses the deck\'s relative plugin, the plugin only in its node_modules and its relative renderer: three errors, none loaded', async () => {
    const dir = workspace('policy', 'policy')
    dirs.push(dir)
    cpSync(join(FIXTURES, 'plugins/presmium-fixture-deckonly'), join(dir, 'doc/node_modules/presmium-fixture-deckonly'), { recursive: true })
    const url = await start(dir)
    const { doc } = await siteIR(url, 'doc')
    const refused = doc.diagnostics.filter(d => d.checkId === 'presmium.plugins' && d.severity === 'error').map(d => d.message)
    expect(refused).toHaveLength(3)
    expect(refused).toEqual(expect.arrayContaining([
      expect.stringMatching(/plugin "\.\/relative" is not loaded: a path is not a package/),
      expect.stringMatching(/plugin "presmium-fixture-deckonly" is not loaded: it is not listed/),
      expect.stringMatching(/plugin "\.\/renderer" is not loaded: a path is not a package/),
    ]))
    for (const marker of ['doc/relative/loaded', 'doc/node_modules/presmium-fixture-deckonly/loaded', 'doc/renderer/loaded']) expect(existsSync(join(dir, marker)), marker).toBe(false)
  }, 180_000)

  it('loads the same package installed at the workspace root and listed in settings.presmium.workspace.plugins', async () => {
    const dir = workspace('policy-listed', 'policy')
    dirs.push(dir)
    cpSync(join(FIXTURES, 'plugins/presmium-fixture-deckonly'), join(dir, 'node_modules/presmium-fixture-deckonly'), { recursive: true })
    writeFileSync(join(dir, 'presmium.workspace.yaml'), 'title: 插件来源测试\nsettings:\n  presmium.workspace:\n    plugins: [presmium-fixture-deckonly]\n')
    const url = await start(dir)
    const { doc } = await siteIR(url, 'doc')
    expect(doc.diagnostics.filter(d => d.checkId === 'presmium.plugins' && d.message.includes('presmium-fixture-deckonly'))).toEqual([])
    expect(existsSync(join(dir, 'node_modules/presmium-fixture-deckonly/loaded'))).toBe(true)
    expect(existsSync(join(dir, 'doc/relative/loaded'))).toBe(false)
  }, 180_000)
})

/** A data loader of the deck's component: it writes where it runs, its process and its parents with their environments. */
function probeLoader(marker: string): string {
  return `import { readFileSync, writeFileSync } from 'node:fs'

function info(pid: number) {
  const stat = readFileSync(\`/proc/\${pid}/stat\`, 'utf8')
  return {
    pid,
    ppid: Number(stat.slice(stat.lastIndexOf(')') + 2).split(' ')[1]),
    cmdline: readFileSync(\`/proc/\${pid}/cmdline\`, 'utf8').replaceAll('\\0', ' '),
    environ: readFileSync(\`/proc/\${pid}/environ\`, 'utf8'),
  }
}

export default {
  load() {
    const chain = []
    for (let pid = process.pid; pid > 1;) {
      try {
        const found = info(pid)
        chain.push(found)
        pid = found.ppid
      } catch {
        break
      }
    }
    writeFileSync(${JSON.stringify(marker)}, JSON.stringify(chain))
    return { pid: process.pid }
  },
}
`
}

describe('SHARED: serve runs none of the deck\'s code and reads only the workspace', () => {
  let dir: string
  let outside: string
  let setup: SharedSetup
  const sentinel = `sentinel-${Math.random().toString(36).slice(2)}`
  beforeAll(async () => {
    dir = workspace('probe', 'probe')
    writeFileSync(join(dir, 'probe/components/probe.data.ts'), probeLoader(join(dir, 'probe-marker.json')))
    // A symbolic link in the document to a file outside the workspace.
    outside = join(dir, '..', `outside-${sentinel}`)
    mkdirSync(outside, { recursive: true })
    writeFileSync(join(outside, 'secret.txt'), `${sentinel}\n`)
    symlinkSync(join(outside, 'secret.txt'), join(dir, 'probe/secret.txt'))
    setup = await shared(dir)
  }, 180_000)
  afterAll(async () => {
    await setup?.stop()
    remove(dir)
    remove(outside)
  }, 60_000)

  it('runs the data loader of the deck\'s component in agent-host, whose process chain holds no secret; serve starts no VitePress', async () => {
    const editor = setup.as('editor@test')
    expect((await raw(`${setup.url}/probe/`, { headers: editor })).status).toBe(200)
    // The page's component imports its data loader: the browser asks the dev server for it, as here.
    const loader = await raw(`${setup.url}/probe/@fs${join(dir, 'probe/components/probe.data.ts')}`, { headers: editor })
    expect(loader.status, loader.text).toBe(200)
    const chain = JSON.parse(readFileSync(join(dir, 'probe-marker.json'), 'utf8')) as { pid: number, cmdline: string, environ: string }[]
    expect(chain.some(p => p.pid === setup.agentHost.pid && p.cmdline.includes('agent-host'))).toBe(true)
    expect(chain.some(p => p.pid === setup.serve.pid)).toBe(false)
    for (const process of chain) {
      expect(process.environ).not.toContain(setup.secrets.proxySecret)
      expect(process.environ).not.toContain(setup.secrets.gatewayToken)
    }
    expect(descendants(setup.serve.pid).filter(cmdline => cmdline.includes('vitepress'))).toEqual([])
    expect(descendants(setup.agentHost.pid).some(cmdline => cmdline.includes('vitepress'))).toBe(true)
  }, 180_000)

  it('does not read a symbolic link that leaves the workspace', async () => {
    const editor = setup.as('editor@test')
    const { text, doc } = await siteIR(setup.url, 'probe', editor)
    expect(doc.diagnostics).toEqual(expect.arrayContaining([expect.objectContaining({ checkId: 'presmium.files', severity: 'error' })]))
    expect(text).not.toContain(sentinel)
    expect((await raw(`${setup.url}/probe/`, { headers: editor })).text).not.toContain(sentinel)
  }, 120_000)
})

/** A workspace whose document `code` runs Python at compile time (the exec plugin, installed at the root and listed). */
function execWorkspace(prefix: string, compile?: string): string {
  const dir = workspace(prefix, 'exec', { '@presmium/slidev-addon-exec': 'packages/addon-exec' })
  writeFileSync(join(dir, 'presmium.workspace.yaml'), `title: 编译时执行
members:
  owners: [owner@test]
  editors: [editor@test]
settings:
  presmium.workspace:
    plugins: ['@presmium/slidev-addon-exec']
  # These cases check the process that runs the code (serve or agent-host) and its HOME, not the process sandbox.
  presmium.deltabox:
    sandbox: false
${compile ? `  presmium.exec:\n    compile: ${compile}\n` : ''}`)
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

const settle = (ms: number) => new Promise(done => setTimeout(done, ms))

describe('compile-time execution in presmium serve (N-08, settings.presmium.exec.compile)', () => {
  const cleanups: (() => Promise<void> | void)[] = []
  afterAll(async () => {
    for (const cleanup of cleanups.reverse()) await cleanup()
  }, 120_000)

  it('SHARED, approve: the owner console alone is asked; a denial is not asked again; on request and allow the code runs in agent-host with the allowlisted environment', async () => {
    const dir = execWorkspace('exec-approve')
    // serve's python3 says what it was asked to run: never the deck's code.
    const shim = join(dir, '..', `${dir.split('/').at(-1)}-shim`)
    mkdirSync(shim, { recursive: true })
    const python = (process.env.PATH ?? '').split(':').map(path => join(path, 'python3')).find(existsSync) ?? '/usr/bin/python3'
    writeFileSync(join(shim, 'python3'), `#!/bin/sh\nprintf '%s\\n' "$*" >> "${join(shim, 'calls.log')}"\nexec "${python}" "$@"\n`, { mode: 0o755 })
    const setup = await shared(dir, { serveEnv: { PATH: `${shim}:${process.env.PATH}` } })
    cleanups.push(() => setup.stop(), () => remove(dir), () => remove(shim))
    const port = new URL(setup.url).port
    const editor = setup.as('editor@test')
    const inCode = { ...editor, 'Presmium-Document': 'code' }
    const consoleChannel = await eventStream(`${setup.url}/__presmium/presmium.server/control?window=console&console=1`, setup.as('owner@test', 'console'))
    const ownerSite = await eventStream(`${setup.url}/__presmium/presmium.server/control?window=owner&document=code`, setup.as('owner@test'))
    const editorSite = await eventStream(`${setup.url}/__presmium/presmium.server/control?window=editor&document=code`, editor)
    const answer = (id: unknown, allow: boolean) => raw(`${setup.url}/__presmium/presmium.server/control`, {
      json: { window: 'console', type: 'answer', id, allow },
      headers: { ...setup.as('owner@test', 'console'), 'Origin': `http://console.test:${port}`, 'Presmium-Console': '1' },
    })

    // The editor opens the document: it shows without running, and the owner console is asked.
    expect((await raw(`${setup.url}/code/`, { headers: editor })).status).toBe(200)
    const asked = await consoleChannel.next('approval') as { id: string, request: { kind: string, scope: string, detail: string } }
    expect(asked.request).toMatchObject({ kind: 'operate', scope: 'workspace' })
    expect(asked.request.detail).toContain('print(\'PARENT \'')
    expect(await ownerSite.next('pending')).toMatchObject({ count: 1 })
    expect(editorSite.events.filter(e => e.event === 'approval')).toEqual([])
    expect(ownerSite.events.filter(e => e.event === 'approval')).toEqual([])
    expect((await raw(`${setup.url}/__presmium/presmium.workspace/execution`, { headers: inCode })).json()).toMatchObject({ mode: 'approve', pending: true, notRun: [expect.stringContaining('#')] })
    expect((await siteIR(setup.url, 'code', editor)).text).toContain('这是预先录制的输出')

    // Denied: opening it again, as an editor or a reader, and an edit of its prose ask nothing.
    expect((await answer(asked.id, false)).status).toBe(200)
    await raw(`${setup.url}/code/`, { headers: editor })
    await raw(`${setup.url}/code/`, { headers: setup.as('reader@test') })
    const lecture = join(dir, 'code/lecture.md')
    writeFileSync(lecture, readFileSync(lecture, 'utf8').replace('这段代码没有录制', '这段代码仍然没有录制'))
    await until(async () => (await siteIR(setup.url, 'code', editor)).text.includes('仍然没有录制'))
    await settle(1500)
    expect(consoleChannel.events.filter(e => e.event === 'approval')).toHaveLength(1)
    expect(recordings(dir)).toEqual([])

    // The editor requests execution; the owner allows; the document compiles again and the code runs in agent-host.
    expect((await raw(`${setup.url}/__presmium/presmium.workspace/execution`, { method: 'POST', json: {}, headers: inCode })).status).toBe(200)
    const again = await consoleChannel.next('approval') as { id: string }
    expect((await answer(again.id, true)).status).toBe(200)
    const [run] = await until(() => recordings(dir).length > 0 ? recordings(dir) : undefined)
    expect(run!.parent).toContain('agent-host')
    // The allowlist, and the matplotlib backend the runner itself sets while it runs.
    expect(Object.keys(run!.env).filter(name => !/^(?:PATH|LANG|LC_\w+|TZ|TMPDIR|HOME|MPLBACKEND)$/.test(name))).toEqual([])
    expect(run!.env.HOME).toMatch(/presmium-home-[0-9a-f]{16}$/)
    expect(JSON.stringify(run!.env)).not.toContain(setup.secrets.proxySecret)
    expect(JSON.stringify(run!.env)).not.toContain(setup.secrets.agentHostToken)
    expect(Object.keys(run!.env)).not.toContain('PRESMIUM_PROXY_SECRET')
    expect(Object.keys(run!.env)).not.toContain('PRESMIUM_AGENT_HOST_TOKEN')
    // serve never ran the deck's code (the runner) with its python3.
    expect(existsSync(join(shim, 'calls.log')) ? readFileSync(join(shim, 'calls.log'), 'utf8') : '').not.toContain('_pm_main')
  }, 300_000)

  it('SHARED, off: nothing runs and nothing is asked; the page shows the :recorded: output', async () => {
    const dir = execWorkspace('exec-off', 'off')
    const setup = await shared(dir)
    cleanups.push(() => setup.stop(), () => remove(dir))
    const editor = setup.as('editor@test')
    const consoleChannel = await eventStream(`${setup.url}/__presmium/presmium.server/control?window=console&console=1`, setup.as('owner@test', 'console'))
    expect((await raw(`${setup.url}/code/`, { headers: editor })).status).toBe(200)
    expect((await siteIR(setup.url, 'code', editor)).text).toContain('这是预先录制的输出')
    expect((await raw(`${setup.url}/__presmium/presmium.workspace/execution`, { headers: { ...editor, 'Presmium-Document': 'code' } })).json()).toMatchObject({ mode: 'off', pending: false })
    await settle(1500)
    expect(consoleChannel.events.filter(e => e.event === 'approval')).toEqual([])
    expect(recordings(dir)).toEqual([])
  }, 300_000)

  it('SHARED, trusted: the code runs in agent-host without asking', async () => {
    const dir = execWorkspace('exec-trusted', 'trusted')
    const setup = await shared(dir)
    cleanups.push(() => setup.stop(), () => remove(dir))
    const consoleChannel = await eventStream(`${setup.url}/__presmium/presmium.server/control?window=console&console=1`, setup.as('owner@test', 'console'))
    expect((await raw(`${setup.url}/code/`, { headers: setup.as('editor@test') })).status).toBe(200)
    const [run] = await until(() => recordings(dir).length > 0 ? recordings(dir) : undefined)
    expect(run!.parent).toContain('agent-host')
    expect(consoleChannel.events.filter(e => e.event === 'approval')).toEqual([])
  }, 300_000)

  it('LOCAL: the code runs in serve without asking', async () => {
    const dir = execWorkspace('exec-local')
    const serve = presmiumProcess(dir, ['serve', '--port', '0'])
    cleanups.push(() => serve.stop(), () => remove(dir))
    const url = (await waitFor(serve, /^serve {2}(http\S+)$/m))[1]!
    expect((await raw(`${url}/code/`)).status).toBe(200)
    const [run] = await until(() => recordings(dir).length > 0 ? recordings(dir) : undefined)
    expect(run!.parent).toMatch(/presmium\.mjs serve/)
    expect(run!.env.HOME).toMatch(/presmium-home-[0-9a-f]{16}$/)
  }, 300_000)
})
