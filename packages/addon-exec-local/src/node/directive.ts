import { dirname, resolve } from 'node:path'
import type { CodeNode, ComponentNode, DirectiveSpec } from '@presmium/kernel'
import { EXEC_LOCAL_ID, workspacePath } from '../domain/index.ts'

/** The workspace a `{local-env}` names with `:workspace:`, for the pass of the same compilation (./pass.ts). */
export const requestedWorkspaces = new WeakMap<ComponentNode, string>()

/**
 * ```` ```{local-env} python ```` with `:file:` (the snippet's path in the
 * workspace, where exports put it) and `:workspace:` (the folder holding the
 * devcontainer definition, relative to the file of the directive; by
 * default `presmium.execLocal.workspace`, else the workspace root).
 * Becomes `<PmLocalEnv>` around the code block of its body.
 */
export const localEnvDirective: DirectiveSpec = {
  name: 'local-env',
  arg: true,
  body: true,
  options: { file: 'string', workspace: 'string' },
  toIR(input, ctx) {
    const lang = input.arg?.trim() || 'python'
    let file: string
    try {
      file = workspacePath(String(input.options.file ?? ''))
    }
    catch {
      const message = '{local-env} needs :file:, the path of the snippet inside the workspace'
      ctx.report({ checkId: 'presmium.execLocal.syntax', severity: 'error', message })
      return { node: { type: 'markdown', mdast: ctx.parse(`> ${message}`) } }
    }
    const code: CodeNode = { type: 'code', lang, value: input.body.replace(/\n+$/, '') }
    const node: ComponentNode = {
      type: 'component',
      plugin: EXEC_LOCAL_ID,
      name: 'PmLocalEnv',
      props: { file, lang, code: code.value },
      children: [{ id: 'source', role: 'visual', at: 0, source: ctx.source, node: code }],
      fallback: { type: 'root', children: [{ type: 'code', lang, value: code.value }] },
    }
    if (typeof input.options.workspace === 'string') requestedWorkspaces.set(node, resolve(dirname(ctx.file), input.options.workspace))
    return { node }
  },
}
