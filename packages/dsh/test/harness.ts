import { execFileSync, spawn } from 'node:child_process'
import type { ChildProcess } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { PRESMIUM_BIN } from '@lincyaw/cli/testing'
import type { FakeModel } from '../src/node/fake-model.ts'
import { dshBin, launchEnv, launchPatches, writeProfile } from '../src/node/launch.ts'
import type { Carrier } from '../src/node/launch.ts'

export const ROOT = fileURLToPath(new URL('../../..', import.meta.url))
export const PACKAGE = fileURLToPath(new URL('..', import.meta.url)).replace(/\/$/, '')
export const FIXTURES = fileURLToPath(new URL('./fixtures', import.meta.url))
export const DSH = dshBin()

export interface Running {
  child: ChildProcess
  output(): string
  wait(pattern: RegExp, timeoutMs?: number): Promise<RegExpExecArray>
  exited: Promise<number | null>
  stop(): Promise<void>
}

export function running(child: ChildProcess): Running {
  let output = ''
  child.stdout?.on('data', (chunk: Buffer) => output += chunk)
  child.stderr?.on('data', (chunk: Buffer) => output += chunk)
  const exited = new Promise<number | null>(done => child.once('exit', code => done(code)))
  return {
    child,
    output: () => output,
    exited,
    wait(pattern, timeoutMs = 120_000) {
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(`timed out waiting for ${pattern}:\n${output.slice(-4000)}`)), timeoutMs)
        const check = () => {
          const match = pattern.exec(output)
          if (!match) return
          clearTimeout(timer)
          resolve(match)
        }
        child.stdout?.on('data', check)
        child.stderr?.on('data', check)
        void exited.then((code) => {
          clearTimeout(timer)
          const match = pattern.exec(output)
          if (match) resolve(match)
          else reject(new Error(`exited (${code}):\n${output.slice(-4000)}`))
        })
        check()
      })
    },
    async stop() {
      if (child.exitCode !== null || child.signalCode !== null) return
      child.kill('SIGTERM')
      const timer = setTimeout(() => child.kill('SIGKILL'), 20_000)
      await exited
      clearTimeout(timer)
    },
  }
}

export function cleanEnv(): NodeJS.ProcessEnv {
  const out: NodeJS.ProcessEnv = {}
  for (const [name, value] of Object.entries(process.env)) {
    if (['NODE_ENV', 'PORT'].includes(name) || /^(PRESMIUM_|DEEPSEEK_|DSH_|XDG_)/.test(name) || /(?:_KEY|_TOKEN|_SECRET|_PASSWORD|_APPID)$/i.test(name)) continue
    out[name] = value
  }
  return out
}

export interface Row { id: string, disabled: boolean, text: string }

export function rowsOf(dump: string): Map<string, Row> {
  const rows = new Map<string, Row>()
  for (const text of dump.split(/^(?=- )/m).slice(1)) {
    const id = /^- id: (\S+)$/m.exec(text)?.[1]
    if (id) rows.set(id, { id, disabled: /^ {2}disabled: true$/m.test(text), text })
  }
  return rows
}

export interface Workspace {
  dir: string
  read(file: string): string
}

const WORK = join(ROOT, 'e2e/fixtures/regression/.presmium')

export function git(dir: string, args: string[]): string {
  return execFileSync('git', ['-c', 'core.hooksPath=/dev/null', '-c', 'user.name=Test', '-c', 'user.email=test@example.com', '-c', 'commit.gpgSign=false', ...args], { cwd: dir, encoding: 'utf8' })
}

export function workspace(prefix: string, files: Record<string, string>, link: Record<string, string> = {}): Workspace {
  mkdirSync(WORK, { recursive: true })
  const dir = mkdtempSync(join(WORK, `dsh-${prefix}-`))
  for (const [file, text] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, file)), { recursive: true })
    writeFileSync(join(dir, file), text)
  }
  writeFileSync(join(dir, '.gitignore'), 'node_modules/\ndist/\n.presmium/\n')
  writeFileSync(join(dir, 'package.json'), `${JSON.stringify({ name: dir.split('/').at(-1)!.toLowerCase(), private: true, type: 'module' })}\n`)
  for (const [name, path] of Object.entries(link)) {
    mkdirSync(dirname(join(dir, 'node_modules', name)), { recursive: true })
    symlinkSync(path, join(dir, 'node_modules', name), 'junction')
  }
  git(dir, ['init', '-q', '-b', 'main'])
  git(dir, ['add', '-A'])
  git(dir, ['commit', '-q', '-m', 'Initial commit'])
  return { dir, read: file => readFileSync(join(dir, file), 'utf8') }
}

