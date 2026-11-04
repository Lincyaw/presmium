import { docBlocks } from '@lincyaw/kernel'
import type { IRPass } from '@lincyaw/kernel'
import { EXEC_JUPYTER_ID, jupyterSpecs } from '../domain/index.ts'

export const terminalPass: IRPass = {
  name: 'presmium.execJupyter.terminals',
  run(doc, ctx) {
    const declared = jupyterSpecs(doc.config.execute?.environments)
    for (const { block } of docBlocks(doc)) {
      const node = block.node
      if (node.type !== 'component' || node.plugin !== EXEC_JUPYTER_ID || node.name !== 'PmTerminal') continue
      const env = String(node.props.env ?? '')
      if (!env || declared[env]) continue
      const other = doc.config.execute?.environments?.[env]
      ctx.report({
        checkId: EXEC_JUPYTER_ID,
        severity: 'error',
        message: other ? `{terminal} ${env}: the environment is of kind ${other.kind}; a terminal needs kind: jupyter` : `{terminal} ${env}: no such environment in execute.environments of the headmatter`,
        source: { file: block.source.file, line: block.source.line },
      })
    }
  },
}
