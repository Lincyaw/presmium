// Real processes and raw HTTP for the tests of the server: `presmium dev` on a fixture deck, the
// `serve` mode host (fixtures/serve-host.ts), listeners standing in for the site and a proxy's
// target, and requests with the headers a browser would send (`Host` included, which fetch cannot set).
import { spawn } from 'node:child_process'
import type { ChildProcess } from 'node:child_process'
import { execFileSync } from 'node:child_process'
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { createServer, request as httpRequest } from 'node:http'
import type { IncomingHttpHeaders } from 'node:http'
import type { AddressInfo } from 'node:net'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { CREDENTIAL_VARIABLE } from '@presmium/kernel'

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
  for (const name of Object.keys(env)) if (name.startsWith('PRESMIUM_') || CREDENTIAL_VARIABLE.test(name)) delete env[name]
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

/** A listener that records the requests it gets and answers each with JSON naming its path (and a cookie). */
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
