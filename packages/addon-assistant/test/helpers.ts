// Real processes for the assistant's tests: the `presmium` CLI (the CLI's file: it is not a dependency of
// this package's code), the scripted test agent, the events of a task as a page follows them, the log the
// test agent keeps, and what /proc says of a process.
import { execFileSync, spawn } from 'node:child_process'
import type { ChildProcess } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs'
import { createServer, request as httpRequest } from 'node:http'
import type { IncomingMessage } from 'node:http'
import type { AddressInfo } from 'node:net'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { AgentEvent } from '@presmium/kernel'

export const ROOT = fileURLToPath(new URL('../../..', import.meta.url))
export const PRESMIUM_BIN = fileURLToPath(new URL('../../cli/bin/presmium.mjs', import.meta.url))
export const PACKAGE = fileURLToPath(new URL('..', import.meta.url)).replace(/\/$/, '')
export const FIXTURES = fileURLToPath(new URL('./fixtures', import.meta.url))
/** The scripted test agent, as a replacement runtime's command line. */
export const AGENT_COMMAND = `${process.execPath} ${fileURLToPath(new URL('./fixtures/scripted-agent.mjs', import.meta.url))}`

/** The test process's environment without Vitest's NODE_ENV, Presmium's variables and credentials; then `extra`. */
export function env(extra: Record<string, string> = {}): NodeJS.ProcessEnv {
  const out: NodeJS.ProcessEnv = { ...process.env }
  delete out.NODE_ENV
  for (const name of Object.keys(out)) {
    if (name.startsWith('PRESMIUM_') || name.startsWith('DEEPSEEK_') || name.startsWith('DSH_') || /(?:_KEY|_TOKEN|_SECRET|_PASSWORD|_APPID)$/i.test(name)) delete out[name]
  }
  return { ...out, ...extra }
}

export interface Running {
  child: ChildProcess
  output(): string
  /** Waits until the output matches. */
  wait(pattern: RegExp, timeoutMs?: number): Promise<RegExpExecArray>
  stop(): Promise<void>
}

