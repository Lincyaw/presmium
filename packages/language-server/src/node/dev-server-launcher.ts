import { spawn } from 'node:child_process'
import type { ChildProcess } from 'node:child_process'
import { dirname, join } from 'node:path'
import { createInterface } from 'node:readline'
import { findPackageBin } from '@lincyaw/kernel/node'

const START_TIMEOUT = 120_000
const PREVIEW_DIR = '.presmium/preview'

const CLI = '@lincyaw/cli'

function presmiumBin(deckDir: string): string {
  const bin = findPackageBin(CLI, 'presmium', join(deckDir, 'package.json')) ?? findPackageBin(CLI, 'presmium', import.meta.url)
  if (!bin) throw new Error(`${CLI} is not installed`)
  return bin
}

function stopProcess(child: ChildProcess, signal: NodeJS.Signals = 'SIGTERM'): void {
  if (!child.pid || child.exitCode !== null || child.signalCode !== null) return
  if (process.platform === 'win32') {
    const task = spawn('taskkill', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' })
    task.once('error', () => { child.kill(signal) })
  } else child.kill(signal)
}

/** Starts a `presmium dev` web server for each deck the editor previews, once, and stops them all on close. */
export class DevServerLauncher {
  readonly #urls = new Map<string, Promise<string>>()
  readonly #children = new Set<ChildProcess>()
  readonly #log: (line: string) => void

  constructor(log: (line: string) => void) {
    this.#log = log
  }

  /** The address of the deck's dev server, started on first use. */
  urlOf(entry: string): Promise<string> {
    const known = this.#urls.get(entry)
    if (known) return known
    const forget = () => {
      if (this.#urls.get(entry) === url) this.#urls.delete(entry)
    }
    const url: Promise<string> = this.#start(entry, forget)
    this.#urls.set(entry, url)
    url.catch(forget)
    return url
  }

  #start(entry: string, forget: () => void): Promise<string> {
    const deckDir = dirname(entry)
    const args = [presmiumBin(deckDir), 'dev', entry, '--to', 'web', '--out', join(deckDir, PREVIEW_DIR)]
    const child = spawn(process.execPath, args, { cwd: deckDir, stdio: ['ignore', 'pipe', 'pipe'] })
    this.#children.add(child)
    return new Promise((resolve, reject) => {
      let started = false
      const fail = (error: Error) => {
        clearTimeout(timer)
        reject(error)
        if (!started) stopProcess(child)
      }
      const timer = setTimeout(() => fail(new Error('presmium dev did not start the web server in time')), START_TIMEOUT)
      createInterface({ input: child.stderr! }).on('line', line => this.#log(line))
      createInterface({ input: child.stdout! }).on('line', (line) => {
        this.#log(line)
        if (started) return
        const url = /^web\s+(https?:\/\/\S+)/.exec(line)?.[1]
        if (url) {
          started = true
          clearTimeout(timer)
          resolve(url)
        } else if (line.startsWith('watching;')) {
          fail(new Error('presmium dev started no web server; is the web renderer installed?'))
        }
      })
      child.once('error', fail)
      child.once('exit', (code) => {
        this.#children.delete(child)
        forget()
        fail(new Error(`presmium dev exited with code ${code}`))
      })
    })
  }

  async close(): Promise<void> {
    const exits = [...this.#children].map(child => new Promise<void>((done) => {
      const timer = setTimeout(() => {
        stopProcess(child, 'SIGKILL')
        done()
      }, 5000).unref()
      child.once('exit', () => { clearTimeout(timer); done() })
      stopProcess(child)
    }))
    this.#urls.clear()
    await Promise.all(exits)
  }
}
