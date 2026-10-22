import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { errorMessage } from '@lincyaw/kernel'
import type { Finding, IRDocument, RenderOutput } from '@lincyaw/kernel'
import { unshown } from './audience.ts'
import { audienceCompilation } from './compiler.ts'
import type { AudienceCompilation, Compilation } from './compiler.ts'
import { relativeIR, WORK_DIR } from './paths.ts'
import { planRenderRun, renderContext, renderFinding, selectRenderers, translationsFor, unsupportedBlocks, WEB, writeIR } from './renderers.ts'
import type { InstalledRenderer } from './renderers.ts'
import type { CompiledTranslation } from './translations.ts'
import { viewFor } from './views.ts'

export interface RendererOutput {
  renderer: string
  outDir: string
  workDir: string
  base: string
  skipped: RenderOutput['skipped']
}

export interface BuildReport {
  ir: string
  outputs: RendererOutput[]
  findings: Finding[]
}

export interface BuildOptions {
  outDir: string
  to?: string[]
  audience?: string
  quote?: boolean
  scan?: 'outDir' | 'written'
}

export async function build(whole: Compilation, options: BuildOptions): Promise<BuildReport> {
  const compilation = options.audience && options.audience !== whole.audience?.name
    ? { ...whole, doc: whole.audienceDocument(options.audience), audience: whole.audienceCompilation(options.audience) }
    : whole
  const { doc } = compilation
  const ir = await writeIR(relativeIR(doc, compilation.deckDir, compilation.workspaceRoot), options.outDir)
  const { selected, findings } = await selectRenderers(compilation, options.to)
  if (selected.length === 0) findings.push(renderFinding(compilation, 'warning', `no renderer available; only the IR was written to ${ir}`))
  const run = planRenderRun(compilation, selected, true)
  const translated = await translationsFor(compilation, run)
  findings.push(...translated.findings)
  const render = async ({ renderer }: InstalledRenderer) => {
    const reported: Finding[] = []
    const ctx = renderContext(compilation, renderer.id, join(options.outDir, renderer.id), join(compilation.deckDir, WORK_DIR, renderer.id), run, reported)
    if (renderer.id === WEB) ctx.translations = translated.views
    const view = viewFor(doc, renderer.id)
    const unsupported = unsupportedBlocks(view, renderer, ctx.extensions)
    try {
      await mkdir(ctx.outDir, { recursive: true })
      const output = await renderer.build(view, ctx)
      const listed = new Set(output.skipped.map(s => `${s.section}#${s.block}`))
      const result: RendererOutput = { renderer: renderer.id, outDir: output.outDir, workDir: ctx.workDir, base: ctx.base, skipped: [...output.skipped, ...unsupported.filter(s => !listed.has(`${s.section}#${s.block}`))] }
      return { result, reported }
    } catch (error) {
      reported.push(renderFinding(compilation, 'error', `renderer ${renderer.id} failed: ${errorMessage(error)}`))
      return { reported }
    }
  }
  // Each renderer can start its own toolchain. Do not multiply their native pools.
  const results: Awaited<ReturnType<typeof render>>[] = []
  for (const renderer of selected) results.push(await render(renderer))
  const outputs = results.flatMap(({ result }) => result ? [result] : [])
  if (compilation.audience) {
    const scan = audienceScan(compilation.audience, translated.translations, doc)
    const paths = options.scan === 'written' ? [ir, ...outputs.map(output => output.outDir)] : undefined
    findings.push(...await scan.scan(options.outDir, paths, { quote: options.quote ?? true }))
  }
  return { ir, outputs, findings: unique([...doc.diagnostics, ...findings, ...results.flatMap(({ reported }) => reported)]) }
}

function audienceScan(audience: AudienceCompilation, translations: CompiledTranslation[], doc: IRDocument): AudienceCompilation {
  const kept = [doc, ...translations.map(translation => translation.doc)]
  const left = [audience, ...translations.flatMap(translation => (translation.audience ? [translation.audience] : []))].flatMap(own => own.withheld)
  return audienceCompilation(audience.name, unshown(left, kept))
}

function unique(findings: Finding[]): Finding[] {
  const seen = new Set<string>()
  return findings.filter((finding) => {
    const key = JSON.stringify([finding.checkId, finding.severity, finding.message, finding.source?.file, finding.source?.line])
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

export async function prepare(compilation: Compilation, options: { outDir: string, to?: string[], base?: string }): Promise<{ outputs: Omit<RendererOutput, 'skipped'>[], findings: Finding[] }> {
  const { selected, findings } = await selectRenderers(compilation, options.to)
  const run = planRenderRun(compilation, selected, true, options.base)
  const outputs: Omit<RendererOutput, 'skipped'>[] = []
  for (const { renderer } of selected) {
    const ctx = renderContext(compilation, renderer.id, join(options.outDir, renderer.id), join(compilation.deckDir, WORK_DIR, renderer.id), run, findings)
    if (!renderer.prepare) {
      findings.push(renderFinding(compilation, 'warning', `renderer ${renderer.id} prepares nothing`))
      continue
    }
    try {
      await renderer.prepare(viewFor(compilation.doc, renderer.id), ctx)
      outputs.push({ renderer: renderer.id, outDir: ctx.outDir, workDir: ctx.workDir, base: ctx.base })
    } catch (error) {
      findings.push(renderFinding(compilation, 'error', `renderer ${renderer.id} failed: ${errorMessage(error)}`))
    }
  }
  return { outputs, findings: [...compilation.doc.diagnostics, ...findings] }
}
