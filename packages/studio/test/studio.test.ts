import { execFileSync, spawn } from 'node:child_process'
import type { ChildProcess } from 'node:child_process'
import { randomBytes, randomUUID } from 'node:crypto'
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { networkInterfaces, tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from '@playwright/test'
import { fakeModel, run } from '@lincyaw/cli/testing'
import type { FakeModel } from '@lincyaw/cli/testing'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const ROOT = fileURLToPath(new URL('../../..', import.meta.url))
const STUDIO_BIN = fileURLToPath(new URL('../bin/presmium-studio.mjs', import.meta.url))
const CONSUMER = join(ROOT, 'e2e/fixtures/consumer')

interface Home {
  dir: string
  home: string
  dshHome: string
  env(extra?: Record<string, string>): NodeJS.ProcessEnv
  close(): void
}

function shellEnv(): NodeJS.ProcessEnv {
  const out: NodeJS.ProcessEnv = {}
  for (const [name, value] of Object.entries(process.env)) {
    if (['NODE_ENV', 'PORT', 'INIT_CWD', 'VITEST', 'VITEST_WORKER_ID', 'VITEST_POOL_ID', 'TEST'].includes(name) || /^(?:PRESMIUM_|DEEPSEEK_|DSH_|XDG_|npm_|pnpm_)/i.test(name) || /(?:_KEY|_TOKEN|_SECRET|_PASSWORD)$/i.test(name)) continue
    out[name] = value
  }
  return out
}

function testHome(prefix: string): Home {
  const dir = mkdtempSync(join(tmpdir(), `presmium-studio-${prefix}-`))
  const home = join(dir, 'home')
  mkdirSync(home)
  return {
    dir,
    home,
    dshHome: join(dir, 'state', 'presmium', 'studio'),
    env: (extra = {}) => ({ ...shellEnv(), HOME: home, XDG_STATE_HOME: join(dir, 'state'), XDG_CACHE_HOME: join(dir, 'cache'), XDG_CONFIG_HOME: join(dir, 'config'), XDG_DATA_HOME: join(dir, 'data'), ...extra }),
    close: () => rmSync(dir, { recursive: true, force: true }),
  }
}

function git(dir: string, args: string[]): void {
  execFileSync('git', ['-c', 'core.hooksPath=/dev/null', '-c', 'user.name=Test', '-c', 'user.email=test@example.com', '-c', 'commit.gpgSign=false', ...args], { cwd: dir })
}

function repository(files: Record<string, string>, under = join(ROOT, 'e2e/fixtures/regression/.presmium')): string {
  mkdirSync(under, { recursive: true })
  const dir = mkdtempSync(join(under, 'studio-'))
  for (const [file, text] of Object.entries({ ...files, '.gitignore': 'node_modules/\ndist/\n.presmium/\n' })) {
    mkdirSync(dirname(join(dir, file)), { recursive: true })
    writeFileSync(join(dir, file), text)
  }
  git(dir, ['init', '-q', '-b', 'main'])
  git(dir, ['add', '-A'])
  git(dir, ['commit', '-q', '-m', 'Initial commit'])
  return dir
}

const TWO_DOCUMENTS = {
  'presmium.workspace.yaml': 'title: Two lectures\ndocuments: [lectures/*/lecture.md]\n',
  'lectures/alpha/lecture.md': '---\ntitle: Alpha\nlang: en\n---\n\n# Alpha\n\n(alpha-one)=\n## The first section of alpha\n\nText.\n',
  'lectures/beta/lecture.md': '---\ntitle: Beta\nlang: en\n---\n\n# Beta\n\n(beta-one)=\n## The first section of beta\n\nText.\n',
}

interface Running {
  child: ChildProcess
  url: string
  stdout(): string
  stderr(): string
  exited: Promise<number | null>
  stop(): Promise<number | null>
}

async function studio(args: string[], options: { cwd?: string, env: NodeJS.ProcessEnv }): Promise<Running> {
  const child = spawn(process.execPath, args, { cwd: options.cwd ?? ROOT, env: options.env, stdio: ['ignore', 'pipe', 'pipe'] })
  let stdout = ''
  let stderr = ''
  child.stdout.on('data', (chunk: Buffer) => stdout += chunk)
  child.stderr.on('data', (chunk: Buffer) => stderr += chunk)
  const exited = new Promise<number | null>(done => child.once('exit', code => done(code)))
  const stop = async () => {
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGTERM')
    return exited
  }
  const url = await new Promise<string>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`presmium studio printed no address:\n${stdout}\n${stderr}`)), 300_000)
    child.stdout.on('data', () => {
      const found = /^studio {2}(http\S+)$/m.exec(stdout)?.[1]
      if (found) {
        clearTimeout(timer)
        resolve(found)
      }
    })
    void exited.then((code) => {
      clearTimeout(timer)
      reject(new Error(`presmium studio exited (${code}):\n${stdout}\n${stderr}`))
    })
  }).catch(async (error: unknown) => {
    await stop()
    throw error
  })
  return { child, url, stdout: () => stdout, stderr: () => stderr, exited, stop }
}

