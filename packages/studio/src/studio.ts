/**
 * The launcher of `presmium studio` (docs/design-dsh.md section 11, WP-96f):
 * the workbench is DeepSeek Harness's web carrier with Presmium's bundle, in a
 * profile of Presmium's (`presmium-studio`) in a home of its own
 * (`$XDG_STATE_HOME/presmium/studio`, never the user's own DeepSeek Harness),
 * and the workspace service (`presmium serve --headless`) of the directory.
 *
 * The start (11.2): a service token; the workspace service on a free port of
 * this machine (or of the `--host` address), whose previews only the
 * workbench's origin may embed; DeepSeek Harness, with the service's address
 * and token, the launcher's patches and the model of the environment; its
 * ready line (`dsh web: <address with the launch token>`, the only hand-over
 * of the token: 17, item 7), which it prints once its rows are active, the
 * documents' workspaces registered among them. The author gets that one
 * address.
 *
 * Supervision (11.2, 14): each process runs under the bundle's watchdog, in a
 * process group of its own that ends when the launcher goes, `kill -9`
 * included; the processes' output goes to a log in the home
 * (`presmium-studio.log`), so the launcher prints nothing but the address.
 */
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
import { dshBin, launchArgs, launchEnv, WATCHDOG, WEB_READY, writeProfile } from '@presmium/dsh/launch'
import { modelEnv } from './model.ts'

/** The profile of DeepSeek Harness that studio writes and starts. */
export const PROFILE = 'presmium-studio'
/** The workbench's port unless `--port` gives one: the same each time, so the browser's cookie for it stays valid. */
export const DEFAULT_PORT = 4320
/** How long each process may take to say it is ready (the first start of DeepSeek Harness builds its client). */
const START_MS = 180_000
/** How long a process may take to end after SIGTERM before its group is killed. */
const STOP_MS = 15_000
/** The log is started again beside a copy (`.1`) past this size. */
const LOG_BYTES = 16 << 20

const PACKAGE_DIR = fileURLToPath(new URL('..', import.meta.url))

export interface StudioOptions {
  /** The workspace root, or a deck's directory (as `presmium serve` takes it). */
  dir: string
  /** The workbench's port; 0 for a free one; by default `DEFAULT_PORT`, or a free one when that is in use. */
  port?: number
  /** One address of this machine to listen on instead of 127.0.0.1 (the local network): no wildcard. */
  host?: string
  /** The environment studio starts with (by default the process's). */
  env?: NodeJS.ProcessEnv
  /** The `presmium` command (`bin/presmium.mjs`) that runs the workspace service; by default that of the `@presmium/cli` studio depends on. */
  presmium?: string
}

export interface Studio {
  /** The one address the author opens: the workbench, with DeepSeek Harness's launch token. */
  url: string
  /** The workspace service's address. */
  service: string
  /** The workspace root, as the service found it. */
  root: string
  /** DeepSeek Harness's home: `$XDG_STATE_HOME/presmium/studio`. */
  home: string
  /** The log of both processes. */
  log: string
  /** Resolves when a process ended by itself, saying which. */
  ended: Promise<string>
  /** Ends DeepSeek Harness, then the workspace service. */
  close(): Promise<void>
}

/** DeepSeek Harness's home for studio: Presmium's state directory, not `~/.dsh` (definitive version, difference 8). */
export function studioHome(env: NodeJS.ProcessEnv = process.env): string {
  return join(env.XDG_STATE_HOME || join(env.HOME || homedir(), '.local', 'state'), 'presmium', 'studio')
}

/** The `presmium` command of the `@presmium/cli` this package depends on: its `bin/presmium.mjs`. */
export function presmiumBin(): string {
  const entry = createRequire(join(PACKAGE_DIR, 'package.json')).resolve('@presmium/cli')
  return join(dirname(dirname(entry)), 'bin', 'presmium.mjs')
}

/** An address in a URL: IPv6 in brackets. */
const urlHost = (host: string) => (host.includes(':') ? `[${host}]` : host)

/** An unspecified address: DeepSeek Harness binds one concrete address only. */
const WILDCARD = /^(?:0\.0\.0\.0|::|(?:0+:){7}0+|::ffff:0\.0\.0\.0)$/i

