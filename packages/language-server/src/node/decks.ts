/**
 * The decks of the open documents and their latest compilation. A deck is
 * compiled with `@presmium/compiler` from the saved files, as `presmium
 * check` does: the compile diagnostics plus the plugins' checks.
 */
import { existsSync, readFileSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import { checkContext } from '@presmium/cli'
import { Compiler, DECK_ENTRY, frontmatterLine } from '@presmium/compiler'
import type { Compilation } from '@presmium/compiler'
import { ANCHOR_LOCK_PATH, CheckRegistry } from '@presmium/kernel'
import type { Finding } from '@presmium/kernel'

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

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
      this.findings = [...compilation.doc.diagnostics, ...await runChecks(compilation)]
      this.compilation = compilation
    } catch (error) {
      this.findings = [{ checkId: 'presmium.compile', severity: 'error', message: errorMessage(error), source: { file: this.entry, line: 1 } }]
    }
    this.#compiled(this)
  }
}

/** The plugins' checks, as `presmium check` runs them; a finding without a source is put on its plugin's frontmatter line. */
async function runChecks(compilation: Compilation): Promise<Finding[]> {
  const text = readFileSync(compilation.entry, 'utf8')
  const checks = new CheckRegistry()
  const lines = new Map<string, number>()
  const findings: Finding[] = []
  for (const { name, plugin } of compilation.plugins) {
    for (const check of plugin?.checks ?? []) {
      try {
        checks.register(check)
        lines.set(check.id, frontmatterLine(text, name))
      } catch (error) {
        findings.push({ checkId: 'presmium.plugins', severity: 'error', message: `plugin "${name}": ${errorMessage(error)}`, source: { file: compilation.entry, line: frontmatterLine(text, name) } })
      }
    }
  }
  for (const finding of await checks.run(checkContext(compilation))) {
    findings.push(finding.source ? finding : { ...finding, source: { file: compilation.entry, line: lines.get(finding.checkId) ?? 1 } })
  }
  return findings
}

/** Whether a Markdown file's frontmatter lists plugins, which makes it a deck entry. */
function declaresPlugins(file: string): boolean {
  try {
    const frontmatter = /^---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/.exec(readFileSync(file, 'utf8'))?.[1]
    return frontmatter !== undefined && /^plugins[ \t]*:/m.test(frontmatter)
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

  /** The deck a source file belongs to, after its compilation under way; undefined for a file of no deck. */
  async of(file: string): Promise<Deck | undefined> {
    const known = this.all()
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