interface HostApi {
  call<T = any>(endpoint: string, args: Record<string, unknown>): Promise<T>
  fetch(path: string, init?: RequestInit): Promise<Response>
  cookie: string
}

async function hostApi(launch: string): Promise<HostApi> {
  const { origin, searchParams } = new URL(launch)
  const connected = await fetch(`${origin}/connect?token=${encodeURIComponent(searchParams.get('token')!)}&interactions=none`, { redirect: 'manual' })
  const cookie = connected.headers.getSetCookie().map(c => c.split(';', 1)[0]).join('; ')
  if (connected.status !== 302 || !cookie) throw new Error(`connect answered ${connected.status}: ${await connected.text()}`)
  return {
    cookie,
    async call(endpoint, args) {
      const response = await fetch(`${origin}/api/${endpoint}`, { method: 'POST', headers: { cookie, origin, 'content-type': 'application/json' }, body: JSON.stringify({ type: 'client-request', rpcId: randomBytes(8).toString('hex'), method: endpoint, payload: { args } }) })
      if (!response.ok) throw new Error(`${endpoint} answered ${response.status}: ${await response.text()}`)
      const envelope = await response.json() as { result: { ok: boolean, value?: unknown, error?: { code: string, message: string } } }
      if (!envelope.result.ok) throw new Error(`${endpoint}: ${envelope.result.error?.code} ${envelope.result.error?.message}`)
      return envelope.result.value as never
    },
    fetch: (path, init = {}) => fetch(`${origin}${path}`, { ...init, headers: { cookie, ...init.headers as Record<string, string> } }),
  }
}

interface Proc { pid: number, ppid: number, cmdline: string }

function descendants(pid: number): Proc[] {
  const all = execFileSync('ps', ['-ww', '-axo', 'pid=,ppid=,args='], { encoding: 'utf8' }).split('\n').flatMap((line) => {
    const match = /^\s*(\d+)\s+(\d+)\s+(.*)$/.exec(line)
    return match ? [{ pid: Number(match[1]), ppid: Number(match[2]), cmdline: match[3]! }] : []
  })
  const out: Proc[] = []
  const walk = (parent: number) => {
    for (const child of all.filter(proc => proc.ppid === parent)) {
      out.push(child)
      walk(child.pid)
    }
  }
  walk(pid)
  return out
}

function environ(pid: number): Record<string, string> {
  return Object.fromEntries(readFileSync(`/proc/${pid}/environ`, 'utf8').split('\0').filter(Boolean).map((entry) => {
    const at = entry.indexOf('=')
    return [entry.slice(0, at), entry.slice(at + 1)]
  }))
}

