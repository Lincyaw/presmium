/**
 * The preview of P-81: `presmium dev --to web` for a deck, run as a child
 * process of the language server (its output must stay off the protocol
 * stream), one per deck, until the server shuts down.
 */
import { spawn } from 'node:child_process'
import type { ChildProcess } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { createInterface } from 'node:readline'

/** How long `presmium dev` may take to print the web server's URL. */
const START_TIMEOUT = 120_000
/** Working directory of the preview's `presmium dev`, relative to the deck. */
const PREVIEW_DIR = '.presmium/preview'

const CLI = '@presmium/cli'

/** The `presmium` command of the `@presmium/cli` package that `from` resolves. */
function cliBin(from: string): string | undefined {
  let dir: string
  try {
    dir = dirname(createRequire(from).resolve(CLI))
  } catch {
    return undefined
  }
  for (; dirname(dir) !== dir; dir = dirname(dir)) {
    const file = join(dir, 'package.json')
    if (!existsSync(file)) continue
    const pkg = JSON.parse(readFileSync(file, 'utf8')) as { name?: string, bin?: Record<string, string> }
    if (pkg.name === CLI && pkg.bin?.presmium) return join(dir, pkg.bin.presmium)
  }
  return undefined
}

/** The `presmium` command: the deck's own, else the server's. */
function presmiumBin(deckDir: string): string {
  const bin = cliBin(join(deckDir, 'package.json')) ?? cliBin(import.meta.url)
  if (!bin) throw new Error(`${CLI} is not installed`)
  return bin
}

export class Previews {
  readonly #urls = new Map<string, Promise<string>>()
  readonly #children = new Set<ChildProcess>()
  readonly #log: (line: string) => void

  /** `log` receives the output of `presmium dev`. */
  constructor(log: (line: string) => void) {
    this.#log = log
  }

  /** The base URL of the deck's web dev server, started on first use. */
  open(entry: string): Promise<string> {
    let url = this.#urls.get(entry)
    if (!url) {
      url = this.#start(entry)
      this.#urls.set(entry, url)
      url.catch(() => this.#urls.delete(entry))
    }
    return url
  }

  #start(entry: string): Promise<string> {
    const deckDir = dirname(entry)
    // Its own working directory, apart from a `presmium dev` the author runs.
    const args = [presmiumBin(deckDir), 'dev', entry, '--to', 'web', '--out', join(deckDir, PREVIEW_DIR)]
    const child = spawn(process.execPath, args, { cwd: deckDir, stdio: ['ignore', 'pipe', 'pipe'] })
    this.#children.add(child)
    return new Promise((resolve, reject) => {
      let started = false
      // Before the web server is up, a failure stops `presmium dev`.
      const fail = (error: Error) => {
        clearTimeout(timer)
        reject(error)
        if (!started) child.kill('SIGTERM')
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
        this.#urls.delete(entry)
        fail(new Error(`presmium dev exited with code ${code}`))
      })
    })
  }

  /** Stops every preview. */
  async close(): Promise<void> {
    const exits = [...this.#children].map(child => new Promise<void>((done) => {
      child.once('exit', () => done())
      child.kill('SIGTERM')
      setTimeout(() => {
        child.kill('SIGKILL')
        done()
      }, 5000).unref()
    }))
    this.#urls.clear()
    await Promise.all(exits)
  }
}
