import { relative, resolve, sep } from 'node:path'
import { componentCode, docBlocks } from '@lincyaw/kernel'
import type { ComponentNode, Executor, IRBlock, IRPass } from '@lincyaw/kernel'
import { EXEC_LOCAL_ID, execLocalConfig } from '../domain/index.ts'
import type { ContainerExecutor } from './container.ts'
import { createContainerExecutor } from './container.ts'
import { findDefinition } from './devcontainer.ts'
import { inLanguage, text } from './messages.ts'
import { replicateArchive } from './replicate.ts'

const deckContainers = new Map<string, ContainerExecutor>()

/** Each deck runs in its own workspace: the deck's container executor takes the place of the plugin's in the executors of this compile. */
function bindDeckContainer(deckDir: string, executors: Executor[], pluginContainer: Executor): ContainerExecutor {
  let container = deckContainers.get(deckDir)
  if (!container) deckContainers.set(deckDir, container = createContainerExecutor(pluginContainer.id))
  const at = executors.indexOf(pluginContainer)
  if (at >= 0) executors[at] = container
  return container
}

export function localEnvPass(pluginContainer: Executor): IRPass {
  return {
    name: 'presmium.execLocal.workspace',
    run(doc, ctx) {
      const envs = [...docBlocks(doc)].map(({ block }) => block)
        .filter((block): block is IRBlock & { node: ComponentNode } => block.node.type === 'component' && block.node.plugin === EXEC_LOCAL_ID && block.node.name === 'PmLocalEnv')
      const config = execLocalConfig(ctx.config)
      const workspace = config.workspace !== undefined
        ? resolve(ctx.deckDir, config.workspace)
        : ctx.workspaceRoot
      bindDeckContainer(ctx.deckDir, ctx.executors, pluginContainer).bind(workspace, config)
      const shared = relative(ctx.deckDir, workspace).split(sep).join('/') || '.'
      doc.config.presmium = { ...doc.config.presmium, [EXEC_LOCAL_ID]: { ...ctx.config, workspace: shared } }

      for (const { node, source, stepStates } of envs) {
        const code = componentCode(node)
        if (!code || node.children?.filter(child => child.node.type === 'code').length !== 1) {
          ctx.report({ checkId: EXEC_LOCAL_ID, severity: 'error', message: inLanguage(ctx.lang, () => text().codeChild), source })
          continue
        }
        node.props.code = code.value
        node.props.lang = code.lang
        delete node.props.archive
        delete node.props.devcontainer
        for (const state of stepStates ?? []) if (state.parameters) {
          for (const key of ['code', 'lang', 'archive', 'devcontainer']) delete state.parameters[key]
        }
        const definition = findDefinition(workspace)
        if (!definition) {
          ctx.report({
            checkId: 'presmium.execLocal.devcontainer',
            severity: 'warning',
            message: `no devcontainer definition in ${shared}; the snippet cannot be run in a container or exported`,
            source,
          })
          continue
        }
        const file = String(node.props.file)
        const request = { file, content: `${code.value}\n`, lang: String(node.props.lang) }
        const { zip } = inLanguage(ctx.lang, () => replicateArchive(workspace, definition, request))
        node.props.devcontainer = relative(workspace, definition).split(sep).join('/')
        node.props.archive = Buffer.from(zip).toString('base64')
      }
    },
  }
}
