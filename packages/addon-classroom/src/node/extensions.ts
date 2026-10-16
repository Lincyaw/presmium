/**
 * The classroom components in a notebook, where nothing is live. A quiz is
 * the question with its options (its `fallback`, the answer folded away). An
 * exercise is its prompt, given as mdast so the notebook renderer writes it
 * as the deck's Markdown (MyST lowered, local files copied), and two code
 * cells: the starter code to edit and the checks to run after it, labelled in
 * the deck's language. A question box and a pulse only make sense in a
 * classroom and leave no cell.
 */
import { deckLocale } from '@presmium/kernel'
import type { ComponentNode, IRBlock, MdastNode, RenderContext, RendererContribution } from '@presmium/kernel'
import { MESSAGES } from '../domain/index.ts'

function code(source: string) {
  return { cell_type: 'code' as const, source, outputs: [], execution_count: null }
}

function exerciseCells(node: ComponentNode, _block: IRBlock, ctx: RenderContext): unknown[] {
  const t = MESSAGES[deckLocale(ctx.lang)]
  const prompt = node.children?.find(block => block.node.type === 'markdown')?.node
  const intro = prompt?.type === 'markdown' ? prompt.mdast.children ?? [] : []
  const label: MdastNode = { type: 'paragraph', children: [{ type: 'strong', children: [{ type: 'text', value: t.fallback.exercise }] }] }
  return [
    ...intro.length ? [{ cell_type: 'markdown', mdast: { type: 'root', children: [label, ...intro] } }] : [],
    code(String(node.props.starter ?? '')),
    code(`${t.fallback.checkCell}\n${String(node.props.checks ?? '')}`),
  ]
}

export const rendererExtensions: Record<string, RendererContribution> = {
  notebook: {
    components: {
      PmExercise: exerciseCells,
      PmQuestionBox: () => [],
      PmPulse: () => [],
    },
  },
}
