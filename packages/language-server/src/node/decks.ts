/**
 * The decks of the open documents and their latest compilation. A deck is
 * compiled with `@presmium/compiler` from the saved files, as `presmium
 * check` does: the compile diagnostics plus the plugins' checks.
 */
import { existsSync, readFileSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import { Compiler, DECK_ENTRY, readFrontmatter } from '@presmium/compiler'
import type { Compilation } from '@presmium/compiler'
import { ANCHOR_LOCK_PATH, errorMessage } from '@presmium/kernel'
import type { Finding } from '@presmium/kernel'

export class Deck {
  readonly entry: string
  readonly #compiler: Compiler
  readonly #compiled: (deck: Deck) => void
  /** The latest successful compilation. */
  compilation?: Compilation
  /** Diagnostics of the latest compilation; every finding has a source. */
  findings: Finding[] = []
  #running?: Promise<void>
  #again = false

  constructor(entry: string, compiled: (deck: Deck) => void) {
    this.entry = entry
    this.#compiler = new Compiler(entry)
    this.#compiled = compiled
  }

  /** Compiles the deck; a request during a compilation compiles once more after it. */
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

  /** Settles when the compilation under way, if any, is done. */
  ready(): Promise<void> {
    return this.#running ?? Promise.resolve()
  }

  /** Whether a file is a source file of the deck. */
  owns(file: string): boolean {
    return this.compilation ? this.compilation.files.includes(file) : file === this.entry
  }

  /** Whether the compilation read a file: a source, referenced code, the anchor lock. */
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

/** Whether a Markdown file's frontmatter lists plugins, which makes it a deck entry. */
function declaresPlugins(file: string): boolean {
  try {
    return 'plugins' in readFrontmatter(readFileSync(file, 'utf8'))
  } catch {
    return false
  }
}

/** Entries that may hold a file: itself as `lecture.md`, the `lecture.md` of its directory and above, itself when it lists plugins. */
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

  /** `compiled` is called after every compilation of a deck. */
  constructor(compiled: (deck: Deck) => void) {
    this.#compiled = compiled
  }

  all(): Deck[] {
    return [...this.#decks.values()]
  }

  /** The deck of an entry, compiled when first opened. */
  open(entry: string): Deck {
    let deck = this.#decks.get(entry)
    if (!deck) {
      deck = new Deck(entry, this.#compiled)
      this.#decks.set(entry, deck)
      void deck.compile()
    }
    return deck
  }

  /**
   * The deck a source file belongs to; undefined for a file of no deck. A deck
   * whose latest compilation holds the file answers at once, even while it
   * compiles again (R-46); otherwise the compilations under way are awaited.
   */
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
