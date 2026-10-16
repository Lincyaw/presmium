// Real processes for the tests of speech: `presmium` commands on test decks, the fake engine
// (`presmium-speech fake`) as a process of its own, SHARED mode's serve, gateway and agent-host on this
// machine, listeners that record what reaches them, requests with the headers a login proxy adds
// (`Host` included, which fetch cannot set), and a reader of WAV chunks independent of the package.
import { execFileSync, spawn } from 'node:child_process'
import type { ChildProcess } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { createServer, request as httpRequest } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { PRESMIUM_BIN, run } from '@presmium/cli/testing'
import type { Run } from '@presmium/cli/testing'

export const PACKAGE = fileURLToPath(new URL('..', import.meta.url))
const PACKAGES = fileURLToPath(new URL('../..', import.meta.url))
const SPEECH_BIN = join(PACKAGE, 'bin/presmium-speech.mjs')
/** Workspaces of SHARED mode go here (ignored by git), where VitePress and the renderers resolve from the demo's node_modules. */
const WORK = fileURLToPath(new URL('../../../examples/demo/.presmium', import.meta.url))

/** The test process's environment without Presmium's variables or credentials (a developer's machine may hold some) and Vitest's NODE_ENV. */
export function cleanEnv(extra: Record<string, string> = {}): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env }
  delete env.NODE_ENV
  for (const name of Object.keys(env)) {
    if (name.startsWith('PRESMIUM_') || /(?:_KEY|_TOKEN|_SECRET|_PASSWORD|_APPID)$/i.test(name)) delete env[name]
  }
  return { ...env, ...extra }
}

/** `presmium <args>` in `cwd` with the clean environment and `extra` only. */
export function presmium(cwd: string, args: string[], extra: Record<string, string> = {}): Promise<Run> {
  return run(process.execPath, [PRESMIUM_BIN, ...args], { cwd, env: cleanEnv(extra) })
}

/** A new directory outside every workspace (an operator directory, a deck). */
export function temporary(prefix: string): string {
  return mkdtempSync(join(tmpdir(), `presmium-${prefix}-`))
}

/** A deck in a new temporary directory: `lecture.md` with the speech plugin and the notebook renderer named by their paths. */
export function testDeck(prefix: string, headmatter: string, body = '## 第一节\n\n讲解。'): string {
  const dir = temporary(prefix)
  writeFileSync(join(dir, 'lecture.md'), [
    '---',
    'title: 语音测试文稿',
    'plugins:',
    `  - ${PACKAGE}`,
    'renderers:',
    `  notebook: { package: ${join(PACKAGES, 'render-notebook')} }`,
    headmatter.trim(),
    '---',
    '',
    body.trim(),
    '',
  ].join('\n'))
  return dir
}

export function remove(...dirs: (string | undefined)[]): void {
  for (const dir of dirs) if (dir) rmSync(dir, { recursive: true, force: true })
}

export interface Child {
  child: ChildProcess
  output(): string
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
      const timer = setTimeout(() => child.kill('SIGKILL'), 20_000)
      await exited
      clearTimeout(timer)
    },
  }
}

/** `presmium <args>` left running (`dev`, `serve`, `gateway`, `agent-host`). */
export function presmiumProcess(cwd: string, args: string[], env: NodeJS.ProcessEnv): Child {
  return started(spawn(process.execPath, [PRESMIUM_BIN, ...args], { cwd, env, stdio: ['ignore', 'pipe', 'pipe'] }))
}

/** Waits until the output matches; rejects with the output when the process exits first. */
export function waitFor(child: Child, pattern: RegExp, timeoutMs = 180_000): Promise<RegExpExecArray> {
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
      else reject(new Error(`exited (${code}) before ${pattern}:\n${child.output()}`))
    })
    check()
  })
}

/** `presmium dev --to notebook` on a deck; resolves with the process and its server's address. */
export async function dev(dir: string, env: Record<string, string>): Promise<{ dev: Child, server: string }> {
  const child = presmiumProcess(dir, ['dev', '--to', 'notebook'], cleanEnv(env))
  try {
    return { dev: child, server: (await waitFor(child, /^server {2}(http\S+)$/m))[1]! }
  } catch (error) {
    await child.stop()
    throw error
  }
}

