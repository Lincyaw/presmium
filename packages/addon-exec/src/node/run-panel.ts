import { componentCode, docBlocks } from '@lincyaw/kernel'
import type { IRPass, MdastNode } from '@lincyaw/kernel'
import { EXEC_ID, paramsPrelude, shownOutput } from '../domain/index.ts'

/** Gives each run panel its place in the document and its code's executor and session, which its runs send. */
export const runPanelPass: IRPass = {
  name: 'presmium.exec.panels',
  order: 10,
  run(doc, ctx) {
    for (const { section, block: { id, node, source, stepStates } } of docBlocks(doc)) {
      if (node.type !== 'component' || node.plugin !== EXEC_ID || !['PmRunPanel', 'PmStepRun'].includes(node.name)) continue
      const code = componentCode(node)
      if (!code || node.children?.filter(child => child.node.type === 'code').length !== 1) {
        ctx.report({ checkId: 'presmium.exec', severity: 'error', message: `${node.name} requires exactly one canonical code child.`, source })
        continue
      }
      node.props.code = code.value
      node.props.lang = code.lang
      delete node.props.compiledOutput
      for (const state of stepStates ?? []) if (state.parameters) {
        for (const key of ['code', 'lang', 'place', 'executor', 'session', 'compiledOutput']) delete state.parameters[key]
      }
      node.props.place = { section: section.id, block: id }
      const run = code.run
      if (run?.executor) node.props.executor = run.executor
      else delete node.props.executor
      if (run?.session) node.props.session = run.session
      else delete node.props.session
      node.fallback = { type: 'root', children: [{ type: 'code', lang: code.lang, value: code.value }, ...typeof node.props.recorded === 'string' ? [{ type: 'code', lang: 'text', value: node.props.recorded }] : []] }
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
