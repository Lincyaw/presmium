// Real processes for the tests of speech: `presmium` commands on test decks, the fake engine
// (`presmium-speech fake`) as a process of its own (and a front of it whose voice list can fail),
// listeners that record what reaches them, a test plugin that calls the Node SPEECH service
// (fixtures/speech-probe), and a reader of WAV chunks independent of the package.
import { spawn } from 'node:child_process'
import type { ChildProcess } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { PRESMIUM_BIN, run } from '@presmium/cli/testing'
import type { Run } from '@presmium/cli/testing'

export const PACKAGE = fileURLToPath(new URL('..', import.meta.url))
const PACKAGES = fileURLToPath(new URL('../..', import.meta.url))
const SPEECH_BIN = join(PACKAGE, 'bin/presmium-speech.mjs')
/** The test plugin whose routes `engines`, `synthesize` and `transcribe` call the Node SPEECH service. */
export const PROBE = join(PACKAGE, 'test/fixtures/speech-probe')
export const PROBE_NAME = 'presmium-fixture-speech-probe'

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

/** A deck in a new temporary directory: `lecture.md` with the speech plugin (and `plugins`) and the notebook renderer named by their paths. */
export function testDeck(prefix: string, headmatter: string, plugins: string[] = []): string {
  const dir = temporary(prefix)
  writeFileSync(join(dir, 'lecture.md'), [
    '---',
    'title: 语音测试文稿',
    'plugins:',
    ...[PACKAGE, ...plugins].map(plugin => `  - ${plugin}`),
    'renderers:',
    `  notebook: { package: ${join(PACKAGES, 'render-notebook')} }`,
    headmatter.trim(),
    '---',
    '',
    '## 第一节',
    '',
    '讲解。',
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

/** `presmium <args>` left running (`dev`). */
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

/**
 * A front of the fake engine at an address of its own: it passes every request on, except that it answers
 * `GET …/audio/voices` with 503 while `failVoices` is above 0 (a transient failure of the voice list).
 */
export async function front(fake: Fake): Promise<{ url: string, failVoices: number, voiceRequests: number, close(): Promise<void> }> {
  const upstream = new URL(fake.url)
  const state = { url: '', failVoices: 0, voiceRequests: 0, close: async () => {} }
  const server = createServer((req, res) => {
    const chunks: Buffer[] = []
    req.on('data', (chunk: Buffer) => chunks.push(chunk))
    req.on('end', () => {
      const voices = req.method === 'GET' && (req.url ?? '').split('?')[0]!.endsWith('/audio/voices')
      if (voices) state.voiceRequests++
      if (voices && state.failVoices > 0) {
        state.failVoices--
        res.writeHead(503, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: { message: 'the voice list is busy' } }))
        return
      }
      const headers: Record<string, string> = {}
      for (const name of ['authorization', 'content-type']) if (typeof req.headers[name] === 'string') headers[name] = req.headers[name]
      void fetch(new URL(req.url ?? '/', upstream), { method: req.method, headers, ...req.method === 'GET' || req.method === 'HEAD' ? {} : { body: Buffer.concat(chunks) } })
        .then(async (response) => {
          res.writeHead(response.status, { 'Content-Type': response.headers.get('content-type') ?? 'application/octet-stream' })
          res.end(Buffer.from(await response.arrayBuffer()))
        }, (error: unknown) => {
          res.writeHead(502)
          res.end(String(error))
        })
    })
  })
  await new Promise<void>(done => server.listen(0, '127.0.0.1', done))
  state.url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1`
  state.close = () => new Promise((done) => {
    server.close(() => done())
    server.closeAllConnections()
  })
  return state
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

/** The deck's `presmium.speech` routes of a server. */
export function speechUrl(server: string, path: string): string {
  return `${server.replace(/\/$/, '')}/__presmium/presmium.speech/${path}`
}

/** A route of the test plugin (fixtures/speech-probe) of a server. */
export function probeUrl(server: string, path: string): string {
  return `${server.replace(/\/$/, '')}/__presmium/fixture.speechProbe/${path}`
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

const OGG_CRC = (() => {
  const table = new Uint32Array(256)
  for (let i = 0; i < 256; i++) {
    let r = i << 24
    for (let j = 0; j < 8; j++) r = r & 0x80000000 ? (r << 1) ^ 0x04c11db7 : r << 1
    table[i] = r >>> 0
  }
  return table
})()

/**
 * The packets of an Ogg file, read without the package's code: each page's checksum and sequence number are
 * checked (a decoder refuses a page that fails them), and its packets put together from their lacing.
 */
export function oggPackets(bytes: Buffer): Buffer[] {
  const packets: Buffer[] = []
  let pending: Buffer[] = []
  for (let at = 0, sequence = 0; at < bytes.length; sequence++) {
    if (bytes.toString('latin1', at, at + 4) !== 'OggS') throw new Error(`no Ogg page at byte ${at}`)
    const count = bytes[at + 26]!
    const lacing = [...bytes.subarray(at + 27, at + 27 + count)]
    const page = Buffer.from(bytes.subarray(at, at + 27 + count + lacing.reduce((n, s) => n + s, 0)))
    const stored = page.readUInt32LE(22)
    page.writeUInt32LE(0, 22)
    let crc = 0
    for (const byte of page) crc = ((crc << 8) ^ OGG_CRC[((crc >>> 24) ^ byte) & 0xff]!) >>> 0
    if (crc !== stored) throw new Error(`Ogg page ${sequence}: its checksum is wrong`)
    if (page.readUInt32LE(18) !== sequence) throw new Error(`Ogg page ${sequence} is numbered ${page.readUInt32LE(18)}`)
    let offset = 27 + count
    for (const size of lacing) {
      pending.push(page.subarray(offset, offset + size))
      offset += size
      if (size < 255) {
        packets.push(Buffer.concat(pending))
        pending = []
      }
    }
    at += page.length
  }
  return packets
}
