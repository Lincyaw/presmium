import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { environmentExecutor, isRecord, languageId } from '@lincyaw/kernel'
import type { CodeNode, EnvironmentProvider, EnvironmentSpec, PresmiumNodePlugin } from '@lincyaw/kernel'
import { EXEC_LOCAL_ID } from '../domain/index.ts'
import { createContainerExecutor, dockerAvailable, findDefinition } from './container.ts'
import { localEnvDirective } from './directive.ts'
import { localEnvPass } from './pass.ts'
import { localEnvRoutes } from './server.ts'

const { version } = createRequire(import.meta.url)('../../package.json') as { version: string }

const container = createContainerExecutor()

function kernelLanguage(kernel: unknown): string {
  if (typeof kernel === 'string' && kernel) return languageId(kernel.replace(/[-\d.]+$/, '') || kernel)
  if (isRecord(kernel) && typeof kernel.language === 'string') return languageId(kernel.language)
  return 'python'
}

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
  environments: { devcontainer },
  server: localEnvRoutes,
  rendererExtensions: {
    notebook: {
      components: {
        PmLocalEnv(node, _block, ctx) {
          const code = node.children?.find(child => child.node.type === 'code')?.node as CodeNode | undefined
          return code && languageId(code.lang) === kernelLanguage(ctx.config.kernel) ? { cell_type: 'code', source: code.value, outputs: [], execution_count: null } : undefined
        },
      },
    },
  },
}

export default plugin
