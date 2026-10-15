/**
 * How the slides and the notebook render the execution components.
 *
 * Slides: the component tag around its code block (the code block is the
 * component's slot, without its recorded output). The renderer gives the
 * component its block's `at` as step scope.
 *
 * Notebook (P-75): a Python run panel or stepwise run becomes a code cell,
 * with the parameters assigned first; code in another language becomes a
 * Markdown cell with the code and its output. The output is the one recorded
 * at compile time, or the panel's `recorded` output where that run failed,
 * timed out or did not happen (P-24). A cell with a timeout that did not
 * finish at compile time may never end; it is tagged `skip-execution`, which
 * Jupyter tools (nbclient, Jupyter Book) honor when they run the notebook.
 */
import type { CodeNode, ComponentNode, RecordedRun, RendererExtension } from '@presmium/kernel'
import { isPython, isScript } from '../domain/index.ts'

function code(node: ComponentNode): CodeNode | undefined {
  const child = node.children?.find(block => block.node.type === 'code')
  return child?.node as CodeNode | undefined
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/\n/g, '&#10;')
}

function fence(lang: string, value: string): string {
  const ticks = '`'.repeat(Math.max(3, ...[...value.matchAll(/`+/g)].map(m => m[0].length + 1)))
  return `${ticks}${lang.replace(/[^\w+-]/g, '')}\n${value}\n${ticks}`
}

/** `<Name prop="text" :prop='json'>` around the code block; Slidev compiles it as a Vue template. */
function slidesTag(node: ComponentNode): string {
  const attrs = Object.entries(node.props).map(([name, value]) => typeof value === 'string'
    ? ` ${name}="${escapeHtml(value)}"`
    : ` :${name}='${JSON.stringify(value).replace(/'/g, '\\u0027').replace(/&/g, '\\u0026')}'`).join('')
  const source = code(node)
  return source ? `<${node.name}${attrs}>\n\n${fence(source.lang, source.value)}\n\n</${node.name}>` : `<${node.name}${attrs} />`
}

/** A parameter value as a Python literal, or as a JavaScript one (`script`). */
function literal(value: unknown, script = false): string {
  if (typeof value === 'boolean') return script ? String(value) : value ? 'True' : 'False'
  return typeof value === 'number' ? String(value) : JSON.stringify(String(value))
}

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

/** The panel's `recorded` output, where it replaces the compile-time runs: none ran, or one failed or timed out (P-24). */
function recordedInstead(node: ComponentNode, runs: RecordedRun[]): string | undefined {
  const recorded = typeof node.props.recorded === 'string' ? node.props.recorded : undefined
  return runs.length > 0 && runs.every(run => run.ok) ? undefined : recorded
}

/** A code cell for Python; a Markdown cell with the code and its output for other languages. */
function notebookCell(node: ComponentNode) {
  const source = code(node)
  if (!source) return undefined
  const params = Object.entries((node.props.params ?? {}) as Record<string, unknown>)
  const runs = source.outputs ?? []
  const recorded = recordedInstead(node, runs)
  if (!isPython(source.lang)) {
    const declared = isScript(source.lang) ? params.map(([name, value]) => `const ${name} = ${literal(value, true)}\n`).join('') : ''
    const output = (recorded ?? runs.map(run => run.stdout + run.stderr).join('')).trimEnd()
    return [fence(source.lang, declared + source.value), ...output ? [fence('text', output)] : []].join('\n\n')
  }
  const assignments = params.map(([name, value]) => `${name} = ${literal(value)}\n`)
  const outputs = recorded === undefined ? streams(runs) : [{ output_type: 'stream', name: 'stdout', text: lines(recorded) }]
  const finished = runs.length > 0 && runs.every(run => !run.timedOut)
  const metadata = node.props.timeout !== undefined && !finished ? { tags: ['skip-execution'] } : undefined
  return { cell_type: 'code' as const, source: [...assignments, ...lines(source.value)], outputs, execution_count: null, ...metadata ? { metadata } : {} }
}

export const rendererExtensions: Record<string, Omit<RendererExtension, 'plugin'>> = {
  slides: {
    components: {
      PmRunPanel: slidesTag,
      PmStepRun: slidesTag,
    },
  },
  notebook: {
    components: {
      PmRunPanel: notebookCell,
      PmStepRun: notebookCell,
    },
  },
}
