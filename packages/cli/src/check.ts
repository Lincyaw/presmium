import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { ANCHOR_LOCK_PATH, errorMessage } from '@presmium/kernel'
import type { AnchorString, Finding } from '@presmium/kernel'
import { checkContext, Compiler, frontmatterLine, sortFindings } from '@presmium/compiler'
import type { Compilation, CompilerOptions } from '@presmium/compiler'

export interface CheckOptions {
  deck: string
  updateLock?: boolean
  compiler?: CompilerOptions
  environments?: boolean
  externalLinks?: boolean
}

export interface LockUpdate {
  file: string
  anchors: number
  changed: boolean
}

export interface CheckResult {
  entry: string
  findings: Finding[]
  lock?: LockUpdate
}

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
    compilation = await compiler.compile()
  }

  findings.push(...await compilation.check({ externalLinks: options.externalLinks }))
  if (options.environments) findings.push(...await probeEnvironments(compilation, entryText))
  const all = [...compilation.doc.diagnostics, ...findings].map(f => f.source ? f : { ...f, source: { file: compilation.entry, line: 1 } })
  return { entry: compilation.entry, findings: sortFindings(all), lock }
}

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
  if (complete) lock.retain(anchors)
  const text = lock.serialize()
  if (text !== before) {
    await mkdir(dirname(file), { recursive: true })
    await writeFile(file, text)
  }
  return { file, anchors: lock.size, changed: text !== before }
}
