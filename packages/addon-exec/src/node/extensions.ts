/**
 * How the notebook renders the execution components (P-75). The slides need
 * no extension: the renderer writes the component's tag around its code
 * block, which, being the component's own code, has no run controls or
 * recorded output there (docs/ir.md 5.1).
 *
 * A run panel or stepwise run in the language of the notebook's kernel
 * (`renderers.notebook.kernel`, Python by default) becomes a code cell with
 * the parameters assigned first; code in another language becomes a Markdown
 * cell with the code and its output. The output is the one recorded at
 * compile time, or the panel's `recorded` output where that run failed, timed
 * out or did not happen (P-24). A cell with a timeout that did not finish at
 * compile time may never end; it is tagged `skip-execution`, which Jupyter
 * tools (nbclient, Jupyter Book) honor when they run the notebook.
 */
import { isRecord, languageId } from '@presmium/kernel'
import type { ComponentNode, IRBlock, MdastNode, RecordedRun, RendererContribution, RenderContext } from '@presmium/kernel'
import { declarations, shownOutput } from '../domain/index.ts'
import { ownCode } from './passes.ts'

/** nbformat multiline text: lines that keep their newline. */
function lines(text: string): string[] {
  return text ? text.split(/(?<=\n)/) : []
}

function streams(runs: RecordedRun[]): unknown[] {
  return (['stdout', 'stderr'] as const).flatMap((name) => {
    const text = runs.map(run => run[name]).join('')
    return text ? [{ output_type: 'stream', name, text: lines(text) }] : []
  })
}

/** The language of the notebook's kernel, read as the notebook renderer reads `renderers.notebook.kernel`. */
function kernelLanguage(kernel: unknown): string {
  if (typeof kernel === 'string' && kernel) return languageId(kernel.replace(/[-\d.]+$/, '') || kernel)
  if (isRecord(kernel) && typeof kernel.language === 'string') return languageId(kernel.language)
  return 'python'
}

/** A code cell for code in the kernel's language; a Markdown cell with the code and its output otherwise. */
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
