/**
 * What every host of a compilation does with it the same way (docs/architecture.md
 * 10.2): `presmium check`, the language server, `presmium dev`, `presmium serve`
 * and `presmium-mcp` run the plugins' checks and the publication checks
 * (`Compilation.check`), run one code block now (`runBlock`) and build the
 * whole deck (`buildView`).
 */
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { CheckRegistry, errorMessage, irBlocks } from '@presmium/kernel'
import type { CheckContext, Finding, RunResult } from '@presmium/kernel'
import { frontmatterLine } from './compiler.ts'
import type { Compilation } from './compiler.ts'
import { build } from './renderers.ts'
import type { BuildReport } from './renderers.ts'

/** What the plugins' checks read of a compilation. */
export function checkContext(compilation: Compilation): CheckContext {
  return {
    deckDir: compilation.deckDir,
    workspaceRoot: compilation.workspaceRoot,
    headmatter: compilation.frontmatter,
    src: compilation.src,
    resolvers: compilation.resolvers,
    lock: compilation.lock.toJSON(),
    ir: compilation.doc,
    service: compilation.service,
  }
}

/**
 * The plugins' checks on a compilation, and the publication checks
 * (`presmium.links`, `presmium.forbid`, P-54; with `externalLinks`, lychee
 * checks the external links). A finding without a source, e.g. that of a
 * crashing check, is located at the entry, on the headmatter line of its plugin.
 */
export async function pluginChecks(compilation: Compilation, options: { externalLinks?: boolean } = {}): Promise<Finding[]> {
  const { entry } = compilation
  const text = await readFile(entry, 'utf8').catch(() => '')
  const at = (name: string) => ({ file: entry, line: frontmatterLine(text, name) })
  const checks = new CheckRegistry()
  const places = new Map<string, Finding['source']>()
  const findings: Finding[] = []
  for (const { name, plugin } of compilation.plugins) {
    for (const check of plugin?.checks ?? []) {
      try {
        checks.register(check)
        places.set(check.id, at(name))
      } catch (error) {
        findings.push({ checkId: 'presmium.plugins', severity: 'error', message: `plugin "${name}": ${errorMessage(error)}`, source: at(name) })
      }
    }
  }
  for (const finding of await checks.run(checkContext(compilation))) {
    findings.push(finding.source ? finding : { ...finding, source: places.get(finding.checkId) ?? { file: entry, line: 1 } })
  }
  findings.push(...await compilation.publishChecks({ externalLinks: options.externalLinks }))
  return findings
}

/**
 * Runs one code block of a compilation now, with the executor and the
 * execution options compile time would use; recordings are neither read nor
 * written (MCP's `run_code`, docs/architecture.md 10.6).
 */
export async function runBlock(compilation: Compilation, target: { section: string, block: string }, signal?: AbortSignal): Promise<RunResult> {
  const section = compilation.doc.sections.find(s => s.id === target.section)
  const block = section && [...irBlocks(section.blocks)].find(b => b.id === target.block)
  if (!block || block.node.type !== 'code') throw new Error(`no code block ${target.section}/${target.block}`)
  return compilation.run(block.node, signal)
}

/**
 * A host's build of a compilation into `outDir` (default `<deck>/dist`): the
 * whole deck, as `presmium build` builds it (MCP's `build`). The student
 * build of a deck is `presmium build --audience student` (P-55).
 */
export function buildView(compilation: Compilation, options: { to?: string[], outDir?: string } = {}): Promise<BuildReport> {
  return build(compilation, { outDir: options.outDir ?? join(compilation.deckDir, 'dist'), to: options.to })
}
