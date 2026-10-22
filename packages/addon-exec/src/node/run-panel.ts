import { componentCode, docBlocks } from '@lincyaw/kernel'
import type { DirectiveSpec, IRPass, MdastNode } from '@lincyaw/kernel'
import { EXEC_ID, paramsPrelude, shownOutput } from '../domain/index.ts'
import { codeComponent } from './code-component.ts'

export const runPanelDirective: DirectiveSpec = {
  name: 'run-panel',
  arg: true,
  body: true,
  options: { params: 'string', timeout: 'number', recorded: 'string', run: 'string' },
  toIR(input, ctx) {
    const when = input.options.run === undefined ? 'both' : String(input.options.run).trim()
    if (when !== 'both' && when !== 'live') ctx.report({ checkId: 'presmium.exec.syntax', severity: 'warning', message: `{run-panel} :run: ${when} is not both or live; using both` })
    const node = codeComponent('PmRunPanel', input, ctx, { when: when === 'live' ? 'live' : 'both' })
    const recorded = input.options.recorded
    if (typeof recorded === 'string') {
      node.props.recorded = recorded
      node.fallback?.children?.push({ type: 'code', lang: 'text', value: recorded })
    }
    return { node }
  },
}

/** Gives each run panel its place in the document and its code's executor and session, which its runs send. */
export const runPanelPass: IRPass = {
  name: 'presmium.exec.panels',
  run(doc) {
    for (const { section, block: { id, node } } of docBlocks(doc)) {
      if (node.type !== 'component' || node.plugin !== EXEC_ID || node.name !== 'PmRunPanel') continue
      node.props.place = { section: section.id, block: id }
      const run = componentCode(node)?.run
      if (run?.executor) node.props.executor = run.executor
      if (run?.session) node.props.session = run.session
    }
  },
}

/** After the compile-time runs: the panel's fallback shows its code with the output, and a run that succeeded gives `compiledOutput`. */
export const runPanelFallbackPass: IRPass = {
  name: 'presmium.exec.fallbacks',
  after: 'execute',
  run(doc) {
    for (const { block: { node } } of docBlocks(doc)) {
      if (node.type !== 'component' || node.plugin !== EXEC_ID || node.name !== 'PmRunPanel') continue
      const code = componentCode(node)
      if (!code) continue
      const recorded = typeof node.props.recorded === 'string' ? node.props.recorded : undefined
      const output = shownOutput(code.outputs ?? [], recorded).text.trimEnd()
      const children: MdastNode[] = [{ type: 'code', lang: code.lang, value: paramsPrelude(code.lang, node.props.params as Record<string, unknown>) + code.value }]
      if (output) children.push({ type: 'code', lang: 'text', value: output })
      node.fallback = { type: 'root', children }
      const runs = code.outputs ?? []
      if (runs.length > 0 && runs.every(run => run.ok)) node.props.compiledOutput = shownOutput(runs, undefined).text
    }
  },
}