/** The port `port` of `host` if it is free (0: some free port); undefined when it is in use. */
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

/** The environment without the variables `drop` names. */
function inherited(env: NodeJS.ProcessEnv, drop: (name: string) => boolean): Record<string, string> {
  return Object.fromEntries(Object.entries(env).filter((entry): entry is [string, string] => entry[1] !== undefined && !drop(entry[0])))
}

/** What neither process takes from the author's shell: the variables studio sets itself, and those that change how tools build (NODE_ENV) or listen (PORT). */
const OWN = (name: string) => /^(?:DSH_|PRESMIUM_MODEL_|PRESMIUM_SERVICE_)/.test(name) || ['PRESMIUM_WORKSPACE', 'NODE_ENV', 'PORT'].includes(name)

/** The log of the processes: their lines, each with the process's name; started again past `LOG_BYTES`. */
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
    // A process's last output may arrive after its exit, once the log is closed.
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

/** A process under the watchdog. */
interface Supervised {
  child: ChildProcess
  /** Resolves with the first match of `pattern` in its output so far and to come; rejects when it ends first or after `START_MS`. */
  ready(pattern: RegExp): Promise<RegExpExecArray>
  /** Its output is no longer kept (only logged): it is ready. */
  started(): void
  /** Resolves once it ended. */
  exited: Promise<void>
  /** SIGTERM to the watchdog, which ends the group; SIGKILL to the group after `STOP_MS`. */
  stop(): Promise<void>
}

function supervise(name: string, args: string[], options: { cwd: string, env: Record<string, string>, log: Log }): Supervised {
  // The watchdog's stdin stays open: it closing tells the watchdog the launcher is gone.
  const child = spawn(process.execPath, [WATCHDOG, process.execPath, ...args], { cwd: options.cwd, env: options.env, detached: true, stdio: ['pipe', 'pipe', 'pipe'] })
  child.stdin!.on('error', () => {})
  /** The output until the process is ready. */
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
        /** The end of what it printed, for the reason it did not start. */
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
          // The group is gone.
        }
      }, STOP_MS)
      await exited
      clearTimeout(timer)
    },
  }
}

/** Starts the workspace service and DeepSeek Harness; resolves once the workbench can be opened. */
export async function startStudio(options: StudioOptions): Promise<Studio> {
  const env = options.env ?? process.env
  const host = options.host
  if (host !== undefined && (isIP(host) === 0 || WILDCARD.test(host))) {
    throw new Error(`--host takes one address of this machine, such as 192.168.0.21, not "${host}" (DeepSeek Harness listens on one concrete address, never on all of them)`)
  }
  const port = await choosePort(host ?? '127.0.0.1', options.port)
  // The workbench's origins: the previews accept being embedded by them only.
  const origins = [`http://${urlHost(host ?? '127.0.0.1')}:${port}`, ...!host || host === '127.0.0.1' ? [`http://localhost:${port}`] : []]

  const home = studioHome(env)
  mkdirSync(home, { recursive: true, mode: 0o700 })
  writeProfile(home, PROFILE, 'web')
  const log = new Log(join(home, 'presmium-studio.log'))
  const token = randomBytes(24).toString('base64url')
  const started: Supervised[] = []
  const stopAll = async () => {
    // DeepSeek Harness first: its bundle revokes its session tokens at the service.
    for (const process_ of started.reverse()) await process_.stop()
    started.length = 0
  }

  try {
    // The deck's code runs in the service: no model credentials there (1.2), and its own service token.
    const service = supervise('serve', [
      options.presmium ?? presmiumBin(), 'serve', resolve(options.dir), '--headless', '--port', '0',
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

    // DeepSeek Harness in the workspace root, with the service and the model of the environment (11.3).
    const dsh = supervise('dsh', [
      dshBin(PACKAGE_DIR), ...launchArgs(PROFILE, 'web'), '--port', String(port), '--no-open',
      ...host ? ['--host', host, '--trusted-host', `${urlHost(host)}:${port}`] : [],
    ], {
      cwd: root,
      env: {
        ...inherited(env, name => OWN(name) || ['DEEPSEEK_API_KEY', 'DEEPSEEK_BASE_URL', 'DEEPSEEK_SEARCH_BASE_URL'].includes(name)),
        ...modelEnv(env, home).env,
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
