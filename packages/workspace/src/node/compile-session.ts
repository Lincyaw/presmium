import { existsSync, statSync, watch } from 'node:fs'
import type { FSWatcher } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import type { Compilation, Compiler } from '@lincyaw/compiler'
import { errorMessage } from '@lincyaw/kernel'
import type { Logger } from '@lincyaw/kernel'

/** One document of the workspace server: its compiler, the latest compilation, and recompiling when a file it read changes. */
export class CompileSession {
  readonly dir: string
  readonly compiler: Compiler
  #latest?: Compilation
  #first?: Promise<Compilation>
  #running: Promise<unknown> = Promise.resolve()
  #queued?: Promise<Compilation>
  readonly #listeners = new Set<(compilation: Compilation, changed: string[]) => void | Promise<void>>()
  readonly #failures = new Set<(error: unknown) => void>()
  #changedFiles = new Set<string>()
  readonly #watchers = new Map<string, FSWatcher>()
  #relevant = new Map<string, Set<string>>()
  #timer?: NodeJS.Timeout
  #closed = false
  #compiling = false
  #version = 0
  #controller?: AbortController
  readonly #observed = new Map<string, number>()
  readonly #log: Logger

  constructor(dir: string, compiler: Compiler, log: Logger) {
    this.dir = dir
    this.compiler = compiler
    this.#log = log
  }

  ready(): Promise<Compilation> {
    if (this.#latest) return Promise.resolve(this.#latest)
    if (!this.#first) {
      const first = this.recompile()
      first.catch(() => {
        if (this.#first === first) this.#first = undefined
      })
      this.#first = first
    }
    return this.#first
  }

  get latest(): Compilation | undefined {
    return this.#latest
  }

  onCompile(listener: (compilation: Compilation, changed: string[]) => void | Promise<void>): () => void {
    this.#listeners.add(listener)
    return () => this.#listeners.delete(listener)
  }

  onFailure(listener: (error: unknown) => void): () => void {
    this.#failures.add(listener)
    return () => { this.#failures.delete(listener) }
  }

  recompile(): Promise<Compilation> {
    if (this.#queued) return this.#queued
    const next = this.#running.then(async () => {
      this.#queued = undefined
      this.#compiling = true
      try {
        let compilation: Compilation | undefined
        const changed = new Set<string>()
        let version: number
        do {
          version = this.#version
          for (const file of this.#changedFiles) changed.add(file)
          this.#changedFiles.clear()
          const started = Date.now()
          this.#log.info(`[compile] document=${JSON.stringify(this.dir || '.')} state=started changed=${changed.size}`)
          const controller = this.#controller = new AbortController()
          try {
            compilation = await this.compiler.compile({ signal: controller.signal })
          } catch (error) {
            if (!this.#closed && controller.signal.aborted && version !== this.#version) continue
            throw error
          }
          this.#watch(compilation, started)
          this.#log.info(`[compile] document=${JSON.stringify(this.dir || '.')} state=compiled elapsedMs=${Date.now() - started} sections=${compilation.doc.sections.length} diagnostics=${compilation.doc.diagnostics.length}`)
        } while (!this.#closed && version !== this.#version)
        if (!compilation) throw new Error('the compilation did not complete')
        if (this.#closed) return compilation
        this.#latest = compilation
        for (const listener of this.#listeners) {
          try {
            await listener(compilation, [...changed])
          } catch (error) {
            this.#log.error(`after compiling ${this.dir || '.'}: ${errorMessage(error)}`)
          }
        }
        return compilation
      } finally {
        this.#controller = undefined
        this.#compiling = false
        if (!this.#closed && this.#changedFiles.size > 0) this.#schedule()
      }
    })
    this.#queued = next
    this.#running = next.catch((error: unknown) => {
      if (!this.#closed) {
        this.#log.error(`compiling ${this.dir || '.'} failed: ${errorMessage(error)}`)
        for (const listener of this.#failures) listener(error)
      }
    })
    return next
  }

  close(): void {
    this.#closed = true
    this.#controller?.abort()
    clearTimeout(this.#timer)
    for (const watcher of this.#watchers.values()) watcher.close()
    this.#watchers.clear()
    this.#listeners.clear()
    this.#failures.clear()
  }

  #watch(compilation: Compilation, started: number): void {
    if (this.#closed) return
    const files = new Set([...compilation.sourceFiles, ...compilation.inputs.files])
    const next = new Map<string, Set<string>>()
    for (const file of files) {
      let dir = dirname(file)
      let name = basename(file)
      while (!existsSync(dir) && dirname(dir) !== dir) {
        name = basename(dir)
        dir = dirname(dir)
      }
      next.set(dir, (next.get(dir) ?? new Set<string>()).add(name))
    }
    this.#relevant = next
    for (const [dir, watcher] of this.#watchers) {
      if (next.has(dir)) continue
      watcher.close()
      this.#watchers.delete(dir)
    }
    for (const dir of next.keys()) {
      if (this.#watchers.has(dir)) continue
      try {
        this.#watchers.set(dir, watch(dir, (_event, name) => {
          if (name && this.#relevant.get(dir)?.has(basename(name))) this.#changed(join(dir, name))
        }))
      } catch {
      }
    }
    const modified = [...files].filter((file) => {
      const time = statSync(file, { throwIfNoEntry: false })?.mtimeMs ?? 0
      const changed = time >= started - 20 && time <= Date.now() && this.#observed.get(file) !== time
      this.#observed.set(file, time)
      return changed
    })
    for (const file of this.#observed.keys()) if (!files.has(file)) this.#observed.delete(file)
    for (const file of modified) this.#changed(file)
  }

  #changed(file: string): void {
    if (this.#closed) return
    this.#changedFiles.add(file)
    this.#observed.set(file, statSync(file, { throwIfNoEntry: false })?.mtimeMs ?? 0)
    this.#version++
    this.#controller?.abort()
    if (!this.#compiling) this.#schedule()
  }

  #schedule(): void {
    clearTimeout(this.#timer)
    this.#timer = setTimeout(() => void this.recompile().catch(() => undefined), 10)
  }
}