export interface Service {
  url: string
  root: string
  token: string
  mcpToken(): string
  env: Record<string, string>
  process: Running
  stop(): Promise<void>
}

export interface TestHome {
  dir: string
  home: string
  dshHome: string
  env(extra?: Record<string, string | undefined>): NodeJS.ProcessEnv
  profile(carrier: Carrier): string
  dump(carrier: Carrier, options?: { patches?: string[], cwd?: string }): Map<string, Row>
  serve(root: string, extra?: Record<string, string>): Promise<Service>
  headless(cwd: string, prompt: string, options: { model: FakeModel, env?: Record<string, string | undefined>, patches?: string[] }): Running
  acp(cwd: string, options?: { env?: Record<string, string | undefined> }): Promise<{ stderr: string, initialized: unknown }>
  web(cwd: string, port: number, options: { model?: FakeModel, env?: Record<string, string | undefined>, patches?: string[] }): Promise<Web>
  homeEntries(): string[]
  workspace(prefix: string, files: Record<string, string>, link?: Record<string, string>): Workspace
  close(): Promise<void>
}

export interface Web {
  url: string
  launch: string
  process: Running
  api(): Promise<HostApi>
  stop(): Promise<void>
}

export interface HostApi {
  call<T = any>(endpoint: string, args: Record<string, unknown>): Promise<T>
  fetch(path: string, init?: RequestInit): Promise<Response>
}

const carrierProfile = (carrier: Carrier) => `presmium-${carrier}`

