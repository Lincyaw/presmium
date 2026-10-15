/**
 * How the slides and the notebook render the execution components.
 *
 * Slides: the component tag around its code block (the code block is the
 * component's slot, without its recorded output). The renderer gives the
 * component its block's `at` as step scope.
 *
 * Notebook: a run panel or stepwise run becomes a code cell (P-75), with the
 * parameters assigned first and the output recorded at compile time.
 */
import type { CodeNode, ComponentNode, RecordedRun, RendererExtension } from '@presmium/kernel'
import { isPython } from '../domain/index.ts'

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

/** A Python literal for a parameter value. */
function literal(value: unknown): string {
  if (typeof value === 'boolean') return value ? 'True' : 'False'
  return typeof value === 'number' ? String(value) : JSON.stringify(String(value))
}

/** nbformat multiline text: lines that keep their newline. */
function lines(text: string): string[] {
  return text ? text.split(/(?<=\n)/) : []
}

function streams(runs: RecordedRun[] = []): unknown[] {
  return (['stdout', 'stderr'] as const).flatMap((name) => {
    const text = runs.map(run => run[name]).join('')
    return text ? [{ output_type: 'stream', name, text: lines(text) }] : []
  })
}

/** A code cell for Python; other languages fall back to the code block (the component's `fallback`). */
function notebookCell(node: ComponentNode) {
  const source = code(node)
  if (!source || !isPython(source.lang)) return undefined
  const params = node.props.params as Record<string, unknown> | undefined
  const assignments = Object.entries(params ?? {}).map(([name, value]) => `${name} = ${literal(value)}\n`)
  return { cell_type: 'code' as const, source: [...assignments, ...lines(source.value)], outputs: streams(source.outputs), execution_count: null }
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
