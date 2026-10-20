import { docBlocks } from '@lincyaw/kernel'
import type { ComponentNode, DirectiveSpec, IRPass } from '@lincyaw/kernel'
import { DEFAULT_TERMINAL_ROWS, EXEC_JUPYTER_ID, jupyterEnvironments, terminalFallback } from '../domain/index.ts'

export const terminalDirective: DirectiveSpec = {
  name: 'terminal',
  arg: true,
  body: false,
  options: { height: 'number' },
  toIR(input, ctx) {
    const env = input.arg?.trim() ?? ''
    if (!env) ctx.report({ checkId: EXEC_JUPYTER_ID, severity: 'error', message: '{terminal} needs the name of a kind: jupyter environment of execute.environments, e.g. :::{terminal} gpu' })
    const height = input.options.height
    const rows = typeof height === 'number' && Number.isInteger(height) && height > 0 ? height : DEFAULT_TERMINAL_ROWS
    const node: ComponentNode = {
      type: 'component',
      plugin: EXEC_JUPYTER_ID,
      name: 'PmTerminal',
      props: { env, rows },
      fallback: { type: 'root', children: [{ type: 'paragraph', children: [{ type: 'text', value: terminalFallback(env, ctx.lang) }] }] },
    }
    return { node }
  },
}

export const terminalPass: IRPass = {
  name: 'presmium.execJupyter.terminals',
  run(doc, ctx) {
    const declared = jupyterEnvironments(doc.config.execute?.environments)
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
