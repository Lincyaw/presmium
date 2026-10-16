/**
 * The plugin's side of its helper process (./helper.ts, docs/architecture.md
 * 10.6): started with `PATH`, `HOME` and `DELTABOX_STATE_DIR` only, in a
 * process group of its own (a Ctrl-C of the terminal reaches `presmium`,
 * which closes its reviews, not the helper), through jiti as the CLI loads
 * TypeScript. One helper per state directory and process, started on first
 * use; it keeps `presmium` running only while a request is under way. When
 * nothing else keeps `presmium` running, its helpers are closed and waited
 * for; a helper whose `presmium` ended otherwise (a signal, `process.exit`)
 * ends its sessions alone once its standard input closes.
 */
import { spawn, spawnSync } from 'node:child_process'
import type { ChildProcess } from 'node:child_process'
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { createInterface } from 'node:readline'
import { fileURLToPath, pathToFileURL } from 'node:url'
import type { Logger } from '@presmium/kernel'
import type { Answer, Probe } from './protocol.ts'
import { orphans } from './records.ts'

const HELPER = fileURLToPath(new URL('./helper.ts', import.meta.url))
const JITI = pathToFileURL(join(dirname(createRequire(import.meta.url).resolve('jiti/package.json')), 'lib/jiti-register.mjs')).href

/** The helper's whole environment. */
function helperEnv(stateDir: string): Record<string, string> {
  return { PATH: process.env.PATH ?? '/usr/bin:/bin', HOME: homedir(), DELTABOX_STATE_DIR: stateDir }
}

/** What decides a host's qualification within one boot: the boot, deltabox's version and this plugin's. */
function hostKey(): string {
  const require = createRequire(import.meta.url)
  const versions = [require('deltabox-lite/package.json'), require('../../package.json')].map(pkg => (pkg as { version: string }).version)
  let boot = ''
  try {
    boot = readFileSync('/proc/sys/kernel/random/boot_id', 'utf8').trim()
  } catch {}
  return [boot, ...versions].join(' ')
}

const probes = new Map<string, Probe>()

/**
 * Whether this host qualifies (`helper.ts probe`, which first restores the
 * sessions crashed helpers left). Asked once per state directory and
 * process; a host that qualified is not asked again in the same boot unless
 * a crash left sessions behind. macOS is not asked: it stays off until
 * verified there.
 */
export function probe(stateDir: string, log?: Logger): Probe {
  let found = probes.get(stateDir)
  if (!found) probes.set(stateDir, found = process.platform === 'darwin' ? { ok: false, reason: 'macos', detail: process.arch } : ask(stateDir, log))
  return found
}

function ask(stateDir: string, log?: Logger): Probe {
  const cache = join(stateDir, 'presmium', 'probe.json')
  const key = hostKey()
  try {
    const kept = JSON.parse(readFileSync(cache, 'utf8')) as { key: string, probe: Probe }
    if (kept.key === key && kept.probe.ok && orphans(stateDir).length === 0) return kept.probe
  } catch {}
  mkdirSync(join(stateDir, 'presmium'), { recursive: true })
  const result = spawnSync(process.execPath, ['--import', JITI, HELPER, 'probe'], { env: helperEnv(stateDir), encoding: 'utf8', timeout: 120_000 })
  // What the helper says on the way (a crashed session it could not restore) goes to the startup log.
  for (const line of (result.stderr ?? '').split('\n')) if (line.trim()) log?.warn(line)
  try {
    const found = JSON.parse(result.stdout.trim().split('\n').at(-1)!) as Probe
    writeFileSync(`${cache}.${process.pid}`, JSON.stringify({ key, probe: { ...found, recovered: [] } }))
    renameSync(`${cache}.${process.pid}`, cache)
    return found
  } catch {
    return { ok: false, reason: 'helper', detail: (result.stderr || result.error?.message || `exit ${result.status}`).trim().split('\n').slice(-3).join(' ') }
  }
}

interface Pending {
  resolve(value: unknown): void
  reject(error: Error): void
}

