import { isRecord, languageId } from '@lincyaw/kernel'
import type { ComponentNode, IRBlock, MdastNode, RecordedRun, RendererContribution, RenderContext } from '@lincyaw/kernel'
import { declarations, shownOutput } from '../domain/index.ts'
import { ownCode } from './passes.ts'

function lines(text: string): string[] {
  return text ? text.split(/(?<=\n)/) : []
}

function streams(runs: RecordedRun[]): unknown[] {
  return (['stdout', 'stderr'] as const).flatMap((name) => {
    const text = runs.map(run => run[name]).join('')
    return text ? [{ output_type: 'stream', name, text: lines(text) }] : []
  })
}

function kernelLanguage(kernel: unknown): string {
  if (typeof kernel === 'string' && kernel) return languageId(kernel.replace(/[-\d.]+$/, '') || kernel)
  if (isRecord(kernel) && typeof kernel.language === 'string') return languageId(kernel.language)
  return 'python'
}

function notebookCell(node: ComponentNode, _block: IRBlock, ctx: RenderContext) {
  const source = ownCode(node)
  if (!source) return undefined
  const params = node.props.params as Record<string, unknown> | undefined
  const runs = source.outputs ?? []
  const recorded = typeof node.props.recorded === 'string' ? node.props.recorded : undefined
  const output = shownOutput(runs, recorded)
  if (languageId(source.lang) !== kernelLanguage(ctx.config.kernel)) {
    const children: MdastNode[] = [{ type: 'code', lang: source.lang, value: declarations(source.lang, params) + source.value }]
    const text = output.text.trimEnd()
    if (text) children.push({ type: 'code', lang: 'text', value: text })
    return { cell_type: 'markdown' as const, mdast: { type: 'root', children } }
  }
  const outputs = output.recorded ? [{ output_type: 'stream', name: 'stdout', text: lines(output.text) }] : streams(runs)
  const finished = runs.length > 0 && runs.every(run => !run.timedOut)
  const metadata = node.props.timeout !== undefined && !finished ? { tags: ['skip-execution'] } : undefined
  return { cell_type: 'code' as const, source: lines(declarations(source.lang, params) + source.value), outputs, execution_count: null, ...metadata ? { metadata } : {} }
}

export const rendererExtensions: Record<string, RendererContribution> = {
  notebook: {
    components: {
      PmRunPanel: notebookCell,
      PmStepRun: notebookCell,
    },
  },
}
