import { spawn } from 'node:child_process'
import type { ChildProcess } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { closeSync, mkdirSync, openSync, renameSync, writeSync } from 'node:fs'
import { createRequire } from 'node:module'
import { createServer, isIP } from 'node:net'
import type { AddressInfo } from 'node:net'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { dshBin, launchArgs, launchEnv, WATCHDOG, WEB_READY, writeProfile } from '@lincyaw/dsh/launch'
import { modelEnv } from './model.ts'

export const PROFILE = 'presmium-studio'
export const DEFAULT_PORT = 4320
const START_MS = 180_000
const STOP_MS = 15_000
const LOG_BYTES = 16 << 20

const PACKAGE_DIR = fileURLToPath(new URL('..', import.meta.url))

export interface StudioOptions {
  dir: string
  port?: number
  host?: string
  env?: NodeJS.ProcessEnv
  presmium?: string
}

export interface Studio {
  url: string
  service: string
  root: string
  home: string
  log: string
  ended: Promise<string>
  close(): Promise<void>
}

export function studioHome(env: NodeJS.ProcessEnv = process.env): string {
  return join(env.XDG_STATE_HOME || join(env.HOME || homedir(), '.local', 'state'), 'presmium', 'studio')
}

export function presmiumBin(): string {
  return join(dirname(createRequire(join(PACKAGE_DIR, 'package.json')).resolve('presmium/package.json')), 'bin', 'presmium.mjs')
}

const urlHost = (host: string) => (host.includes(':') ? `[${host}]` : host)

const WILDCARD = /^(?:0\.0\.0\.0|::|(?:0+:){7}0+|::ffff:0\.0\.0\.0)$/i

function freePort(host: string, port: number): Promise<number | undefined> {
  return new Promise((done) => {
    const server = createServer()
    server.once('error', () => done(undefined))
    server.listen(port, host, () => {
      const bound = (server.address() as AddressInfo).port
      server.close(() => done(bound))
    })
  })
}

async function choosePort(host: string, port: number | undefined): Promise<number> {
  if (port) {
    if (await freePort(host, port) === undefined) throw new Error(`port ${port} of ${host} is in use: give another with --port`)
    return port
  }
  const chosen = (port === undefined ? await freePort(host, DEFAULT_PORT) : undefined) ?? await freePort(host, 0)
  if (chosen === undefined) throw new Error(`no free port on ${host}`)
  return chosen
}

function inherited(env: NodeJS.ProcessEnv, drop: (name: string) => boolean): Record<string, string> {
  return Object.fromEntries(Object.entries(env).filter((entry): entry is [string, string] => entry[1] !== undefined && !drop(entry[0])))
}

const OWN = (name: string) => /^(?:DSH_|PRESMIUM_MODEL_|PRESMIUM_SERVICE_)/.test(name) || ['PRESMIUM_WORKSPACE', 'NODE_ENV', 'PORT'].includes(name)

class Log {
  readonly file: string
  #fd: number
  #bytes = 0
  readonly #rest = new Map<string, string>()

  constructor(file: string) {
    this.file = file
    this.#fd = openSync(file, 'w', 0o600)
  }

