// Real processes for the tests of `presmium serve`: workspaces made in examples/demo/.presmium (ignored
// by git), where VitePress and the plugins resolve from the demo's node_modules, as git repositories of
// their own; `presmium serve`, `presmium gateway` and `presmium agent-host` as separate processes on this
// machine, as the SHARED layout runs them in three containers (docs/architecture.md section 7); requests
// with the headers a login proxy adds (`Host` included, which fetch cannot set).
import { execFileSync, spawn } from 'node:child_process'
import type { ChildProcess } from 'node:child_process'
import { cpSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { request as httpRequest } from 'node:http'
import type { IncomingHttpHeaders, IncomingMessage } from 'node:http'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

export const FIXTURES = fileURLToPath(new URL('./fixtures/serve', import.meta.url))
export const ROOT = fileURLToPath(new URL('../../..', import.meta.url))
export const PRESMIUM_BIN = join(ROOT, 'packages/cli/bin/presmium.mjs')
const WORK = join(ROOT, 'examples/demo/.presmium')

export function git(dir: string, args: string[]): string {
  return execFileSync('git', ['-c', 'core.hooksPath=/dev/null', '-c', 'user.name=Test', '-c', 'user.email=test@example.com', '-c', 'commit.gpgSign=false', ...args], { cwd: dir, encoding: 'utf8' })
}

/** A new workspace with the files of a fixture, packages of the repository linked into its node_modules (installed at the root), committed. */
export function workspace(prefix: string, fixture: string, link: Record<string, string> = {}): string {
  mkdirSync(WORK, { recursive: true })
  const dir = mkdtempSync(join(WORK, `serve-${prefix}-`))
  cpSync(join(FIXTURES, fixture), dir, { recursive: true })
  writeFileSync(join(dir, '.gitignore'), 'node_modules/\ndist/\n.presmium/\n')
  writeFileSync(join(dir, 'package.json'), `${JSON.stringify({ name: dir.split('/').at(-1)!.toLowerCase(), private: true, type: 'module' })}\n`)
  for (const [name, path] of Object.entries(link)) {
    mkdirSync(dirname(join(dir, 'node_modules', name)), { recursive: true })
    symlinkSync(join(ROOT, path), join(dir, 'node_modules', name), 'junction')
  }
  git(dir, ['init', '-q', '-b', 'main'])
  git(dir, ['add', '-A'])
  git(dir, ['commit', '-q', '-m', 'Initial commit'])
  return dir
}

export function remove(dir: string | undefined): void {
  if (dir) rmSync(dir, { recursive: true, force: true })
}

/** The test process's environment without credentials or Presmium's variables, and without Vitest's NODE_ENV. */
export function cleanEnv(extra: Record<string, string> = {}): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env }
  delete env.NODE_ENV
  for (const name of Object.keys(env)) {
    if (name.startsWith('PRESMIUM_') || /(?:_KEY|_TOKEN|_SECRET|_PASSWORD|_APPID)$/i.test(name)) delete env[name]
  }
  return { ...env, ...extra }
}

export interface Child {
  child: ChildProcess
  pid: number
  output: () => string
  stop(): Promise<void>
}

export function presmiumProcess(cwd: string, args: string[], env: NodeJS.ProcessEnv = cleanEnv()): Child {
  const child = spawn(process.execPath, [PRESMIUM_BIN, ...args], { cwd, env, stdio: ['ignore', 'pipe', 'pipe'] })
  let output = ''
  child.stdout.on('data', (chunk: Buffer) => output += chunk)
  child.stderr.on('data', (chunk: Buffer) => output += chunk)
  return {
    child,
    pid: child.pid!,
    output: () => output,
    async stop() {
      if (child.exitCode !== null || child.signalCode !== null) return
      const exited = new Promise(done => child.once('exit', done))
      child.kill('SIGTERM')
      const timer = setTimeout(() => child.kill('SIGKILL'), 20_000)
      await exited
      clearTimeout(timer)
    },
  }
}

