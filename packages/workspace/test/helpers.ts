import { execFile, execFileSync, spawn } from 'node:child_process'
import type { ChildProcess } from 'node:child_process'
import { cpSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { request as httpRequest } from 'node:http'
import type { IncomingHttpHeaders } from 'node:http'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

export const FIXTURES = fileURLToPath(new URL('./fixtures', import.meta.url))
export const ROOT = fileURLToPath(new URL('../../..', import.meta.url))
export const PRESMIUM_BIN = join(ROOT, 'packages/cli/bin/presmium.mjs')
const WORK = join(ROOT, 'e2e/fixtures/regression/.presmium')

export function git(dir: string, args: string[]): string {
  return execFileSync('git', ['-c', 'core.hooksPath=/dev/null', '-c', 'user.name=Test', '-c', 'user.email=test@example.com', '-c', 'commit.gpgSign=false', ...args], { cwd: dir, encoding: 'utf8' })
}

export function workspace(prefix: string, from: string, link: Record<string, string> = {}): string {
  mkdirSync(WORK, { recursive: true })
  const dir = mkdtempSync(join(WORK, `${prefix}-`))
  cpSync(from, dir, { recursive: true })
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
  output: () => string
  stop(): Promise<void>
}

export function presmium(cwd: string, args: string[], env: NodeJS.ProcessEnv = cleanEnv()): Promise<{ code: number, stdout: string, stderr: string }> {
  return new Promise((resolve) => {
    execFile(process.execPath, [PRESMIUM_BIN, ...args], { cwd, env, maxBuffer: 256 << 20 }, (error, stdout, stderr) => {
      resolve({ code: !error ? 0 : typeof error.code === 'number' ? error.code : -1, stdout, stderr })
    })
  })
}

export function presmiumProcess(cwd: string, args: string[], env: NodeJS.ProcessEnv = cleanEnv()): Child {
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
      const timer = setTimeout(() => child.kill('SIGKILL'), 20_000)
      await exited
      clearTimeout(timer)
    },
  }
}

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

export interface RawResponse {
  status: number
  headers: IncomingHttpHeaders
  text: string
  json<T = Record<string, unknown>>(): T
}

export function raw(url: string, options: { method?: string, headers?: Record<string, string>, json?: unknown, body?: Uint8Array, timeoutMs?: number } = {}): Promise<RawResponse> {
  return new Promise((resolve, reject) => {
    const body = options.json === undefined ? options.body : JSON.stringify(options.json)
    const headers = { ...options.headers, ...options.json === undefined ? {} : { 'Content-Type': 'application/json' } }
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

export function message(dir: string, rev = 'HEAD'): string {
  return git(dir, ['log', '-1', '--format=%B', rev])
}

export function commits(dir: string): number {
  return Number(git(dir, ['rev-list', '--count', 'HEAD']).trim())
}