  write(name: string, text: string): void {
    if (this.#fd < 0) return
    const lines = ((this.#rest.get(name) ?? '') + text).split('\n')
    this.#rest.set(name, lines.pop()!)
    if (lines.length === 0) return
    const out = lines.map(line => `[${name}] ${line}\n`).join('')
    if (this.#bytes + out.length > LOG_BYTES) {
      closeSync(this.#fd)
      renameSync(this.file, `${this.file}.1`)
      this.#fd = openSync(this.file, 'w', 0o600)
      this.#bytes = 0
    }
    this.#bytes += writeSync(this.#fd, out)
  }

  close(): void {
    if (this.#fd < 0) return
    for (const [name, rest] of this.#rest) if (rest) this.write(name, '\n')
    closeSync(this.#fd)
    this.#fd = -1
  }
}

interface Supervised {
  child: ChildProcess
  ready(pattern: RegExp): Promise<RegExpExecArray>
  started(): void
  exited: Promise<void>
  stop(): Promise<void>
}

function supervise(name: string, args: string[], options: { cwd: string, env: Record<string, string>, log: Log }): Supervised {
  const child = spawn(process.execPath, [WATCHDOG, process.execPath, ...args], { cwd: options.cwd, env: options.env, detached: true, stdio: ['pipe', 'pipe', 'pipe'] })
  child.stdin!.on('error', () => {})
  let output: string | undefined = ''
  const waiting = new Set<() => void>()
  const read = (chunk: Buffer) => {
    const text = chunk.toString()
    options.log.write(name, text)
    if (output === undefined) return
    output += text
    for (const check of waiting) check()
  }
  child.stdout!.on('data', read)
  child.stderr!.on('data', read)
  let ended = false
  const exited = new Promise<void>(done => child.once('exit', () => {
    ended = true
    done()
  }))
  return {
    child,
    exited,
    ready(pattern) {
      return new Promise((resolveReady, reject) => {
        const tail = () => (output ?? '').trimEnd().split('\n').slice(-12).map(line => `  ${line}`).join('\n')
        const timer = setTimeout(() => finish(new Error(`${name} did not start within ${START_MS / 1000} s:\n${tail()}\n`)), START_MS)
        const check = () => {
          const match = pattern.exec(output ?? '')
          if (match) finish(match)
        }
        const finish = (result: RegExpExecArray | Error) => {
          clearTimeout(timer)
          waiting.delete(check)
          if (result instanceof Error) reject(result)
          else resolveReady(result)
        }
        waiting.add(check)
        void exited.then(() => finish(new Error(`${name} ended before it was ready:\n${tail()}\n`)))
        check()
      })
    },
    started() {
      output = undefined
    },
    async stop() {
      if (ended) return
      child.kill('SIGTERM')
      const timer = setTimeout(() => {
        try {
          process.kill(-child.pid!, 'SIGKILL')
        } catch {
        }
      }, STOP_MS)
      await exited
      clearTimeout(timer)
    },
  }
}

export async function startStudio(options: StudioOptions): Promise<Studio> {
  const env = options.env ?? process.env
  const host = options.host
  if (host !== undefined && (isIP(host) === 0 || WILDCARD.test(host))) {
    throw new Error(`--host takes one address of this machine, such as 192.168.0.21, not "${host}" (DeepSeek Harness listens on one concrete address, never on all of them)`)
  }
  const port = await choosePort(host ?? '127.0.0.1', options.port)
  const origins = [`http://${urlHost(host ?? '127.0.0.1')}:${port}`, ...!host || host === '127.0.0.1' ? [`http://localhost:${port}`] : []]

  const home = studioHome(env)
  mkdirSync(home, { recursive: true, mode: 0o700 })
  writeProfile(home, PROFILE, 'web')
  const log = new Log(join(home, 'presmium-studio.log'))
  const token = randomBytes(24).toString('base64url')
  const started: Supervised[] = []
  const stopAll = async () => {
    for (const process_ of started.reverse()) await process_.stop()
    started.length = 0
  }

  try {
    const service = supervise('serve', [
      options.presmium ?? presmiumBin(), 'serve', resolve(options.dir), '--port', '0',
      ...host ? ['--host', host] : [],
      ...origins.flatMap(origin => ['--preview-origin', origin]),
    ], {
      cwd: resolve(options.dir),
      env: { ...inherited(env, name => OWN(name) || name.startsWith('DEEPSEEK_')), PRESMIUM_SERVICE_TOKEN: token },
      log,
    })
    started.push(service)
    const url = (await service.ready(/^serve {2}(http\S+)$/m))[1]!
    const root = (await service.ready(/^workspace {2}(.+)$/m))[1]!.trim()
    service.started()

    const dsh = supervise('dsh', [
      dshBin(PACKAGE_DIR), ...launchArgs(PROFILE, 'web'), '--port', String(port), '--no-open',
      ...host ? ['--host', host, '--trusted-host', `${urlHost(host)}:${port}`] : [],
    ], {
      cwd: root,
      env: {
        ...inherited(env, name => OWN(name) || ['DEEPSEEK_API_KEY', 'DEEPSEEK_BASE_URL', 'DEEPSEEK_SEARCH_BASE_URL'].includes(name)),
        ...modelEnv(env).env,
        ...launchEnv(home),
        PRESMIUM_SERVICE_URL: url,
        PRESMIUM_SERVICE_TOKEN: token,
        PRESMIUM_WORKSPACE: root,
      },
      log,
    })
    started.push(dsh)
    const address = (await dsh.ready(WEB_READY))[1]!
    dsh.started()

    let closing: Promise<void> | undefined
    const ended = Promise.race([
      service.exited.then(() => 'the workspace service (presmium serve) ended'),
      dsh.exited.then(() => 'DeepSeek Harness ended'),
    ]).then(how => (closing ? new Promise<string>(() => {}) : how))
    return {
      url: address,
      service: url,
      root,
      home,
      log: log.file,
      ended,
      close() {
        closing ??= stopAll().finally(() => log.close())
        return closing
      },
    }
  } catch (error) {
    await stopAll()
    log.close()
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`${message.endsWith('\n') ? message : `${message}; `}the whole log is ${log.file}`)
  }
}