/** Waits until the output matches; rejects with the output when the process exits first. */
export function waitFor(child: Child, pattern: RegExp, timeoutMs = 120_000): Promise<RegExpExecArray> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timed out waiting for ${pattern}:\n${child.output()}`)), timeoutMs)
    const check = () => {
      const match = pattern.exec(child.output())
      if (!match) return
      clearTimeout(timer)
      resolve(match)
    }
    child.child.stdout?.on('data', check)
    child.child.stderr?.on('data', check)
    child.child.once('exit', (code) => {
      clearTimeout(timer)
      const match = pattern.exec(child.output())
      if (match) resolve(match)
      else reject(new Error(`exited (${code}):\n${child.output()}`))
    })
    check()
  })
}

/** Resolves with the exit code once the process ends. */
export function exited(child: Child, timeoutMs = 60_000): Promise<number | null> {
  return new Promise((resolve, reject) => {
    if (child.child.exitCode !== null) return resolve(child.child.exitCode)
    const timer = setTimeout(() => reject(new Error(`still running:\n${child.output()}`)), timeoutMs)
    child.child.once('exit', (code) => {
      clearTimeout(timer)
      resolve(code)
    })
  })
}

export interface RawResponse {
  status: number
  headers: IncomingHttpHeaders
  text: string
  json<T = Record<string, unknown>>(): T
}

export function raw(url: string, options: { method?: string, headers?: Record<string, string>, json?: unknown, timeoutMs?: number } = {}): Promise<RawResponse> {
  return new Promise((resolve, reject) => {
    const body = options.json === undefined ? undefined : JSON.stringify(options.json)
    const headers = { ...options.headers, ...body === undefined ? {} : { 'Content-Type': 'application/json' } }
    const req = httpRequest(url, { method: options.method ?? (body === undefined ? 'GET' : 'POST'), headers, setHost: !headers.Host, timeout: options.timeoutMs ?? 300_000 }, (res) => {
      let text = ''
      res.setEncoding('utf8')
      res.on('data', (chunk: string) => text += chunk)
      res.on('end', () => resolve({ status: res.statusCode ?? 0, headers: res.headers, text, json: <T>() => JSON.parse(text) as T }))
    })
    req.on('timeout', () => req.destroy(new Error(`timed out: ${url}`)))
    req.on('error', reject)
    if (body !== undefined) req.write(body)
    req.end()
  })
}

export interface EventStream {
  events: { event: string, data: Record<string, unknown> }[]
  /** Resolves with the next event of this name not taken yet. */
  next(event: string, timeoutMs?: number): Promise<Record<string, unknown>>
  close(): void
}

/** An SSE stream read with these headers. */
export function eventStream(url: string, headers: Record<string, string> = {}): Promise<EventStream> {
  return new Promise((resolve, reject) => {
    const events: EventStream['events'] = []
    const taken = new Set<number>()
    const waiting: { event: string, done: (data: Record<string, unknown>) => void }[] = []
    let buffer = ''
    const take = () => {
      for (const waiter of [...waiting]) {
        const index = events.findIndex((e, i) => e.event === waiter.event && !taken.has(i))
        if (index < 0) continue
        taken.add(index)
        waiting.splice(waiting.indexOf(waiter), 1)
        waiter.done(events[index]!.data)
      }
    }
    const req = httpRequest(url, { headers: { Accept: 'text/event-stream', ...headers }, setHost: !headers.Host }, (res: IncomingMessage) => {
      if (res.statusCode !== 200) {
        reject(new Error(`the stream answered ${res.statusCode}`))
        res.resume()
        return
      }
      res.setEncoding('utf8')
      res.on('data', (chunk: string) => {
        buffer += chunk
        let end: number
        while ((end = buffer.indexOf('\n\n')) >= 0) {
          const block = buffer.slice(0, end)
          buffer = buffer.slice(end + 2)
          const event = /^event: (.*)$/m.exec(block)?.[1] ?? 'message'
          const data = block.split('\n').filter(line => line.startsWith('data: ')).map(line => line.slice(6)).join('\n')
          events.push({ event, data: data ? JSON.parse(data) as Record<string, unknown> : {} })
        }
        take()
      })
      resolve({
        events,
        next(event, timeoutMs = 30_000) {
          return new Promise((done, fail) => {
            const timer = setTimeout(() => fail(new Error(`no ${event} event within ${timeoutMs} ms; got ${JSON.stringify(events)}`)), timeoutMs)
            waiting.push({ event, done: (data) => {
              clearTimeout(timer)
              done(data)
            } })
            take()
          })
        },
        close: () => req.destroy(),
      })
    })
    req.on('error', (error) => {
      if (!('code' in error && error.code === 'ECONNRESET')) reject(error)
    })
    req.end()
  })
}

/** The secrets of a SHARED deployment in a test: values that must never reach the sandbox's code. */
export interface SharedSecrets {
  proxySecret: string
  gatewayToken: string
  agentHostToken: string
}

export interface SharedSetup {
  serve: Child
  gateway: Child
  agentHost: Child
  /** serve's address. */
  url: string
  secrets: SharedSecrets
  /** The headers the login proxy adds for a member on the site's host name (or the console's). */
  as(email: string, host?: 'site' | 'console'): Record<string, string>
  stop(): Promise<void>
}

/**
 * SHARED mode on this machine: `presmium agent-host`, `presmium gateway` and `presmium serve` with a login
 * proxy's shared secret, each its own process with its own token in its environment. `serveEnv` adds to
 * serve's environment (e.g. a PATH).
 */
export async function shared(dir: string, options: { serveEnv?: Record<string, string> } = {}): Promise<SharedSetup> {
  const id = Math.random().toString(36).slice(2, 10)
  const secrets: SharedSecrets = { proxySecret: `proxy-${id}`, gatewayToken: `gateway-${id}`, agentHostToken: `agent-host-${id}` }
  const agentHost = presmiumProcess(dir, ['agent-host', '--port', '0'], cleanEnv({ PRESMIUM_AGENT_HOST_TOKEN: secrets.agentHostToken }))
  const gateway = presmiumProcess(dir, ['gateway', '--port', '0'], cleanEnv({ PRESMIUM_GATEWAY_TOKEN: secrets.gatewayToken }))
  const [agentHostUrl, gatewayUrl] = await Promise.all([
    waitFor(agentHost, /^agent-host {2}(http\S+)$/m).then(m => m[1]!),
    waitFor(gateway, /^gateway {2}(http\S+)$/m).then(m => m[1]!),
  ])
  const serve = presmiumProcess(dir, ['serve', '--port', '0'], cleanEnv({
    PRESMIUM_PROXY_SECRET: secrets.proxySecret,
    PRESMIUM_GATEWAY_URL: gatewayUrl,
    PRESMIUM_GATEWAY_TOKEN: secrets.gatewayToken,
    PRESMIUM_AGENT_HOST_URL: agentHostUrl,
    PRESMIUM_AGENT_HOST_TOKEN: secrets.agentHostToken,
    PRESMIUM_CONSOLE_HOST: 'console.test',
    ...options.serveEnv,
  }))
  const url = (await waitFor(serve, /^serve {2}(http\S+)$/m))[1]!
  const port = new URL(url).port
  return {
    serve,
    gateway,
    agentHost,
    url,
    secrets,
    as: (email, host = 'site') => ({ 'Host': `${host}.test:${port}`, 'X-Presmium-Proxy-Secret': secrets.proxySecret, 'X-Forwarded-Email': email }),
    async stop() {
      await serve.stop()
      await Promise.all([gateway.stop(), agentHost.stop()])
    },
  }
}

/** A process's parent, command line and environment, from /proc; undefined once it is gone. */
export function processInfo(pid: number): { ppid: number, cmdline: string, environ: string } | undefined {
  try {
    const stat = readFileSync(`/proc/${pid}/stat`, 'utf8')
    const ppid = Number(stat.slice(stat.lastIndexOf(')') + 2).split(' ')[1])
    return { ppid, cmdline: readFileSync(`/proc/${pid}/cmdline`, 'utf8').replaceAll('\0', ' '), environ: readFileSync(`/proc/${pid}/environ`, 'utf8') }
  } catch {
    return undefined
  }
}

/** The command lines of the processes that descend from `pid` now. */
export function descendants(pid: number): string[] {
  const children = new Map<number, number[]>()
  for (const name of readdirSync('/proc').filter(entry => /^\d+$/.test(entry))) {
    try {
      const stat = readFileSync(`/proc/${name}/stat`, 'utf8')
      const ppid = Number(stat.slice(stat.lastIndexOf(')') + 2).split(' ')[1])
      children.set(ppid, [...children.get(ppid) ?? [], Number(name)])
    } catch {
      // Gone meanwhile.
    }
  }
  const out: string[] = []
  const walk = (parent: number) => {
    for (const child of children.get(parent) ?? []) {
      try {
        out.push(readFileSync(`/proc/${child}/cmdline`, 'utf8').replaceAll('\0', ' '))
      } catch {
        continue
      }
      walk(child)
    }
  }
  walk(pid)
  return out
}

