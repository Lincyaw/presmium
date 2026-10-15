import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { ANCHOR_LOCK_PATH, CheckRegistry } from '@presmium/kernel'
import type { AnchorString, CheckContext, Finding } from '@presmium/kernel'
import { Compiler, frontmatterLine, sortFindings } from '@presmium/compiler'
import type { Compilation } from '@presmium/compiler'
import { errorMessage } from './errors.ts'

export interface CheckOptions {
  /** Deck directory or entry file. */
  deck: string
  /** Re-resolve the deck's anchors and rewrite `.presmium/anchors.lock.json` before checking. */
  updateLock?: boolean
}

export interface LockUpdate {
  /** Absolute path of the lock file. */
  file: string
  anchors: number
  changed: boolean
}

export interface CheckResult {
  /** Absolute path of the deck entry file. */
  entry: string
  /** Every finding has a source; findings are ordered by file and line. */
  findings: Finding[]
  lock?: LockUpdate
}

/** Compiles the deck to its validated IR (docs/ir.md section 7) and runs the plugins' checks. */
export async function runCheck(options: CheckOptions): Promise<CheckResult> {
  const compiler = new Compiler(options.deck)
  let compilation = await compiler.compile()
  const entryText = await readFile(compilation.entry, 'utf8')
  const pluginLine = (name: string) => frontmatterLine(entryText, name)
  const findings: Finding[] = []
  const fail = (message: string, line: number) =>
    findings.push({ checkId: 'presmium.plugins', severity: 'error', message, source: { file: compilation.entry, line } })

  let lock: LockUpdate | undefined
  if (options.updateLock) {
    lock = await updateLock(compilation, (name, error) => fail(`plugin "${name}" failed to list anchors: ${errorMessage(error)}`, pluginLine(name)))
    // Plugin passes read the lock, so the IR is compiled again against the new one.
    compilation = await compiler.compile()
  }

  // A crashing check is located at the entry, on the frontmatter line of its plugin.
  const checks = new CheckRegistry()
  const checkLine = new Map<string, number>()
  for (const { name, plugin } of compilation.plugins) {
    try {
      for (const check of plugin?.checks ?? []) {
        checks.register(check)
        checkLine.set(check.id, pluginLine(name))
      }
    } catch (error) {
      fail(`plugin "${name}": ${errorMessage(error)}`, pluginLine(name))
    }
  }
  for (const finding of await checks.run(checkContext(compilation))) {
    findings.push({ ...finding, source: finding.source ?? { file: compilation.entry, line: checkLine.get(finding.checkId) ?? 1 } })
  }
  const all = [...compilation.doc.diagnostics, ...findings].map(f => f.source ? f : { ...f, source: { file: compilation.entry, line: 1 } })
  return { entry: compilation.entry, findings: sortFindings(all), lock }
}

export function checkContext(compilation: Compilation): CheckContext {
  return {
    deckDir: compilation.deckDir,
    workspaceRoot: compilation.workspaceRoot,
    headmatter: compilation.frontmatter,
    slides: compilation.slides,
    src: compilation.src,
    resolvers: compilation.resolvers,
    lock: compilation.lock.toJSON(),
    ir: compilation.doc,
  }
}

async function updateLock(compilation: Compilation, onError: (plugin: string, error: unknown) => void): Promise<LockUpdate> {
  const file = join(compilation.deckDir, ANCHOR_LOCK_PATH)
  const before = await readFile(file, 'utf8').catch(() => undefined)
  const ctx = checkContext(compilation)
  const anchors = new Set<AnchorString>()
  let complete = true
  for (const { name, plugin } of compilation.plugins) {
    try {
      for (const anchor of await plugin?.anchors?.(ctx) ?? []) anchors.add(anchor)
    } catch (error) {
      complete = false
      onError(name, error)
    }
  }
  const { lock } = compilation
  for (const anchor of [...anchors].sort()) lock.record(anchor, await compilation.resolvers.resolve(anchor, ctx.src, lock.get(anchor)))
  // Prune only when every plugin listed its anchors, so a failing plugin keeps its records.
  if (complete) lock.retain(anchors)
  const text = lock.serialize()
  if (text !== before) {
    await mkdir(dirname(file), { recursive: true })
    await writeFile(file, text)
  }
  return { file, anchors: lock.size, changed: text !== before }
}
