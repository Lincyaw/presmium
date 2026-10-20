import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { CheckRegistry, errorMessage, irBlocks } from '@lincyaw/kernel'
import type { CheckContext, Finding, RunResult } from '@lincyaw/kernel'
import { frontmatterLine } from './compiler.ts'
import type { Compilation } from './compiler.ts'
import { build } from './renderers.ts'
import type { BuildReport } from './renderers.ts'

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

export async function runBlock(compilation: Compilation, target: { section: string, block: string }, signal?: AbortSignal): Promise<RunResult> {
  const section = compilation.doc.sections.find(s => s.id === target.section)
  const block = section && [...irBlocks(section.blocks)].find(b => b.id === target.block)
  if (!block || block.node.type !== 'code') throw new Error(`no code block ${target.section}/${target.block}`)
  return compilation.run(block.node, signal)
}

export function buildView(compilation: Compilation, options: { to?: string[], outDir?: string } = {}): Promise<BuildReport> {
  return build(compilation, { outDir: options.outDir ?? join(compilation.deckDir, 'dist'), to: options.to })
}