/** `presmium <args>`, left running. */
export function presmium(args: string[], options: { cwd: string, env: NodeJS.ProcessEnv }): Running {
  const child = spawn(process.execPath, [PRESMIUM_BIN, ...args], { cwd: options.cwd, env: options.env, stdio: ['ignore', 'pipe', 'pipe'] })
  let output = ''
  child.stdout.on('data', (chunk: Buffer) => output += chunk)
  child.stderr.on('data', (chunk: Buffer) => output += chunk)
  const exited = new Promise(done => child.once('exit', done))
  return {
    child,
    output: () => output,
    wait(pattern, timeoutMs = 120_000) {
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(`timed out waiting for ${pattern}:\n${output}`)), timeoutMs)
        const check = () => {
          const match = pattern.exec(output)
          if (!match) return
          clearTimeout(timer)
          resolve(match)
        }
        child.stdout.on('data', check)
        child.stderr.on('data', check)
        child.once('exit', (code) => {
          clearTimeout(timer)
          const match = pattern.exec(output)
          if (match) resolve(match)
          else reject(new Error(`exited (${code}):\n${output}`))
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

/** `presmium dev` on a deck: resolves with its server's address once it watches. */
export async function dev(cwd: string, environment: NodeJS.ProcessEnv): Promise<{ running: Running, server: string }> {
  const running = presmium(['dev'], { cwd, env: environment })
  const server = (await running.wait(/^server {2}(http\S+)$/m))[1]!
  await running.wait(/^watching;/m)
  return { running, server }
}

/** The events of a task until its terminal one (`done` or `error`), as a page reads them (SSE). */
export async function taskEvents(url: string, headers: Record<string, string> = {}, onEvent?: (event: AgentEvent) => void): Promise<AgentEvent[]> {
  const response = await fetch(url, { headers: { Accept: 'text/event-stream', ...headers } })
  if (response.status !== 200 || !response.body) throw new Error(`the events answered ${response.status}: ${await response.text()}`)
  const events: AgentEvent[] = []
  const decoder = new TextDecoder()
  let buffer = ''
  for await (const chunk of response.body) {
    buffer += decoder.decode(chunk as Uint8Array, { stream: true })
    let end: number
    while ((end = buffer.indexOf('\n\n')) >= 0) {
      const block = buffer.slice(0, end)
      buffer = buffer.slice(end + 2)
      const data = block.split('\n').filter(line => line.startsWith('data: ')).map(line => line.slice(6)).join('\n')
      if (!data) continue
      const event = JSON.parse(data) as AgentEvent
      events.push(event)
      onEvent?.(event)
      if (event.type === 'done' || event.type === 'error') return events
    }
  }
  return events
}

/** What the scripted agent logged, one object a line. */
export function agentLog(file: string): Record<string, any>[] {
  if (!existsSync(file)) return []
  return readFileSync(file, 'utf8').split('\n').filter(Boolean).map(line => JSON.parse(line) as Record<string, any>)
}

/** A process's command line and environment, from /proc; undefined once it is gone. */
export function processInfo(pid: number): { cmdline: string, environ: Record<string, string> } | undefined {
  try {
    const environ = Object.fromEntries(readFileSync(`/proc/${pid}/environ`, 'utf8').split('\0').filter(Boolean).map((entry) => {
      const at = entry.indexOf('=')
      return [entry.slice(0, at), entry.slice(at + 1)]
    }))
    return { cmdline: readFileSync(`/proc/${pid}/cmdline`, 'utf8').replaceAll('\0', ' '), environ }
  } catch {
    return undefined
  }
}

/** The processes that descend from `pid` now, with their command lines. */
export function descendants(pid: number): { pid: number, cmdline: string }[] {
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
  const out: { pid: number, cmdline: string }[] = []
  const walk = (parent: number) => {
    for (const child of children.get(parent) ?? []) {
      try {
        out.push({ pid: child, cmdline: readFileSync(`/proc/${child}/cmdline`, 'utf8').replaceAll('\0', ' ') })
      } catch {
        continue
      }
      walk(child)
    }
  }
  walk(pid)
  return out
}

// SHARED mode on this machine ------------------------------------------------------------------------

const WORK = join(ROOT, 'examples/demo/.presmium')

export function git(dir: string, args: string[]): string {
  return execFileSync('git', ['-c', 'core.hooksPath=/dev/null', '-c', 'user.name=Test', '-c', 'user.email=test@example.com', '-c', 'commit.gpgSign=false', ...args], { cwd: dir, encoding: 'utf8' })
}

/**
 * A workspace in examples/demo/.presmium (ignored by git), where VitePress resolves from the demo's
 * node_modules: `files` written, packages of the repository linked into its node_modules (installed at
 * the root, as the operator installs them), a git repository of its own.
 */
export function workspace(prefix: string, files: Record<string, string>, link: Record<string, string>): string {
  mkdirSync(WORK, { recursive: true })
  const dir = mkdtempSync(join(WORK, `assistant-${prefix}-`))
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
  return dir
}

/** A port no process listens on now, for a server whose address another must know before it starts. */
export async function freePort(): Promise<number> {
  const server = createServer()
  await new Promise<void>(done => server.listen(0, '127.0.0.1', done))
  const { port } = server.address() as AddressInfo
  await new Promise<void>(done => server.close(() => done()))
  return port
}

export interface RawResponse { status: number, text: string, json<T = Record<string, any>>(): T }

/** A request with any headers, `Host` included (which fetch cannot set). */
export function raw(url: string, options: { method?: string, headers?: Record<string, string>, json?: unknown } = {}): Promise<RawResponse> {
  return new Promise((resolve, reject) => {
    const body = options.json === undefined ? undefined : JSON.stringify(options.json)
    const headers: Record<string, string> = { ...options.headers, ...body === undefined ? {} : { 'Content-Type': 'application/json' } }
    const req = httpRequest(url, { method: options.method ?? (body === undefined ? 'GET' : 'POST'), headers, setHost: !headers.Host }, (res) => {
      let text = ''
      res.setEncoding('utf8').on('data', (chunk: string) => text += chunk)
      res.on('end', () => resolve({ status: res.statusCode ?? 0, text, json: <T>() => JSON.parse(text) as T }))
    })
    req.on('error', reject)
    if (body !== undefined) req.write(body)
    req.end()
  })
}

export interface EventStream {
  events: { event: string, data: Record<string, any> }[]
  /** Resolves with the next event of this name not taken yet. */
  next(event: string, timeoutMs?: number): Promise<Record<string, any>>
  close(): void
}

/** An SSE stream read with these headers (`Host` included). */
export function eventStream(url: string, headers: Record<string, string> = {}): Promise<EventStream> {
  return new Promise((resolve, reject) => {
    const events: EventStream['events'] = []
    const taken = new Set<number>()
    const waiting: { event: string, done: (data: Record<string, any>) => void }[] = []
    const take = () => {
      for (const waiter of [...waiting]) {
        const index = events.findIndex((e, i) => e.event === waiter.event && !taken.has(i))
        if (index < 0) continue
        taken.add(index)
        waiting.splice(waiting.indexOf(waiter), 1)
        waiter.done(events[index]!.data)
      }
    }
    let buffer = ''
    const req = httpRequest(url, { headers: { Accept: 'text/event-stream', ...headers }, setHost: !headers.Host }, (res: IncomingMessage) => {
      if (res.statusCode !== 200) {
        res.resume()
        reject(new Error(`the stream answered ${res.statusCode}`))
        return
      }
      res.setEncoding('utf8').on('data', (chunk: string) => {
        buffer += chunk
        let end: number
        while ((end = buffer.indexOf('\n\n')) >= 0) {
          const block = buffer.slice(0, end)
          buffer = buffer.slice(end + 2)
          const event = /^event: (.*)$/m.exec(block)?.[1] ?? 'message'
          const data = block.split('\n').filter(line => line.startsWith('data: ')).map(line => line.slice(6)).join('\n')
          events.push({ event, data: data ? JSON.parse(data) as Record<string, any> : {} })
        }
        take()
      })
      resolve({
        events,
        next: (event, timeoutMs = 60_000) => new Promise((done, fail) => {
          const timer = setTimeout(() => fail(new Error(`no ${event} event within ${timeoutMs} ms; got ${JSON.stringify(events)}`)), timeoutMs)
          waiting.push({ event, done: (data) => {
            clearTimeout(timer)
            done(data)
          } })
          take()
        }),
        close: () => req.destroy(),
      })
    })
    req.on('error', (error) => {
      if (!('code' in error && error.code === 'ECONNRESET')) reject(error)
    })
    req.end()
  })
}

/** Calls a route of the assistant (`/__presmium/presmium.assistant/<path>`). */
export async function call(server: string, path: string, init: { method?: string, json?: unknown, headers?: Record<string, string> } = {}): Promise<{ status: number, json: Record<string, any> }> {
  const response = await fetch(`${server}/__presmium/presmium.assistant/${path}`, {
    method: init.method ?? (init.json === undefined ? 'GET' : 'POST'),
    headers: { ...init.json === undefined ? {} : { 'Content-Type': 'application/json' }, ...init.headers },
    ...init.json === undefined ? {} : { body: JSON.stringify(init.json) },
  })
  const text = await response.text()
  return { status: response.status, json: text ? JSON.parse(text) as Record<string, any> : {} }
}
