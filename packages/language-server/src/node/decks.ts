import { basename, join } from 'node:path'
import { readFileSync } from 'node:fs'
import { Compiler, DECK_ENTRY } from '@lincyaw/compiler'
import type { Compilation } from '@lincyaw/compiler'
import { ANCHOR_LOCK_PATH, errorMessage, fnv1a64 } from '@lincyaw/kernel'
import type { Finding } from '@lincyaw/kernel'
import { documentCli } from './document-cli.ts'

export class Deck {
  readonly entry: string
  readonly #compiler: Compiler
  readonly #compiled: (deck: Deck) => void
  compilation?: Compilation
  findings: Finding[] = []
  sourceFingerprint?: string
  #running?: Promise<void>
  #again = false
  #version = 0
  #completedVersion = -1

  constructor(entry: string, compiled: (deck: Deck) => void) {
    this.entry = entry
    this.#compiler = new Compiler(entry, { bundled: documentCli(entry).bundled })
    this.#compiled = compiled
  }

  compile(): Promise<void> {
    if (this.#running) {
      this.#again = true
      return this.#running
    }
    this.#running = (async () => {
      do {
        this.#again = false
        await this.#compileOnce()
      } while (this.#again)
      this.#running = undefined
    })()
    return this.#running
  }

  ready(): Promise<void> {
    return this.#running ?? Promise.resolve()
  }

  invalidate(): void { this.#version++ }
  get findingsCurrent(): boolean { return this.#completedVersion === this.#version }

  dependsOn(file: string): boolean {
    const { compilation } = this
    if (!compilation) return file === this.entry
    return compilation.sourceFiles.includes(file) || compilation.inputs.files.includes(file) || file === join(compilation.deckDir, ANCHOR_LOCK_PATH)
  }

  async #compileOnce(): Promise<void> {
    const version = this.#version
    let attemptedFingerprint: string | undefined
    try { attemptedFingerprint = fnv1a64(readFileSync(this.entry, 'utf8')) } catch { /* The compiler reports unavailable entries. */ }
    try {
      const compilation = await this.#compiler.compile()
      this.findings = [...compilation.doc.diagnostics, ...await compilation.check()]
      this.compilation = compilation
      this.sourceFingerprint = compilation.sourceFingerprints?.[this.entry]
    } catch (error) {
      this.compilation = undefined
      this.sourceFingerprint = attemptedFingerprint
      this.findings = [{ checkId: 'presmium.compile', severity: 'error', message: errorMessage(error), source: { file: this.entry, line: 1 } }]
    }
    this.#completedVersion = version
    if (this.findingsCurrent && !this.#again) this.#compiled(this)
  }
}

export class Decks {
  readonly #decks = new Map<string, Deck>()
  readonly #compiled: (deck: Deck) => void

  constructor(compiled: (deck: Deck) => void) {
    this.#compiled = compiled
  }

  all(): Deck[] {
    return [...this.#decks.values()]
  }

  open(entry: string): Deck {
    let deck = this.#decks.get(entry)
    if (!deck) {
      deck = new Deck(entry, this.#compiled)
      this.#decks.set(entry, deck)
      void deck.compile()
    }
    return deck
  }

  /** Only the canonical JSON entry opens a document; project inputs are watched dependencies. */
  async findByFile(file: string): Promise<Deck | undefined> {
    if (basename(file) !== DECK_ENTRY) return undefined
    const deck = this.open(file)
    await deck.ready()
    return deck
  }
}
