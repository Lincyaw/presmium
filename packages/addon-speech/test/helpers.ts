import { spawn } from 'node:child_process'
import type { ChildProcess } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { PRESMIUM_BIN, run } from '@lincyaw/cli/testing'
import type { Run } from '@lincyaw/cli/testing'

export const PACKAGE = fileURLToPath(new URL('..', import.meta.url))
const PACKAGES = fileURLToPath(new URL('../..', import.meta.url))
const SPEECH_BIN = join(PACKAGE, 'bin/presmium-speech.mjs')
export const PROBE = join(PACKAGE, 'test/fixtures/speech-probe')
export const PROBE_NAME = 'presmium-fixture-speech-probe'

export function cleanEnv(extra: Record<string, string> = {}): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env }
  delete env.NODE_ENV
  for (const name of Object.keys(env)) {
    if (name.startsWith('PRESMIUM_') || /(?:_KEY|_TOKEN|_SECRET|_PASSWORD|_APPID)$/i.test(name)) delete env[name]
  }
  return { ...env, ...extra }
}

export function presmium(cwd: string, args: string[], extra: Record<string, string> = {}): Promise<Run> {
  return run(process.execPath, [PRESMIUM_BIN, ...args], { cwd, env: cleanEnv(extra) })
}

export function temporary(prefix: string): string {
  return mkdtempSync(join(tmpdir(), `presmium-${prefix}-`))
}

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

export function presmiumProcess(cwd: string, args: string[], env: NodeJS.ProcessEnv): Child {
  return started(spawn(process.execPath, [PRESMIUM_BIN, ...args], { cwd, env, stdio: ['ignore', 'pipe', 'pipe'] }))
}

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
  url: string
  requests(): Promise<FakeRequest[]>
  stop(): Promise<void>
}

export async function startFake(): Promise<Fake> {
  const child = started(spawn(process.execPath, [SPEECH_BIN, 'fake', '--port', '0'], { env: cleanEnv(), stdio: ['ignore', 'pipe', 'pipe'] }))
  const url = (await waitFor(child, /^fake {2}(http\S+)$/m, 60_000))[1]!
  return {
    url,
    requests: async () => ((await (await fetch(new URL('/requests', url))).json()) as { requests: FakeRequest[] }).requests,
    stop: () => child.stop(),
  }
}

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

export function speechUrl(server: string, path: string): string {
  return `${server.replace(/\/$/, '')}/__presmium/presmium.speech/${path}`
}

export function probeUrl(server: string, path: string): string {
  return `${server.replace(/\/$/, '')}/__presmium/fixture.speechProbe/${path}`
}

export async function post(url: string, body: unknown): Promise<{ status: number, text: string, json: <T = Record<string, unknown>>() => T }> {
  const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  const text = await response.text()
  return { status: response.status, text, json: <T>() => JSON.parse(text) as T }
}

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
