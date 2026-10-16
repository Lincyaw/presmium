import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { environmentExecutor, isRecord, languageId } from '@presmium/kernel'
import type { CodeNode, EnvironmentProvider, EnvironmentSpec, PresmiumNodePlugin } from '@presmium/kernel'
import { EXEC_LOCAL_ID, execLocalConfig } from '../domain/index.ts'
import { createContainerExecutor, dockerAvailable, findDefinition } from './container.ts'
import { localEnvDirective } from './directive.ts'
import { localEnvPass } from './pass.ts'
import { localEnvServer } from './server.ts'

const { version } = createRequire(import.meta.url)('../../package.json') as { version: string }

const container = createContainerExecutor()

/** The language of the notebook's kernel, read as the notebook renderer reads `renderers.notebook.kernel`. */
function kernelLanguage(kernel: unknown): string {
  if (typeof kernel === 'string' && kernel) return languageId(kernel.replace(/[-\d.]+$/, '') || kernel)
  if (isRecord(kernel) && typeof kernel.language === 'string') return languageId(kernel.language)
  return 'python'
}

/** Where a `devcontainer` environment's definition is: its `path`, relative to the deck, else the workspace root. */
const definitionDir = (spec: EnvironmentSpec, deckDir: string, workspaceRoot: string) => typeof spec.path === 'string' && spec.path ? resolve(deckDir, spec.path) : workspaceRoot

/**
 * The provider of `kind: devcontainer` environments (P-100): the container
 * executor, named after the environment (`presmium.env.<name>`), bound to the
 * definition of the environment's `path`.
 */
const devcontainer: EnvironmentProvider = {
  create(name, spec, ctx) {
    const executor = createContainerExecutor(environmentExecutor(name))
    executor.bind(definitionDir(spec, ctx.deckDir, ctx.workspaceRoot))
    return executor
  },
  async probe(_name, spec, ctx) {
    const dir = definitionDir(spec, ctx.deckDir, ctx.workspaceRoot)
    if (!findDefinition(dir)) return `no devcontainer definition (.devcontainer/devcontainer.json) in ${dir}`
    return await dockerAvailable() ? undefined : 'Docker is not available'
  },
}

/**
 * The local environment (P-22, P-26): the `{local-env}` directive, the
 * container executor for compile-time execution (`:executor: presmium.container`
 * on a code block), the dev-server endpoints that run the edited snippet in
 * the container and commit it (./server.ts, for the dev servers of both
 * forms; Slidev also registers them from setup/vite-plugins.ts), and the
 * snippet as a notebook code cell when it is in the kernel's language; and
 * the provider of `kind: devcontainer` environments.
 */
const plugin: PresmiumNodePlugin = {
  id: EXEC_LOCAL_ID,
  version,
  kernel: '^0.1.0',
  directives: [localEnvDirective],
  passes: [localEnvPass(container)],
  executors: [container],
  environments: { devcontainer },
  vitePlugins({ deckDir, config }) {
    const { workspace, buildTimeoutMs } = execLocalConfig(config)
    return [localEnvServer({ deckDir, workspace, buildTimeoutMs })]
  },
  rendererExtensions: {
    notebook: {
      components: {
        // A snippet in the kernel's language is a code cell; others show their fallback.
        PmLocalEnv(node, _block, ctx) {
          const code = node.children?.find(child => child.node.type === 'code')?.node as CodeNode | undefined
          return code && languageId(code.lang) === kernelLanguage(ctx.config.kernel) ? { cell_type: 'code', source: code.value, outputs: [], execution_count: null } : undefined
        },
      },
    },
  },
}

export default plugin
