/**
 * The execution plugin's IR passes (docs/ir.md section 4).
 *
 * - `presmium.exec.timeouts` (step 6): code that runs (`:run:` on a code
 *   block, `{code-ref}` or a run panel) without a timeout of its own gets
 *   `presmium.exec.timeoutMs` of its section, when the configuration sets one,
 *   so a section's `{config}` and the global option bound compile-time and
 *   live runs alike (R-26).
 * - `presmium.exec.panels` (step 6): a run panel runs its code where the
 *   code's run says, the environment (`:env:`, compiled to the executor)
 *   and the session (`:session:`) the compiler read on the directive
 *   (docs/ir.md 2.7), so it gets them as props.
 * - `presmium.exec.fallbacks` (after step 7, `after: 'execute'`): a run
 *   panel's fallback, which PDF and PNG exports show, becomes its code with
 *   the parameters assigned first, followed by the output recorded at compile
 *   time, or the panel's `recorded` output where that run failed, timed out
 *   or did not happen (K-12, P-24).
 */
import { docBlocks } from '@presmium/kernel'
import type { CodeNode, ComponentNode, IRPass, MdastNode } from '@presmium/kernel'
import { configuredTimeout, declarations, EXEC_ID, shownOutput } from '../domain/index.ts'

/** The code block a run panel or stepwise run wraps. */
export function ownCode(node: ComponentNode): CodeNode | undefined {
  return node.children?.map(block => block.node).find((child): child is CodeNode => child.type === 'code')
}

export const timeoutPass: IRPass = {
  name: 'presmium.exec.timeouts',
  run(doc, ctx) {
    for (const { section, block: { node } } of docBlocks(doc)) {
      if (node.type !== 'code' || !node.run || node.run.timeoutMs !== undefined) continue
      const timeout = configuredTimeout(ctx.configFor(section))
      if (timeout) node.run.timeoutMs = timeout
    }
  },
}

export const panelPass: IRPass = {
  name: 'presmium.exec.panels',
  run(doc) {
    for (const { block: { node } } of docBlocks(doc)) {
      if (node.type !== 'component' || node.plugin !== EXEC_ID || node.name !== 'PmRunPanel') continue
      const run = ownCode(node)?.run
      if (run?.executor) node.props.executor = run.executor
      if (run?.session) node.props.session = run.session
    }
  },
}

export const fallbackPass: IRPass = {
  name: 'presmium.exec.fallbacks',
  after: 'execute',
  run(doc) {
    for (const { block: { node } } of docBlocks(doc)) {
      if (node.type !== 'component' || node.plugin !== EXEC_ID || node.name !== 'PmRunPanel') continue
      const code = ownCode(node)
      if (!code) continue
      const recorded = typeof node.props.recorded === 'string' ? node.props.recorded : undefined
      const output = shownOutput(code.outputs ?? [], recorded).text.trimEnd()
      const children: MdastNode[] = [{ type: 'code', lang: code.lang, value: declarations(code.lang, node.props.params as Record<string, unknown>) + code.value }]
      if (output) children.push({ type: 'code', lang: 'text', value: output })
      node.fallback = { type: 'root', children }
    }
  },
}
