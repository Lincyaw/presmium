import { spawn } from 'node:child_process'
import type { ChildProcess } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { createInterface } from 'node:readline'

const START_TIMEOUT = 120_000
const PREVIEW_DIR = '.presmium/preview'

const CLI = '@presmium/cli'

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

function presmiumBin(deckDir: string): string {
  const bin = cliBin(join(deckDir, 'package.json')) ?? cliBin(import.meta.url)
  if (!bin) throw new Error(`${CLI} is not installed`)
  return bin
}

export class Previews {
  readonly #urls = new Map<string, Promise<string>>()
  readonly #children = new Set<ChildProcess>()
  readonly #log: (line: string) => void

  constructor(log: (line: string) => void) {
    this.#log = log
  }

  open(entry: string): Promise<string> {
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
        forget()
        fail(new Error(`presmium dev exited with code ${code}`))
      })
    })
  }

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
