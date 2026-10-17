// Real processes for the tests of the remote environments: `presmium` commands on test decks in
// temporary directories, the compose environment of templates/env/compose, and listeners that
// record every request (HTTP and WebSocket upgrades) that reaches them.
import { spawn, spawnSync } from 'node:child_process'
import type { ChildProcess } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import type { IncomingHttpHeaders } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { PRESMIUM_BIN, run } from '@presmium/cli/testing'
import type { Run } from '@presmium/cli/testing'

export const PACKAGE = fileURLToPath(new URL('..', import.meta.url))
export const PACKAGES = fileURLToPath(new URL('../..', import.meta.url))
export const COMPOSE_DIR = fileURLToPath(new URL('../../../templates/env/compose', import.meta.url))

/** Whether Docker with docker compose answers. */
export const dockerCompose = spawnSync('docker', ['compose', 'version'], { stdio: 'ignore' }).status === 0
  && spawnSync('docker', ['version', '--format', '{{.Server.Version}}'], { stdio: 'ignore' }).status === 0

/** The test process's environment without Presmium's variables (a developer's machine may hold some) and Vitest's NODE_ENV. */
export function cleanEnv(extra: Record<string, string> = {}): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env }
  delete env.NODE_ENV
  for (const name of Object.keys(env)) if (name.startsWith('PRESMIUM_')) delete env[name]
  return { ...env, ...extra }
}

/** `presmium <args>` in `cwd` with the clean environment and `extra` only (not the test process's variables). */
export function presmium(cwd: string, args: string[], extra: Record<string, string> = {}): Promise<Run> {
  return run(process.execPath, [PRESMIUM_BIN, ...args], { cwd, env: cleanEnv(extra) })
}

/** A deck in a new temporary directory: `lecture.md` with the plugin (and `plugins`, e.g. the execution plugin) and the notebook renderer named by their paths. */
export function testDeck(prefix: string, headmatter: string, body: string, plugins: string[] = []): string {
  const dir = mkdtempSync(join(tmpdir(), `presmium-${prefix}-`))
  writeFileSync(join(dir, 'lecture.md'), [
    '---',
    'title: 远端环境测试文稿',
    'plugins:',
    `  - ${PACKAGE}`,
    ...plugins.map(plugin => `  - ${plugin}`),
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

export function remove(dir: string | undefined): void {
  if (dir) rmSync(dir, { recursive: true, force: true })
}

export interface Jupyter {
  url: string
  token: string
  stop(): void
}

/** `docker compose` with the template and the overlays (`compose.gpu.yaml`, ...); its output, or an error with it. */
export function compose(project: string, args: string[], env: Record<string, string>, overlays: string[] = []): string {
  const files = ['compose.yaml', ...overlays].flatMap(file => ['-f', join(COMPOSE_DIR, file)])
  const result = spawnSync('docker', ['compose', '-p', project, ...files, ...args], { env: { ...process.env, ...env }, encoding: 'utf8', timeout: 600_000 })
  if (result.status !== 0) throw new Error(`docker compose ${args.join(' ')} failed:\n${result.stdout}${result.stderr}`)
  return result.stdout
}

/** templates/env/compose/compose.yaml (with `overlays`) under a project name of the work package, on `port`, with a token of its own; waits until healthy. */
export function startJupyter(project: string, port: number, overlays: string[] = []): Jupyter {
  const env = { JUPYTER_TOKEN: randomBytes(24).toString('hex'), JUPYTER_PORT: String(port) }
  compose(project, ['up', '-d', '--wait'], env, overlays)
  return { url: `http://127.0.0.1:${port}/`, token: env.JUPYTER_TOKEN, stop: () => void compose(project, ['down', '--volumes', '--timeout', '5'], env, overlays) }
}

/** Whether the host has an NVIDIA GPU for containers (the NVIDIA Container Toolkit registers its devices with Docker). */
export const nvidiaGpu = dockerCompose
  && spawnSync('nvidia-smi', ['-L'], { stdio: 'ignore' }).status === 0
  && spawnSync('docker', ['info'], { encoding: 'utf8' }).stdout.includes('nvidia.com/gpu')

export interface Received {
  method: string
  url: string
  headers: IncomingHttpHeaders
  upgrade: boolean
}

export interface Listener {
  url: string
  port: number
  received: Received[]
  close(): Promise<void>
}

/** A listener that records every request and upgrade, and answers each with `body` (WebSocket upgrades with 400). */
export async function listener(body = '{"kernelspecs":{}}'): Promise<Listener> {
  const received: Received[] = []
  const server = createServer((req, res) => {
    received.push({ method: req.method ?? '', url: req.url ?? '', headers: req.headers, upgrade: false })
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(body)
  })
  server.on('upgrade', (req, socket) => {
    received.push({ method: req.method ?? '', url: req.url ?? '', headers: req.headers, upgrade: true })
    socket.end('HTTP/1.1 400 Bad Request\r\nContent-Length: 0\r\n\r\n')
  })
  await new Promise<void>(done => server.listen(0, '127.0.0.1', done))
  const port = (server.address() as AddressInfo).port
  return {
    url: `http://127.0.0.1:${port}/`,
    port,
    received,
    close: () => new Promise((done) => {
      server.close(() => done())
      server.closeAllConnections()
    }),
  }
}

/** A port nothing listens on. */
export async function closedPort(): Promise<number> {
  const free = await listener()
  await free.close()
  return free.port
}

export interface Child {
  child: ChildProcess
  output(): string
  stop(): Promise<void>
}

/** `presmium <args>` as a long-running process (`dev`). */
export function presmiumProcess(cwd: string, args: string[], env: NodeJS.ProcessEnv): Child {
  const child = spawn(process.execPath, [PRESMIUM_BIN, ...args], { cwd, env, stdio: ['ignore', 'pipe', 'pipe'] })
  let output = ''
  child.stdout.on('data', (chunk: Buffer) => output += chunk)
  child.stderr.on('data', (chunk: Buffer) => output += chunk)
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

/** Waits until the process prints a match; rejects with its output when it exits first. */
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
      reject(new Error(`presmium exited (${code}) before ${pattern}:\n${child.output()}`))
    })
    check()
  })
}