const alive = (pid: number) => {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

function lanAddress(): string | undefined {
  return Object.values(networkInterfaces()).flat().find(net => net && net.family === 'IPv4' && !net.internal)?.address
}

describe('presmium studio installed from the packed packages', () => {
  let project: string
  let home: Home
  beforeAll(async () => {
    home = testHome('consumer')
    project = mkdtempSync(join(tmpdir(), 'presmium-studio-consumer-'))
    const env: NodeJS.ProcessEnv = { ...process.env }
    for (const name of Object.keys(env)) if (/^(?:npm|pnpm)_/i.test(name) || ['NODE_ENV', 'INIT_CWD', 'VITEST', 'VITEST_WORKER_ID', 'VITEST_POOL_ID', 'TEST'].includes(name)) delete env[name]
    const made = await run(process.execPath, [join(ROOT, 'scripts/consumer.ts'), project, '--studio'], { env })
    expect(made.code, made.stdout + made.stderr).toBe(0)
  }, 1_200_000)
  afterAll(() => {
    if (project) rmSync(project, { recursive: true, force: true })
    home?.close()
  }, 120_000)

  it('prints one address, which opens the workbench (P-125, P-141)', async () => {
    const ws = join(project, 'ws')
    mkdirSync(join(ws, 'intro'), { recursive: true })
    cpSync(join(CONSUMER, 'deck/lecture.md'), join(ws, 'intro/lecture.md'))
    writeFileSync(join(ws, 'presmium.workspace.yaml'), 'title: Consumer workspace\ndocuments: [\'*/lecture.md\']\n')
    git(ws, ['init', '-q', '-b', 'main'])
    const running = await studio([join(project, 'node_modules/@lincyaw/presmium/bin/presmium.mjs'), 'studio', 'ws', '--port', '5666'], { cwd: project, env: home.env() })
    const browser = await chromium.launch()
    try {
      expect(running.stdout()).toBe(`studio  ${running.url}\n`)
      expect(running.url).toMatch(/^http:\/\/127\.0\.0\.1:5666\/\?token=\S+$/)
      const page = await browser.newPage()
      const errors: string[] = []
      page.on('pageerror', error => errors.push(error.message))
      await page.goto(running.url)
      await expect.poll(() => page.url()).toBe('http://127.0.0.1:5666/')
      await page.locator('#root > *').first().waitFor({ timeout: 120_000 })
      const documents = await page.evaluate(async () => (await fetch('/api/presmium/documents')).json() as Promise<{ documents: { dir: string, title: string }[] }>)
      expect(documents.documents).toEqual([{ dir: 'intro', title: 'Installed from tarballs', lang: 'en' }])
      expect(errors).toEqual([])
    } finally {
      await browser.close()
      expect(await running.stop()).toBe(0)
    }
    expect(running.stderr()).toBe('')
  }, 600_000)
})

describe('presmium studio in a fresh home, with the model of the environment', () => {
  let home: Home
  let ws: string
  let model: FakeModel
  let running: Running
  let api: HostApi
  beforeAll(async () => {
    home = testHome('fresh')
    ws = repository(TWO_DOCUMENTS)
    model = await fakeModel([{ text: 'It has one section.' }])
    running = await studio([STUDIO_BIN, ws, '--port', '5663'], { env: home.env({ PRESMIUM_MODEL_URL: model.url, PRESMIUM_MODEL_KEY: 'model-key-96f', PRESMIUM_MODEL_PROVIDER: 'Fake' }) })
    api = await hostApi(running.url)
  }, 360_000)
  afterAll(async () => {
    expect(await running?.stop()).toBe(0)
    await model?.close()
    home?.close()
    if (ws) rmSync(ws, { recursive: true, force: true })
  })

  it('runs the first session at the workspace root, with nothing under ~/Documents or outside the test\'s directory', async () => {
    expect(await api.call('workspace/initializeDefault', {})).toBeUndefined()
    expect(await api.call('workspace/create', { request: { path: ws } })).toMatchObject({ created: false })
    const { sessionId } = await api.call<{ sessionId: string }>('session/create', { request: { cwd: ws } })
    expect((await api.fetch('/api/presmium/context', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ session: sessionId, document: 'lectures/alpha' }) })).status).toBe(200)
    await api.call('session/prompt', { request: { requestId: randomUUID(), sessionId, mode: 'queue', content: [{ type: 'text', text: 'What sections does this lecture have?' }] } })
    await expect.poll(() => model.received.filter(r => r.headers['x-deepseek-harness-session-id'] === sessionId && Array.isArray(r.body.tools) && r.body.tools.length > 0).length, { timeout: 120_000 }).toBeGreaterThan(0)
    const turn = model.received.find(r => r.headers['x-deepseek-harness-session-id'] === sessionId && Array.isArray(r.body.tools) && r.body.tools.length > 0)!
    const context = /<presmium-document>([\s\S]*?)<\/presmium-document>/.exec(JSON.stringify(turn.body.messages))?.[1] ?? ''
    expect(context).toContain('Document \\"lectures/alpha\\"')
    expect(context).toContain('alpha-one')
    expect(turn.body.tools.map((tool: { name: string }) => tool.name)).toContain('presmium__list_sections')
    expect(readdirSync(home.home)).toEqual([])
    expect(existsSync(join(home.dshHome, 'profiles', 'presmium-studio', 'package.json'))).toBe(true)
    expect(existsSync(join(home.dshHome, 'documents'))).toBe(false)
    for (const entry of readdirSync(home.dir)) expect(['home', 'state', 'cache', 'config', 'data']).toContain(entry)
  }, 240_000)

  it('gives DeepSeek Harness the model\'s address and key of the environment', async () => {
    await expect.poll(() => model.received.filter(r => r.path.endsWith('/v1/messages')).length, { timeout: 120_000 }).toBeGreaterThan(0)
    for (const request of model.received.filter(r => r.path.endsWith('/v1/messages'))) expect(request.headers['x-api-key']).toBe('model-key-96f')
  }, 180_000)

  it('answers a request from a foreign origin with 403, at the workbench and at the previews', async () => {
    const { origin } = new URL(running.url)
    expect((await api.fetch('/api/presmium/documents')).status).toBe(200)
    expect((await api.fetch('/api/presmium/documents', { headers: { origin: 'http://evil.example' } })).status).toBe(403)
    expect((await fetch(`${origin}/api/session/list`, { method: 'POST', headers: { cookie: api.cookie, origin: 'http://evil.example', 'content-type': 'application/json' }, body: '{}' })).status).toBe(403)
    const preview = await (await api.fetch('/api/presmium/preview?document=lectures/beta')).json() as { web: string }
    const page = await fetch(preview.web)
    expect(page.status).toBe(200)
    expect(page.headers.get('content-security-policy')).toBe(`frame-ancestors ${origin} http://localhost:5663`)
    expect((await fetch(preview.web, { headers: { origin: 'http://evil.example' } })).status).toBe(403)
    expect((await fetch(`${new URL(preview.web).origin}/__presmium/presmium.workspace/documents`)).status).toBe(401)
  }, 180_000)
})

