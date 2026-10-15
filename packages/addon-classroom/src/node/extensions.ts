/**
 * The classroom components in a notebook, where nothing is live. A quiz is
 * the question with its options (its `fallback`, the answer folded away). An
 * exercise is its prompt and two code cells, the starter code to edit and the
 * checks to run after it. A question box and a pulse only make sense in a
 * classroom and leave no cell.
 */
import type { ComponentNode, MdastNode, RendererExtension } from '@presmium/kernel'
import { writeMd } from 'myst-to-md'
import { VFile } from 'vfile'

/** Markdown of mdast, as the notebook renderer writes it (MyST syntax kept). */
function markdown(mdast: MdastNode): string {
  const file = new VFile()
  writeMd(file, JSON.parse(JSON.stringify(mdast)) as Parameters<typeof writeMd>[1])
  return String(file.result ?? '').trim()
}

/** nbformat multiline text: lines that keep their newline. */
function lines(text: string): string[] {
  return text ? text.split(/(?<=\n)/) : []
}

function code(source: string) {
  return { cell_type: 'code' as const, source: lines(source), outputs: [], execution_count: null }
}

function exerciseCells(node: ComponentNode): unknown[] {
  const prompt = node.children?.find(block => block.node.type === 'markdown')?.node
  const intro = prompt?.type === 'markdown' ? markdown(prompt.mdast) : ''
  return [
    ...intro ? [`**练习**\n\n${intro}`] : [],
    code(String(node.props.starter ?? '')),
    code(`# 校验：先运行上面的单元格，再运行这个单元格；没有报错就是通过。\n${String(node.props.checks ?? '')}`),
  ]
}

export const rendererExtensions: Record<string, Omit<RendererExtension, 'plugin'>> = {
  notebook: {
    components: {
      PmExercise: exerciseCells,
      PmQuestionBox: () => [],
      PmPulse: () => [],
    },
  },
}
