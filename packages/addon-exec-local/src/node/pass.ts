import { relative, resolve, sep } from 'node:path'
import { docBlocks } from '@presmium/kernel'
import type { CodeNode, ComponentNode, IRBlock, IRPass } from '@presmium/kernel'
import { EXEC_LOCAL_ID, execLocalConfig } from '../domain/index.ts'
import type { ContainerExecutor } from './container.ts'
import { findDefinition } from './container.ts'
import { requestedWorkspaces } from './directive.ts'
import { inLanguage } from './messages.ts'
import { replicateArchive } from './replicate.ts'

export function localEnvPass(container: ContainerExecutor): IRPass {
  return {
    name: 'presmium.execLocal.workspace',
    run(doc, ctx) {
      const envs = [...docBlocks(doc)].map(({ block }) => block)
        .filter((block): block is IRBlock & { node: ComponentNode } => block.node.type === 'component' && block.node.plugin === EXEC_LOCAL_ID && block.node.name === 'PmLocalEnv')
      const config = execLocalConfig(ctx.config)
      const workspace = config.workspace !== undefined
        ? resolve(ctx.deckDir, config.workspace)
        : envs.map(env => requestedWorkspaces.get(env.node)).find(dir => dir !== undefined) ?? ctx.workspaceRoot
      container.bind(workspace, config)
      const shared = relative(ctx.deckDir, workspace).split(sep).join('/') || '.'
      doc.config.presmium = { ...doc.config.presmium, [EXEC_LOCAL_ID]: { ...ctx.config, workspace: shared } }
      const named = (dir: string) => relative(ctx.deckDir, dir).split(sep).join('/') || '.'

      for (const { node, source } of envs) {
        const dir = requestedWorkspaces.get(node) ?? workspace
        const at = { file: source.file, line: source.line }
        if (dir !== workspace) {
          ctx.report({
            checkId: 'presmium.execLocal.workspace',
            severity: 'error',
            message: `{local-env} names the workspace ${named(dir)}, but the deck's workspace is ${named(workspace)}: the snippet would run in ${named(workspace)}`,
            hint: 'give every {local-env} of the deck the same :workspace:, or set presmium.execLocal.workspace',
            source: at,
          })
        }
        const definition = findDefinition(dir)
        if (!definition) {
          ctx.report({
            checkId: 'presmium.execLocal.devcontainer',
            severity: 'warning',
            message: `no devcontainer definition in ${named(dir)}; the snippet cannot be run in a container or exported`,
            source: at,
          })
          continue
        }
        const code = node.children?.find(child => child.node.type === 'code')?.node as CodeNode
        const file = String(node.props.file)
        const request = { file, content: `${code.value}\n`, lang: String(node.props.lang) }
        const { zip } = inLanguage(ctx.lang, () => replicateArchive(dir, definition, request))
        node.props.devcontainer = relative(dir, definition).split(sep).join('/')
        node.props.archive = Buffer.from(zip).toString('base64')
      }
    },
  }
}
