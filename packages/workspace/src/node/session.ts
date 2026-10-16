/**
 * A document compiled on demand in `presmium serve` (docs/domain-model.md
 * section 14, "按需编译"): its compiler, compiled when it is first asked for,
 * then again whenever what its IR depends on changes (the source, the files
 * directives and passes read). Compilations run one at a time; a change
 * during one makes one more. Who asked for a compilation travels with it, so
 * the host's `admit` knows whether it may ask the owner to run new code.
 */
import { existsSync, statSync, watch } from 'node:fs'
import type { FSWatcher } from 'node:fs'
import { basename, dirname } from 'node:path'
import type { Compilation, Compiler } from '@presmium/compiler'
import { errorMessage } from '@presmium/kernel'
import type { Logger } from '@presmium/kernel'

/** Who asked for a compilation: an editor or owner (or a change of the source) may make it ask to run new code; a reader may not. */
export interface Trigger {
  mayAsk: boolean
}

export class DocumentSession {
  readonly dir: string
  readonly compiler: Compiler
  /** The trigger of the compilation running now. */
  trigger: Trigger = { mayAsk: false }
  #latest?: Compilation
  #first?: Promise<Compilation>
  #running: Promise<unknown> = Promise.resolve()
  #queued?: Promise<Compilation>
  #queuedTrigger?: Trigger
  readonly #listeners = new Set<(compilation: Compilation) => void | Promise<void>>()
  readonly #watchers = new Map<string, FSWatcher>()
  #relevant = new Map<string, Set<string>>()
  #timer?: NodeJS.Timeout
  #closed = false
  readonly #log: Logger

  constructor(dir: string, compiler: Compiler, log: Logger) {
    this.dir = dir
    this.compiler = compiler
    this.#log = log
  }

  /** The compilation now: the first one is made on the first call. */
  ready(trigger: Trigger = { mayAsk: false }): Promise<Compilation> {
    if (this.#latest) return Promise.resolve(this.#latest)
    if (!this.#first) {
      const first = this.recompile(trigger)
      // A first compilation that failed (an unreadable entry) is tried again on the next call.
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

  /** Called after each compilation, the first included. */
  onCompile(listener: (compilation: Compilation) => void | Promise<void>): () => void {
    this.#listeners.add(listener)
    return () => this.#listeners.delete(listener)
  }

  /** Compiles again after the compilation running now; at most one waits, and the triggers of those asked for meanwhile join (any may ask). */
  recompile(trigger: Trigger): Promise<Compilation> {
    this.#queuedTrigger = { mayAsk: Boolean(this.#queuedTrigger?.mayAsk || trigger.mayAsk) }
    if (this.#queued) return this.#queued
    const next = this.#running.then(async () => {
      this.#queued = undefined
      this.trigger = this.#queuedTrigger ?? { mayAsk: false }
      this.#queuedTrigger = undefined
      const started = Date.now()
      const compilation = await this.compiler.compile()
      this.#latest = compilation
      for (const listener of this.#listeners) {
        try {
          await listener(compilation)
        } catch (error) {
          this.#log.error(`after compiling ${this.dir || '.'}: ${errorMessage(error)}`)
        }
      }
      this.#watch(compilation, started)
      return compilation
    })
    this.#queued = next
    this.#running = next.catch((error: unknown) => this.#log.error(`compiling ${this.dir || '.'} failed: ${errorMessage(error)}`))
    return next
  }

  close(): void {
    this.#closed = true
    clearTimeout(this.#timer)
    for (const watcher of this.#watchers.values()) watcher.close()
    this.#watchers.clear()
    this.#listeners.clear()
  }

  /** Watches the directories of the files the compilation read; a change compiles again (a change of the source may ask to run new code). */
  #watch(compilation: Compilation, started: number): void {
    if (this.#closed) return
    const files = new Set([...compilation.files, ...compilation.dependencies.files])
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
          if (name && this.#relevant.get(dir)?.has(basename(name))) this.#changed()
        }))
      } catch {
        // A directory removed meanwhile is looked at again after the next compilation.
      }
    }
    // A file changed while it compiled is compiled again.
    const modified = [...files].some((file) => {
      const time = statSync(file, { throwIfNoEntry: false })?.mtimeMs ?? 0
      return time >= started - 20 && time <= Date.now()
    })
    if (modified) this.#changed()
  }

  #changed(): void {
    if (this.#closed) return
    clearTimeout(this.#timer)
    this.#timer = setTimeout(() => void this.recompile({ mayAsk: true }).catch(() => undefined), 50)
  }
}
