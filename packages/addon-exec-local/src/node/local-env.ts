import { dirname, relative, resolve, sep } from 'node:path'
import { componentCode, docBlocks } from '@lincyaw/kernel'
import type { CodeNode, ComponentNode, DirectiveSpec, Executor, IRBlock, IRPass } from '@lincyaw/kernel'
import { EXEC_LOCAL_ID, execLocalConfig, workspacePath } from '../domain/index.ts'
import type { ContainerExecutor } from './container.ts'
import { createContainerExecutor } from './container.ts'
import { findDefinition } from './devcontainer.ts'
import { inLanguage, text } from './messages.ts'
import { replicateArchive } from './replicate.ts'

/** The `:workspace:` each {local-env} names, resolved, for the workspace pass of the same compile. */
const requestedWorkspaces = new WeakMap<ComponentNode, string>()

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
        : envs.map(env => requestedWorkspaces.get(env.node)).find(dir => dir !== undefined) ?? ctx.workspaceRoot
      bindDeckContainer(ctx.deckDir, ctx.executors, pluginContainer).bind(workspace, config)
      const shared = relative(ctx.deckDir, workspace).split(sep).join('/') || '.'
      doc.config.presmium = { ...doc.config.presmium, [EXEC_LOCAL_ID]: { ...ctx.config, workspace: shared } }
      const named = (dir: string) => relative(ctx.deckDir, dir).split(sep).join('/') || '.'

      for (const { node, source, stepStates } of envs) {
        const dir = requestedWorkspaces.get(node) ?? workspace
        const at = { file: source.file, line: source.line }
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
        const file = String(node.props.file)
        const request = { file, content: `${code.value}\n`, lang: String(node.props.lang) }
        const { zip } = inLanguage(ctx.lang, () => replicateArchive(dir, definition, request))
        node.props.devcontainer = relative(dir, definition).split(sep).join('/')
        node.props.archive = Buffer.from(zip).toString('base64')
      }
    },
  }
}
