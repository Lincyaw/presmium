import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { componentCode, environmentExecutor, jupyterKernelLanguage, languageId } from '@lincyaw/kernel'
import type { EnvironmentProvider, EnvironmentSpec, PresmiumNodePlugin } from '@lincyaw/kernel'
import { DEVCONTAINER_KIND, EXEC_LOCAL_ID } from '../domain/index.ts'
import { createContainerExecutor } from './container.ts'
import { findDefinition } from './devcontainer.ts'
import { dockerAvailable } from './docker.ts'
import { localEnvDirective, localEnvPass } from './local-env.ts'
import { localEnvRoutes } from './server.ts'

const { version } = createRequire(import.meta.url)('../../package.json') as { version: string }

/** The plugin's executor, which each compile replaces with its deck's own (`localEnvPass`). */
const container = createContainerExecutor()

const definitionDir = (spec: EnvironmentSpec, deckDir: string, workspaceRoot: string) => typeof spec.path === 'string' && spec.path ? resolve(deckDir, spec.path) : workspaceRoot

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

const plugin: PresmiumNodePlugin = {
  id: EXEC_LOCAL_ID,
  version,
  kernel: '^1.0.0',
  directives: [localEnvDirective],
  passes: [localEnvPass(container)],
  executors: [container],
  environments: { [DEVCONTAINER_KIND]: devcontainer },
  server: localEnvRoutes,
  rendererExtensions: {
    notebook: {
      components: {
        PmLocalEnv(node, _block, ctx) {
          const code = componentCode(node)
          return code && languageId(code.lang) === jupyterKernelLanguage(ctx.config.kernel) ? { cell_type: 'code', source: code.value, outputs: [], execution_count: null } : undefined
        },
      },
    },
  },
}

export default plugin
