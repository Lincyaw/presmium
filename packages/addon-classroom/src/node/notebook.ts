import { deckLocale } from '@lincyaw/kernel'
import type { ComponentNode, IRBlock, MdastNode, RenderContext, RendererContribution } from '@lincyaw/kernel'
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

function predictCells(node: ComponentNode): unknown[] {
  return node.fallback ? [{ cell_type: 'markdown', mdast: node.fallback }] : []
}

export const notebookContribution: RendererContribution = {
  components: {
    PmExercise: exerciseCells,
    PmPredict: predictCells,
    PmQuestionBox: () => [],
    PmPulse: () => [],
  },
}
