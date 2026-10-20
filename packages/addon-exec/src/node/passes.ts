import { docBlocks } from '@lincyaw/kernel'
import type { CodeNode, ComponentNode, IRPass, MdastNode } from '@lincyaw/kernel'
import { configuredTimeout, declarations, EXEC_ID, shownOutput } from '../domain/index.ts'

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
      const runs = code.outputs ?? []
      if (runs.length > 0 && runs.every(run => run.ok)) node.props.compiledOutput = shownOutput(runs, undefined).text
    }
  },
}
