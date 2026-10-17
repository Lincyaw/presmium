// Real processes and raw HTTP for the tests of the server: `presmium dev` on a fixture deck, the
// `serve` mode host (fixtures/serve-host.ts), listeners standing in for the gateway and agent-host,
// and requests with the headers a browser or a login proxy would send (`Host` included, which
// fetch cannot set).
import { spawn } from 'node:child_process'
import type { ChildProcess } from 'node:child_process'
import { execFileSync } from 'node:child_process'
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { createServer, request as httpRequest } from 'node:http'
import type { IncomingHttpHeaders, IncomingMessage } from 'node:http'
import type { AddressInfo } from 'node:net'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { credentialVariables } from '@presmium/server'

export const FIXTURES = fileURLToPath(new URL('./fixtures', import.meta.url))
/** The `presmium` command (the CLI depends on this package, so the tests name its file rather than its package). */
const PRESMIUM_BIN = fileURLToPath(new URL('../../cli/bin/presmium.mjs', import.meta.url))
const WORK = fileURLToPath(new URL('../../../examples/demo/.presmium', import.meta.url))

/**
 * A new directory inside the demo (ignored by git), where the renderers and plugins resolve from the
 * demo's node_modules, made a git repository of its own so that it is its own workspace root.
 */
export function workspace(prefix: string, files: Record<string, string> = {}): string {
  mkdirSync(WORK, { recursive: true })
  const dir = mkdtempSync(join(WORK, `${prefix}-`))
  writeFileSync(join(dir, '.gitignore'), '*\n')
  writeFileSync(join(dir, 'package.json'), `${JSON.stringify({ name: dir.split('/').at(-1)!.toLowerCase(), private: true, type: 'module' })}\n`)
  for (const [path, from] of Object.entries(files)) cpSync(from, join(dir, path), { recursive: true })
  execFileSync('git', ['init', '-q'], { cwd: dir })
  return dir
}

export function remove(dir: string | undefined): void {
  if (dir) rmSync(dir, { recursive: true, force: true })
}

/** The test process's environment without credentials (a developer's machine may hold some) and without Vitest's NODE_ENV. */
export function cleanEnv(extra: Record<string, string> = {}): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env }
  delete env.NODE_ENV
  for (const name of credentialVariables(env)) delete env[name]
  for (const name of Object.keys(env)) if (name.startsWith('PRESMIUM_')) delete env[name]
  return { ...env, ...extra }
}

export interface Child {
  child: ChildProcess
  output: () => string
  stop(): Promise<void>
}

function started(child: ChildProcess): Child {
  let output = ''
  child.stdout?.on('data', (chunk: Buffer) => output += chunk)
  child.stderr?.on('data', (chunk: Buffer) => output += chunk)
  return {
    child,
    output: () => output,
    async stop() {
      if (child.exitCode !== null || child.signalCode !== null) return
      const exited = new Promise(done => child.once('exit', done))
      child.kill('SIGTERM')
      await exited
    },
  }
}