describe('presmium studio on the local network', () => {
  const lan = lanAddress()
  let home: Home
  let ws: string
  afterAll(() => {
    home?.close()
    if (ws) rmSync(ws, { recursive: true, force: true })
  })

  it.skipIf(!lan)(`is used at the address on the local network with --host${lan ? '' : ' (skipped: this machine has no address on a local network)'}`, async () => {
    home = testHome('lan')
    ws = repository(TWO_DOCUMENTS)
    const running = await studio([STUDIO_BIN, ws, '--host', lan!, '--port', '5665'], { env: home.env() })
    try {
      expect(running.url).toMatch(new RegExp(`^http://${lan!.replaceAll('.', '\\.')}:5665/\\?token=`))
      await expect.poll(() => running.stderr()).toContain('with no login')
      const api = await hostApi(running.url)
      const listed = await api.fetch('/api/presmium/documents')
      expect(listed.status).toBe(200)
      expect((await listed.json() as { documents: { dir: string }[] }).documents.map(doc => doc.dir)).toEqual(['lectures/alpha', 'lectures/beta'])
      const preview = await (await api.fetch('/api/presmium/preview?document=lectures/alpha')).json() as { web: string }
      expect(new URL(preview.web).hostname).toBe(lan)
      const page = await fetch(preview.web, { headers: { origin: `http://${lan}:5665` } })
      expect(page.status).toBe(200)
      expect(page.headers.get('content-security-policy')).toBe(`frame-ancestors http://${lan}:5665`)
    } finally {
      expect(await running.stop()).toBe(0)
    }
  }, 360_000)
})

describe('presmium studio\'s processes', () => {
  let home: Home
  let ws: string
  afterAll(() => {
    home?.close()
    if (ws) rmSync(ws, { recursive: true, force: true })
  })

  it.skipIf(process.platform === 'win32')('keeps the model\'s key out of the workspace service, and leaves no process after kill -9 of the launcher', async () => {
    home = testHome('kill')
    ws = repository(TWO_DOCUMENTS)
    const running = await studio([STUDIO_BIN, ws, '--port', '5664'], { env: home.env({ DEEPSEEK_API_KEY: 'deepseek-key-96f', DEEPSEEK_BASE_URL: 'http://127.0.0.1:9/elsewhere' }) })
    try {
      const api = await hostApi(running.url)
      const preview = await (await api.fetch('/api/presmium/preview?document=lectures/alpha')).json() as { web: string, slides?: string }
      for (const url of [preview.web, ...preview.slides ? [preview.slides] : []]) expect((await fetch(url)).status, url).toBe(200)
      const started = descendants(running.child.pid!)
      expect(started.filter(proc => proc.cmdline.includes('watchdog.mjs'))).toHaveLength(2)
      const serve = started.find(proc => / serve /.test(proc.cmdline) && !proc.cmdline.includes('watchdog.mjs'))!
      const dsh = started.find(proc => /dsh\/lib\/bin\.js/.test(proc.cmdline) && !proc.cmdline.includes('watchdog.mjs'))!
      if (process.platform === 'linux') {
        expect(environ(dsh.pid)).toMatchObject({ DEEPSEEK_API_KEY: 'deepseek-key-96f', DSH_HOME: home.dshHome, PRESMIUM_WORKSPACE: ws })
        expect(environ(dsh.pid).DEEPSEEK_BASE_URL).toBeUndefined()
        const service = environ(serve.pid)
        expect(service.PRESMIUM_SERVICE_TOKEN).toBe(environ(dsh.pid).PRESMIUM_SERVICE_TOKEN)
        expect(Object.keys(service).filter(name => /^(?:DEEPSEEK_|DSH_)/.test(name))).toEqual([])
      } else {
        console.info('Skipping child-environment inspection: Linux /proc/<pid>/environ is required; preview HTTP responses and process cleanup are still checked.')
      }

      process.kill(running.child.pid!, 'SIGKILL')
      await running.exited
      await expect.poll(() => started.map(proc => proc.pid).filter(alive), { timeout: 30_000 }).toEqual([])
    } finally {
      await running.stop()
    }
  }, 360_000)
})
