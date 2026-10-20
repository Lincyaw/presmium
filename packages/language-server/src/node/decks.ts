import { existsSync, readFileSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import { Compiler, DECK_ENTRY, readFrontmatter } from '@lincyaw/compiler'
import type { Compilation } from '@lincyaw/compiler'
import { ANCHOR_LOCK_PATH, errorMessage } from '@lincyaw/kernel'
import type { Finding } from '@lincyaw/kernel'

export class Deck {
  readonly entry: string
  readonly #compiler: Compiler
  readonly #compiled: (deck: Deck) => void
  compilation?: Compilation
  findings: Finding[] = []
  #running?: Promise<void>
  #again = false

  constructor(entry: string, compiled: (deck: Deck) => void) {
    this.entry = entry
    this.#compiler = new Compiler(entry)
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

  owns(file: string): boolean {
    return this.compilation ? this.compilation.files.includes(file) : file === this.entry
  }

  reads(file: string): boolean {
    const { compilation } = this
    if (!compilation) return file === this.entry
    return compilation.files.includes(file) || compilation.dependencies.files.includes(file) || file === join(compilation.deckDir, ANCHOR_LOCK_PATH)
  }

  async #compileOnce(): Promise<void> {
    try {
      const compilation = await this.#compiler.compile()
      this.findings = [...compilation.doc.diagnostics, ...await compilation.check()]
      this.compilation = compilation
    } catch (error) {
      this.findings = [{ checkId: 'presmium.compile', severity: 'error', message: errorMessage(error), source: { file: this.entry, line: 1 } }]
    }
    this.#compiled(this)
  }
}

function declaresPlugins(file: string): boolean {
  try {
    return 'plugins' in readFrontmatter(readFileSync(file, 'utf8'))
  } catch {
    return false
  }
}

function candidateEntries(file: string): string[] {
  const entries = basename(file) === DECK_ENTRY ? [file] : []
  for (let dir = dirname(file); ; dir = dirname(dir)) {
    const entry = join(dir, DECK_ENTRY)
    if (entry !== file && existsSync(entry)) entries.push(entry)
    if (dirname(dir) === dir) break
  }
  if (basename(file) !== DECK_ENTRY && declaresPlugins(file)) entries.push(file)
  return entries
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

  async of(file: string): Promise<Deck | undefined> {
    const known = this.all()
    const owner = known.find(deck => deck.compilation?.files.includes(file))
    if (owner) return owner
    for (const deck of known) {
      await deck.ready()
      if (deck.owns(file)) return deck
    }
    for (const entry of candidateEntries(file)) {
      if (known.some(deck => deck.entry === entry)) continue
      const deck = this.open(entry)
      await deck.ready()
      if (deck.owns(file)) return deck
    }
    return undefined
  }
}
