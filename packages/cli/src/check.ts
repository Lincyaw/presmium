import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { ANCHOR_LOCK_PATH, errorMessage } from '@presmium/kernel'
import type { AnchorString, Finding } from '@presmium/kernel'
import { checkContext, Compiler, frontmatterLine, sortFindings } from '@presmium/compiler'
import type { Compilation, CompilerOptions } from '@presmium/compiler'

export interface CheckOptions {
  /** Deck directory or entry file. */
  deck: string
  /** Re-resolve the deck's anchors and rewrite `.presmium/anchors.lock.json` before checking. */
  updateLock?: boolean
  /** What the host gives the compiler (e.g. where Presmium's own packages are installed). */
  compiler?: CompilerOptions
  /** Connect to the declared environments (`presmium check --env`, P-100). */
  environments?: boolean
  /** Check the external links with lychee when it is installed (`presmium check --external-links`, P-54). */
  externalLinks?: boolean
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

/**
 * Compiles the deck to its validated IR (docs/ir.md section 7), for an
 * audience when `compiler.audience` names one, and runs the plugins' checks
 * and the publication checks.
 */
export async function runCheck(options: CheckOptions): Promise<CheckResult> {
  const compiler = new Compiler(options.deck, options.compiler)
  let compilation = await compiler.compile()
  const entryText = await readFile(compilation.entry, 'utf8')
  const findings: Finding[] = []
  const fail = (message: string, line: number) =>
    findings.push({ checkId: 'presmium.plugins', severity: 'error', message, source: { file: compilation.entry, line } })

  let lock: LockUpdate | undefined
  if (options.updateLock) {
    lock = await updateLock(compilation, (name, error) => fail(`plugin "${name}" failed to list anchors: ${errorMessage(error)}`, frontmatterLine(entryText, name)))
    // Plugin passes read the lock, so the IR is compiled again against the new one.
    compilation = await compiler.compile()
  }

  findings.push(...await compilation.check({ externalLinks: options.externalLinks }))
  if (options.environments) findings.push(...await probeEnvironments(compilation, entryText))
  const all = [...compilation.doc.diagnostics, ...findings].map(f => f.source ? f : { ...f, source: { file: compilation.entry, line: 1 } })
  return { entry: compilation.entry, findings: sortFindings(all), lock }
}

/**
 * `presmium check --env`: each declared environment's provider connects to it
 * (`EnvironmentProvider.probe`); one that cannot be reached is an error on its
 * line of the headmatter, with the provider's reason.
 */
export async function probeEnvironments(compilation: Compilation, text: string): Promise<Finding[]> {
  const findings: Finding[] = []
  for (const { name, spec, provider, context } of compilation.environments) {
    let reason: string | undefined
    try {
      reason = await provider.probe?.(name, spec, context)
    } catch (error) {
      reason = errorMessage(error)
    }
    if (reason) findings.push({ checkId: 'presmium.execute', severity: 'error', message: `environment "${name}" (${spec.kind}) is not reachable: ${reason}`, source: { file: compilation.entry, line: frontmatterLine(text, `${name}:`) } })
  }
  return findings
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