export function testHome(prefix: string): TestHome {
  const dir = mkdtempSync(join(tmpdir(), `presmium-dsh-${prefix}-`))
  const home = join(dir, 'home')
  const dshHome = join(dir, 'state', 'presmium', 'dsh-test')
  mkdirSync(home, { recursive: true })
  const processes: Running[] = []
  const workspaces: string[] = []
  const keep = (process: Running) => {
    processes.push(process)
    return process
  }
  const env = (extra: Record<string, string | undefined> = {}): NodeJS.ProcessEnv => {
    const out: NodeJS.ProcessEnv = {
      ...cleanEnv(),
      HOME: home,
      XDG_STATE_HOME: join(dir, 'state'),
      XDG_CACHE_HOME: join(dir, 'cache'),
      XDG_CONFIG_HOME: join(dir, 'config'),
      XDG_DATA_HOME: join(dir, 'data'),
      ...launchEnv(dshHome),
    }
    for (const [name, value] of Object.entries(extra)) {
      if (value === undefined) delete out[name]
      else out[name] = value
    }
    return out
  }
  const profiles = new Set<Carrier>()
  const profile = (carrier: Carrier) => {
    if (!profiles.has(carrier)) writeProfile(dshHome, carrierProfile(carrier), carrier)
    profiles.add(carrier)
    return carrierProfile(carrier)
  }
  const launch = (carrier: Carrier, patches: string[] = []) => ['--profile', profile(carrier), ...[...launchPatches(carrier), ...patches].flatMap(file => ['--patch', file])]
  const modelEnv = (model?: FakeModel) => (model ? { DEEPSEEK_BASE_URL: model.url, DEEPSEEK_API_KEY: 'model-key-96b' } : {})

  return {
    dir,
    home,
    dshHome,
    env,
    profile,
    dump(carrier, options = {}) {
      const output = execFileSync(process.execPath, [DSH, ...launch(carrier, options.patches), '--dump-config'], { cwd: options.cwd ?? dir, env: env(), encoding: 'utf8' })
      return rowsOf(output)
    },
    async serve(root, extra = {}) {
      const token = randomBytes(24).toString('base64url')
      const process_ = keep(running(spawn(process.execPath, [PRESMIUM_BIN, 'serve', root, '--port', '0'], { cwd: root, env: env({ PRESMIUM_SERVICE_TOKEN: token, ...extra }), stdio: ['ignore', 'pipe', 'pipe'] })))
      const url = (await process_.wait(/^serve {2}(http\S+)$/m, 180_000))[1]!
      const stateFile = (await process_.wait(/^mcp {2}\S+ \(its token is in (.+)\)$/m))[1]!
      const workspaceRoot = (await process_.wait(/^workspace {2}(.+)$/m))[1]!.trim()
      return {
        url,
        root: workspaceRoot,
        token,
        mcpToken: () => (JSON.parse(readFileSync(stateFile, 'utf8')) as { token: string }).token,
        env: { PRESMIUM_SERVICE_URL: url, PRESMIUM_SERVICE_TOKEN: token, PRESMIUM_WORKSPACE: workspaceRoot },
        process: process_,
        stop: () => process_.stop(),
      }
    },
    headless(cwd, prompt, options) {
      return keep(running(spawn(process.execPath, [DSH, ...launch('headless', options.patches), prompt], { cwd, env: env({ ...modelEnv(options.model), ...options.env }), stdio: ['ignore', 'pipe', 'pipe'] })))
    },
    async acp(cwd, options = {}) {
      const child = spawn(process.execPath, [DSH, ...launch('acp')], { cwd, env: env(options.env), stdio: ['pipe', 'pipe', 'pipe'] })
      const acp = keep(running(child))
      child.stdin!.write(`${JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: 1, clientCapabilities: {} } })}\n`)
      const line = (await acp.wait(/^\{"jsonrpc":"2\.0","id":1,.*\}$/m))[0]
      child.stdin!.end()
      await Promise.race([acp.exited, new Promise(done => setTimeout(done, 10_000))])
      await acp.stop()
      return { stderr: acp.output().split('\n').filter(text => !text.startsWith('{')).join('\n'), initialized: JSON.parse(line) }
    },
    async web(cwd, port, options) {
      const web = keep(running(spawn(process.execPath, [DSH, ...launch('web', options.patches), '--port', String(port), '--no-open'], { cwd, env: env({ ...modelEnv(options.model), ...options.env }), stdio: ['ignore', 'pipe', 'pipe'] })))
      const launchUrl = (await web.wait(/dsh web: (http\S+)/, 180_000))[1]!
      const url = new URL(launchUrl).origin
      return {
        url,
        launch: launchUrl,
        process: web,
        async api() {
          const token = new URL(launchUrl).searchParams.get('token')!
          const connected = await fetch(`${url}/connect?token=${encodeURIComponent(token)}&interactions=none`, { redirect: 'manual' })
          const cookie = connected.headers.getSetCookie().map(c => c.split(';', 1)[0]).join('; ')
          if (connected.status !== 302 || !cookie) throw new Error(`connect answered ${connected.status}: ${await connected.text()}`)
          const headers = { cookie, origin: url }
          return {
            async call(endpoint, args) {
              const response = await fetch(`${url}/api/${endpoint}`, { method: 'POST', headers: { ...headers, 'content-type': 'application/json' }, body: JSON.stringify({ type: 'client-request', rpcId: randomBytes(8).toString('hex'), method: endpoint, payload: { args } }) })
              if (!response.ok) throw new Error(`${endpoint} answered ${response.status}: ${await response.text()}`)
              const envelope = await response.json() as { result: { ok: boolean, value?: unknown, error?: { code: string, message: string } } }
              if (!envelope.result.ok) throw new Error(`${endpoint}: ${envelope.result.error?.code} ${envelope.result.error?.message}`)
              return envelope.result.value as never
            },
            fetch: (path, init = {}) => fetch(`${url}${path}`, { ...init, headers: { ...headers, ...init.headers as Record<string, string> } }),
          }
        },
        stop: () => web.stop(),
      }
    },
    homeEntries() {
      return existsSync(home) ? readdirSync(home) : []
    },
    workspace(prefix, files, link) {
      const made = workspace(prefix, files, link)
      workspaces.push(made.dir)
      return made
    },
    async close() {
      for (const process_ of processes.reverse()) await process_.stop()
      for (const path of [dir, ...workspaces]) rmSync(path, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 })
    },
  }
}

export function toolResults(model: FakeModel): string[] {
  return model.received.filter(r => r.path.endsWith('/v1/messages')).flatMap((r) => {
    const last = (r.body.messages as { content: unknown }[] | undefined)?.at(-1)
    return (Array.isArray(last?.content) ? last.content as { type: string, content: unknown }[] : []).filter(c => c.type === 'tool_result').map(c => (typeof c.content === 'string' ? c.content : JSON.stringify(c.content)))
  })
}

export function turns(model: FakeModel): Record<string, any>[] {
  return model.received.filter(r => r.path.endsWith('/v1/messages') && Array.isArray(r.body.tools) && r.body.tools.length > 0).map(r => r.body)
}
