/**
 * The workspace pass of the local environment. It settles the deck's
 * workspace (`presmium.execLocal.workspace` relative to the deck, else the
 * first `{local-env}` that names one, else the git root) and
 * - binds the container executor to it for compile-time execution;
 * - writes it, relative to the deck, into the deck's configuration, so the
 *   dev-server endpoints of the generated Slidev deck (setup/vite-plugins.ts)
 *   find it; the published forms carry no path of the build machine (K-13);
 * - attaches to each `<PmLocalEnv>` its environment (P-26): the snippet and
 *   the devcontainer definition as a zip archive, downloadable from any build,
 *   with a README in the deck's language.
 */
import { relative, resolve, sep } from 'node:path'
import type { CodeNode, ComponentNode, IRBlock, IRPass } from '@presmium/kernel'
import { EXEC_LOCAL_ID, execLocalConfig } from '../domain/index.ts'
import type { ContainerExecutor } from './container.ts'
import { findDefinition } from './container.ts'
import { requestedWorkspaces } from './directive.ts'
import { inLanguage } from './messages.ts'
import { replicateArchive } from './replicate.ts'

function localEnvs(blocks: IRBlock[]): { block: IRBlock, node: ComponentNode }[] {
  return blocks.flatMap((block) => {
    const { node } = block
    if (node.type !== 'component') return []
    const own = node.plugin === EXEC_LOCAL_ID && node.name === 'PmLocalEnv' ? [{ block, node }] : []
    return [...own, ...localEnvs(node.children ?? [])]
  })
}

export function localEnvPass(container: ContainerExecutor): IRPass {
  return {
    name: 'presmium.execLocal.workspace',
    run(doc, ctx) {
      const envs = doc.sections.flatMap(section => localEnvs(section.blocks))
      const configured = execLocalConfig(ctx.config).workspace
      const workspace = configured !== undefined
        ? resolve(ctx.deckDir, configured)
        : envs.map(env => requestedWorkspaces.get(env.node)).find(dir => dir !== undefined) ?? ctx.workspaceRoot
      container.bind(workspace)
      const shared = relative(ctx.deckDir, workspace).split(sep).join('/') || '.'
      doc.config.presmium = { ...doc.config.presmium, [EXEC_LOCAL_ID]: { ...ctx.config, workspace: shared } }

      for (const { block, node } of envs) {
        const dir = requestedWorkspaces.get(node) ?? workspace
        const definition = findDefinition(dir)
        if (!definition) {
          ctx.report({
            checkId: 'presmium.execLocal.devcontainer',
            severity: 'warning',
            message: `no devcontainer definition in ${relative(ctx.deckDir, dir) || '.'}; the snippet cannot be run in a container or exported`,
            source: { file: block.source.file, line: block.source.line },
          })
          continue
        }
        const code = node.children?.find(child => child.node.type === 'code')?.node as CodeNode
        const file = String(node.props.file)
        const request = { file, content: `${code.value}\n`, lang: String(node.props.lang) }
        const { zip } = inLanguage(typeof doc.meta.lang === 'string' ? doc.meta.lang : undefined, () => replicateArchive(dir, definition, request))
        node.props.devcontainer = relative(dir, definition).split(sep).join('/')
        node.props.archive = Buffer.from(zip).toString('base64')
      }
    },
  }
}