/** The helper of one state directory: requests as calls, a running request cancelled with its signal. */
export class Helper {
  #child?: ChildProcess
  readonly #pending = new Map<number, Pending>()
  #next = 1
  #stderr = ''
  #closing = false

  readonly stateDir: string
  readonly log: Logger

  constructor(stateDir: string, log: Logger) {
    this.stateDir = stateDir
    this.log = log
  }

  call<T>(method: string, params: object, signal?: AbortSignal): Promise<T> {
    const child = this.#start()
    const id = this.#next++
    const cancel = () => this.#write(child, { id: this.#next++, method: 'cancel', params: { request: id } })
    return new Promise<T>((resolve, reject) => {
      this.#pending.set(id, {
        resolve: value => resolve(value as T),
        reject,
      })
      this.#hold(true)
      this.#write(child, { id, method, params })
      if (signal?.aborted) cancel()
      else signal?.addEventListener('abort', cancel, { once: true })
    }).finally(() => signal?.removeEventListener('abort', cancel))
  }

  #write(child: ChildProcess, request: object): void {
    child.stdin!.write(`${JSON.stringify(request)}\n`)
  }

  #start(): ChildProcess {
    if (this.#child) return this.#child
    mkdirSync(this.stateDir, { recursive: true })
    const child = spawn(process.execPath, ['--import', JITI, HELPER], { env: helperEnv(this.stateDir), stdio: ['pipe', 'pipe', 'pipe'], detached: true })
    this.#child = child
    this.#stderr = ''
    child.stdin!.on('error', () => {})
    createInterface({ input: child.stdout! }).on('line', (line) => {
      let answer: Answer
      try {
        answer = JSON.parse(line) as Answer
      } catch {
        return
      }
      const pending = this.#pending.get(answer.id)
      if (!pending) return
      this.#pending.delete(answer.id)
      if ('error' in answer) pending.reject(new Error(answer.error))
      else pending.resolve(answer.result)
      this.#hold(this.#pending.size > 0)
    })
    createInterface({ input: child.stderr! }).on('line', (line) => {
      this.#stderr = `${this.#stderr}${line}\n`.slice(-4000)
      this.log.warn(line)
    })
    const fail = (why: string) => {
      if (this.#child === child) {
        this.#child = undefined
        this.#closing = false
      }
      const error = new Error(`the deltabox helper ${why}${this.#stderr ? `: ${this.#stderr.trim()}` : ''}`)
      for (const pending of this.#pending.values()) pending.reject(error)
      this.#pending.clear()
    }
    child.on('error', error => fail(`failed: ${error.message}`))
    child.on('exit', (code, signal) => fail(`exited (${signal ?? code})`))
    return child
  }

  /**
   * Ends the helper: it rolls back its reviews and stops its sessions, and
   * this process keeps running until it has (for at most `CLOSING_MS`, then
   * the helper finishes alone).
   */
  close(): void {
    const child = this.#child
    if (!child || this.#closing) return
    this.#closing = true
    this.#hold(true)
    const timer = setTimeout(() => this.#hold(false), CLOSING_MS)
    child.once('exit', () => clearTimeout(timer))
    child.stdin!.end()
  }

  /** The helper keeps this process running only while a request is under way (or it is closing). */
  #hold(busy: boolean): void {
    const child = this.#child
    if (!child) return
    for (const handle of [child, child.stdin, child.stdout, child.stderr] as { ref?(): void, unref?(): void }[]) {
      if (busy) handle?.ref?.()
      else handle?.unref?.()
    }
  }
}

const CLOSING_MS = 30_000

const helpers = new Map<string, Helper>()

// Once nothing else keeps this process running, its helpers end, and it waits for them.
process.on('beforeExit', () => {
  for (const helper of helpers.values()) helper.close()
})

/** The helper of a state directory in this process. */
export function helperFor(stateDir: string, log: Logger): Helper {
  let helper = helpers.get(stateDir)
  if (!helper) helpers.set(stateDir, helper = new Helper(stateDir, log))
  return helper
}