export interface FakeRequest {
  method: string
  path: string
  authorization: string | null
}

export interface Fake {
  /** The address to define it with (`PRESMIUM_SPEECH_FAKE_URL`). */
  url: string
  requests(): Promise<FakeRequest[]>
  stop(): Promise<void>
}

/** `presmium-speech fake` as a process of its own. */
export async function startFake(): Promise<Fake> {
  const child = started(spawn(process.execPath, [SPEECH_BIN, 'fake', '--port', '0'], { env: cleanEnv(), stdio: ['ignore', 'pipe', 'pipe'] }))
  const url = (await waitFor(child, /^fake {2}(http\S+)$/m, 60_000))[1]!
  return {
    url,
    requests: async () => ((await (await fetch(new URL('/requests', url))).json()) as { requests: FakeRequest[] }).requests,
    stop: () => child.stop(),
  }
}

/** A listener that records every request that reaches it. */
export async function listener(): Promise<{ url: string, received: string[], close(): Promise<void> }> {
  const received: string[] = []
  const server = createServer((req, res) => {
    received.push(`${req.method} ${req.url} ${JSON.stringify(req.headers)}`)
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end('{}')
  })
  await new Promise<void>(done => server.listen(0, '127.0.0.1', done))
  return {
    url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
    received,
    close: () => new Promise((done) => {
      server.close(() => done())
      server.closeAllConnections()
    }),
  }
}

export interface RawResponse {
  status: number
  text: string
  json<T = Record<string, unknown>>(): T
}

/** A request with exactly these headers (`Host` included). */
export function raw(url: string, options: { method?: string, headers?: Record<string, string>, body?: string } = {}): Promise<RawResponse> {
  return new Promise((resolve, reject) => {
    const req = httpRequest(url, { method: options.method ?? 'GET', headers: options.headers, setHost: !options.headers?.Host, timeout: 120_000 }, (res) => {
      let text = ''
      res.setEncoding('utf8')
      res.on('data', (chunk: string) => text += chunk)
      res.on('end', () => resolve({ status: res.statusCode ?? 0, text, json: <T>() => JSON.parse(text) as T }))
    })
    req.on('timeout', () => req.destroy(new Error(`timed out: ${url}`)))
    req.on('error', reject)
    if (options.body !== undefined) req.write(options.body)
    req.end()
  })
}

/** The deck's `presmium.speech` routes of a server. */
export function speechUrl(server: string, path: string): string {
  return `${server.replace(/\/$/, '')}/__presmium/presmium.speech/${path}`
}

/** A JSON POST with fetch (a `presmium dev` server, on this machine). */
export async function post(url: string, body: unknown): Promise<{ status: number, text: string, json: <T = Record<string, unknown>>() => T }> {
  const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  const text = await response.text()
  return { status: response.status, text, json: <T>() => JSON.parse(text) as T }
}

/** The `LIST`/`INFO` entries and the other chunks of a WAV file, read without the package's code. */
export function wavInfo(bytes: Buffer): { info: Record<string, string>, chunks: Record<string, Buffer> } {
  const info: Record<string, string> = {}
  const chunks: Record<string, Buffer> = {}
  const read = (buffer: Buffer, from: number, each: (id: string, data: Buffer) => void) => {
    for (let at = from; at + 8 <= buffer.length;) {
      const size = buffer.readUInt32LE(at + 4)
      each(buffer.toString('latin1', at, at + 4), buffer.subarray(at + 8, at + 8 + size))
      at += 8 + size + (size % 2)
    }
  }
  if (bytes.toString('latin1', 0, 4) !== 'RIFF' || bytes.toString('latin1', 8, 12) !== 'WAVE') throw new Error('not a WAV file')
  read(bytes, 12, (id, data) => {
    if (id === 'LIST' && data.toString('latin1', 0, 4) === 'INFO') read(data, 4, (key, value) => info[key] = value.toString('utf8').replace(/\0+$/, ''))
    else chunks[id] = data
  })
  return { info, chunks }
}

// SHARED mode ---------------------------------------------------------------------