/** Waits until the output matches; rejects with the output when the process exits first. */
export function waitFor(child: Child, pattern: RegExp, timeoutMs = 240_000): Promise<RegExpExecArray> {
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

/** `presmium <args>` in `cwd`, left running. */
export function presmiumProcess(cwd: string, args: string[], env: NodeJS.ProcessEnv = cleanEnv()): Child {
  return started(spawn(process.execPath, [PRESMIUM_BIN, ...args], { cwd, env, stdio: ['ignore', 'pipe', 'pipe'] }))
}

/** The environment of a SHARED serve: the login proxy's secret, the gateway, agent-host and console. */
export function sharedEnv(dir: string, gateway: string, agentHost: string, extra: Record<string, string> = {}): Record<string, string> {
  return {
    SERVE_WORKSPACE: dir,
    SERVE_ROLES: JSON.stringify({ 'owner@test': ['owner'], 'editor@test': ['editor'] }),
    PRESMIUM_PROXY_SECRET: 'proxy-secret',
    PRESMIUM_GATEWAY_URL: gateway,
    PRESMIUM_GATEWAY_TOKEN: 'gateway-token',
    PRESMIUM_AGENT_HOST_URL: agentHost,
    PRESMIUM_AGENT_HOST_TOKEN: 'agent-host-token',
    PRESMIUM_CONSOLE_HOST: 'console.test',
    ...extra,
  }
}

/** Headers of a request through the login proxy, to the site or the console. */
export function as(email: string | undefined, host = 'site.test', extra: Record<string, string> = {}): Record<string, string> {
  return { 'Host': host, 'X-Presmium-Proxy-Secret': 'proxy-secret', ...email ? { 'X-Forwarded-Email': email } : {}, 'Presmium-Document': 'doc', ...extra }
}

/** A port no process listens on now, for a server whose address another must know before it starts. */
export async function freePort(): Promise<number> {
  const server = createServer()
  await new Promise<void>(done => server.listen(0, '127.0.0.1', done))
  const { port } = server.address() as AddressInfo
  await new Promise(done => server.close(done))
  return port
}

/** The `serve` mode host on a workspace; resolves with its first line (`{ url }` or `{ error }`) and the process. */
export async function serveHost(env: Record<string, string>): Promise<{ host: Child, url?: string, error?: string }> {
  const host = started(spawn(process.execPath, [join(FIXTURES, 'serve-host.ts')], { env: cleanEnv(env), stdio: ['pipe', 'pipe', 'pipe'] }))
  const line = (await waitFor(host, /^\{.*\}$/m, 120_000))[0]
  const result = JSON.parse(line) as { url?: string, error?: string }
  return { host, ...result }
}

export interface RawResponse {
  status: number
  headers: IncomingHttpHeaders
  text: string
  json<T = Record<string, unknown>>(): T
}

/** A request with exactly these headers (`Host` included), and its path as written (no `.` or `..` part resolved). */
export function raw(url: string, options: { method?: string, headers?: Record<string, string>, body?: string } = {}): Promise<RawResponse> {
  return new Promise((resolve, reject) => {
    const { protocol, hostname, port } = new URL(url)
    const path = /^[a-z]+:\/\/[^/]+(\/.*)?$/i.exec(url)?.[1] ?? '/'
    const req = httpRequest({ protocol, hostname, port, path, method: options.method ?? 'GET', headers: options.headers, setHost: !options.headers?.Host && !options.headers?.host }, (res) => {
      let text = ''
      res.setEncoding('utf8')
      res.on('data', (chunk: string) => text += chunk)
      res.on('end', () => resolve({ status: res.statusCode ?? 0, headers: res.headers, text, json: <T>() => JSON.parse(text) as T }))
    })
    req.on('error', reject)
    if (options.body !== undefined) req.write(options.body)
    req.end()
  })
}

export interface EventStream {
  /** Every event received so far. */
  events: { event: string, data: Record<string, unknown> }[]
  /** Resolves with the next event of this name (one already received counts). */
  next(event: string, timeoutMs?: number): Promise<Record<string, unknown>>
  close(): void
}

/** An SSE stream, read with these headers. */
export function eventStream(url: string, headers: Record<string, string> = {}): Promise<EventStream> {
  return new Promise((resolve, reject) => {
    const events: EventStream['events'] = []
    const waiting: { event: string, resolve: (data: Record<string, unknown>) => void }[] = []
    const seen = new Set<number>()
    let buffer = ''
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
          for (const waiter of [...waiting]) {
            const index = events.findIndex((e, i) => e.event === waiter.event && !seen.has(i))
            if (index < 0) continue
            seen.add(index)
            waiting.splice(waiting.indexOf(waiter), 1)
            waiter.resolve(events[index]!.data)
          }
        }
      })
      resolve({
        events,
        next(event, timeoutMs = 10_000) {
          const index = events.findIndex((e, i) => e.event === event && !seen.has(i))
          if (index >= 0) {
            seen.add(index)
            return Promise.resolve(events[index]!.data)
          }
          return new Promise((done, fail) => {
            const timer = setTimeout(() => fail(new Error(`no ${event} event within ${timeoutMs} ms; got ${JSON.stringify(events)}`)), timeoutMs)
            waiting.push({ event, resolve: (data) => {
              clearTimeout(timer)
              done(data)
            } })
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

/** A listener that records the requests it gets and answers each with JSON naming its path (and a cookie, which serve's SHARED proxies do not pass back). */
export async function listener(): Promise<{ url: string, requests: { method: string, path: string, headers: IncomingHttpHeaders, body: string }[], close(): Promise<void> }> {
  const requests: { method: string, path: string, headers: IncomingHttpHeaders, body: string }[] = []
  const server = createServer((req, res) => {
    let body = ''
    req.on('data', (chunk: Buffer) => body += chunk)
    req.on('end', () => {
      requests.push({ method: req.method ?? 'GET', path: req.url ?? '/', headers: req.headers, body })
      res.writeHead(200, { 'Content-Type': 'application/json', 'Set-Cookie': 'upstream=set-by-the-target; Path=/' })
      res.end(JSON.stringify({ listener: true, path: req.url }))
    })
  })
  await new Promise<void>(done => server.listen(0, '127.0.0.1', done))
  return {
    url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
    requests,
    close: () => new Promise(done => {
      server.close(() => done())
      server.closeAllConnections()
    }),
  }
}
