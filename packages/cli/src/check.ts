import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { ANCHOR_LOCK_PATH, AnchorLock, CheckRegistry, createAnchorResolverRegistry } from '@presmium/kernel'
import type { AnchorString, CheckContext, Finding } from '@presmium/kernel'
import { loadNodePlugins } from './addons.ts'
import type { LoadedPlugin } from './addons.ts'
import { headmatterLine, loadDeck } from './deck.ts'
import { errorMessage } from './errors.ts'
import { createSourceReader, findWorkspaceRoot } from './workspace.ts'

export interface CheckOptions {
  deckDir: string
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

/** Parses the deck, loads its addons' node plugins and runs their checks. */
export async function runCheck(options: CheckOptions): Promise<CheckResult> {
  const deck = await loadDeck(options.deckDir)
  const addonLine = (addon: string) => headmatterLine(deck.entryText, addon)
  const findings: Finding[] = [...deck.findings]
  const fail = (checkId: string, message: string, line = 1, file = deck.entry) =>
    findings.push({ checkId, severity: 'error', message, source: { file, line } })

  const { plugins, problems } = await loadNodePlugins(deck.dir, deck.headmatter.addons)
  for (const p of problems) {
    findings.push({ checkId: 'presmium.addons', severity: p.severity, message: p.message, source: { file: deck.entry, line: addonLine(p.addon) } })
  }

  // Each check remembers the headmatter line of its addon, the default location of its findings.
  const resolvers = createAnchorResolverRegistry()
  const checks = new CheckRegistry()
  const checkLine = new Map<string, number>()
  for (const { addon, plugin } of plugins) {
    try {
      for (const resolver of plugin.resolvers ?? []) resolvers.register(resolver)
      for (const check of plugin.checks ?? []) {
        checks.register(check)
        checkLine.set(check.id, addonLine(addon))
      }
    } catch (error) {
      fail('presmium.addons', `addon "${addon}": ${errorMessage(error)}`, addonLine(addon))
    }
  }

  const lockFile = join(deck.dir, ANCHOR_LOCK_PATH)
  const lockText = await readFile(lockFile, 'utf8').catch(() => undefined)
  let lock = AnchorLock.empty()
  try {
    lock = AnchorLock.parse(lockText)
  } catch (error) {
    if (!options.updateLock) fail('presmium.lock', errorMessage(error), 1, lockFile)
  }

  const workspaceRoot = await findWorkspaceRoot(deck.dir)
  const ctx: CheckContext = {
    deckDir: deck.dir,
    workspaceRoot,
    headmatter: deck.headmatter,
    slides: deck.slides,
    src: createSourceReader(workspaceRoot),
    resolvers,
    lock: lock.toJSON(),
  }

  let lockUpdate: LockUpdate | undefined
  if (options.updateLock) {
    const used = await collectAnchors(plugins, ctx, (addon, error) =>
      fail('presmium.addons', `addon "${addon}" failed to list anchors: ${errorMessage(error)}`, addonLine(addon)))
    for (const anchor of used.anchors) lock.record(anchor, await resolvers.resolve(anchor, ctx.src, lock.get(anchor)))
    // Prune only when every plugin listed its anchors, so a failing plugin keeps its records.
    if (used.complete) lock.retain(used.anchors)
    const text = lock.serialize()
    if (text !== lockText) {
      await mkdir(dirname(lockFile), { recursive: true })
      await writeFile(lockFile, text)
    }
    ctx.lock = lock.toJSON()
    lockUpdate = { file: lockFile, anchors: lock.size, changed: text !== lockText }
  }

  for (const finding of await checks.run(ctx)) {
    findings.push({ ...finding, source: finding.source ?? { file: deck.entry, line: checkLine.get(finding.checkId) ?? 1 } })
  }
  return { entry: deck.entry, findings: sortFindings(findings), lock: lockUpdate }
}

async function collectAnchors(
  plugins: LoadedPlugin[],
  ctx: CheckContext,
  onError: (addon: string, error: unknown) => void,
): Promise<{ anchors: AnchorString[], complete: boolean }> {
  const anchors = new Set<AnchorString>()
  let complete = true
  for (const { addon, plugin } of plugins) {
    try {
      for (const anchor of await plugin.anchors?.(ctx) ?? []) anchors.add(anchor)
    } catch (error) {
      complete = false
      onError(addon, error)
    }
  }
  return { anchors: [...anchors].sort(), complete }
}

function sortFindings(findings: Finding[]): Finding[] {
  const file = (f: Finding) => f.source?.file ?? ''
  const line = (f: Finding) => f.source?.line ?? 0
  return findings.toSorted((a, b) => file(a) < file(b) ? -1 : file(a) > file(b) ? 1 : line(a) - line(b))
}