/** A workspace in examples/demo/.presmium with these files and the speech plugin installed at its root, committed. */
export function workspace(prefix: string, files: Record<string, string>): string {
  mkdirSync(WORK, { recursive: true })
  const dir = mkdtempSync(join(WORK, `speech-${prefix}-`))
  writeFileSync(join(dir, '.gitignore'), 'node_modules/\ndist/\n.presmium/\n')
  writeFileSync(join(dir, 'package.json'), `${JSON.stringify({ name: dir.split('/').at(-1)!.toLowerCase(), private: true, type: 'module' })}\n`)
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, path)), { recursive: true })
    writeFileSync(join(dir, path), text)
  }
  mkdirSync(join(dir, 'node_modules/@presmium'), { recursive: true })
  symlinkSync(PACKAGE, join(dir, 'node_modules/@presmium/slidev-addon-speech'), 'junction')
  const git = (args: string[]) => execFileSync('git', ['-c', 'user.name=Test', '-c', 'user.email=test@example.com', '-c', 'commit.gpgSign=false', '-c', 'core.hooksPath=/dev/null', ...args], { cwd: dir })
  git(['init', '-q', '-b', 'main'])
  git(['add', '-A'])
  git(['commit', '-q', '-m', 'Initial commit'])
  return dir
}

export interface Shared {
  serve: Child
  gateway: Child
  agentHost: Child
  /** serve's address. */
  url: string
  /** The gateway's address and service token. */
  gatewayUrl: string
  gatewayToken: string
  /** The headers a login proxy adds for a member on the site's host name (or the console's), for a document. */
  as(email: string, host?: 'site' | 'console', extra?: Record<string, string>): Record<string, string>
  stop(): Promise<void>
}

/**
 * SHARED mode on this machine: `presmium agent-host`, `presmium gateway` (with `gatewayEnv` and its
 * operator directory) and `presmium serve` with a login proxy's shared secret, each a process of its
 * own with its own token; serve's environment has no speech variable.
 */
export async function shared(dir: string, operatorDir: string, gatewayEnv: Record<string, string>): Promise<Shared> {
  const id = Math.random().toString(36).slice(2, 10)
  const proxySecret = `proxy-${id}`
  const gatewayToken = `gateway-${id}`
  const agentHostToken = `agent-host-${id}`
  const agentHost = presmiumProcess(dir, ['agent-host', '--port', '0'], cleanEnv({ PRESMIUM_AGENT_HOST_TOKEN: agentHostToken }))
  const gateway = presmiumProcess(dir, ['gateway', '--port', '0', '--operator-dir', operatorDir], cleanEnv({ PRESMIUM_GATEWAY_TOKEN: gatewayToken, ...gatewayEnv }))
  const [agentHostUrl, gatewayUrl] = await Promise.all([
    waitFor(agentHost, /^agent-host {2}(http\S+)$/m).then(m => m[1]!),
    waitFor(gateway, /^gateway {2}(http\S+)$/m).then(m => m[1]!),
  ])
  const serve = presmiumProcess(dir, ['serve', '--port', '0'], cleanEnv({
    PRESMIUM_PROXY_SECRET: proxySecret,
    PRESMIUM_GATEWAY_URL: gatewayUrl,
    PRESMIUM_GATEWAY_TOKEN: gatewayToken,
    PRESMIUM_AGENT_HOST_URL: agentHostUrl,
    PRESMIUM_AGENT_HOST_TOKEN: agentHostToken,
    PRESMIUM_CONSOLE_HOST: 'console.test',
  }))
  const url = (await waitFor(serve, /^serve {2}(http\S+)$/m))[1]!
  const port = new URL(url).port
  return {
    serve,
    gateway,
    agentHost,
    url,
    gatewayUrl,
    gatewayToken,
    as: (email, host = 'site', extra = {}) => ({ 'Host': `${host}.test:${port}`, 'X-Presmium-Proxy-Secret': proxySecret, 'X-Forwarded-Email': email, ...extra }),
    async stop() {
      await serve.stop()
      await Promise.all([gateway.stop(), agentHost.stop()])
    },
  }
}
