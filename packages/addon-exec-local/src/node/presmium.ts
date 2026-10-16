import { createRequire } from 'node:module'
import { isRecord, languageId } from '@presmium/kernel'
import type { CodeNode, PresmiumNodePlugin } from '@presmium/kernel'
import { EXEC_LOCAL_ID, execLocalConfig } from '../domain/index.ts'
import { createContainerExecutor } from './container.ts'
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

/**
 * The local environment (P-22, P-26): the `{local-env}` directive, the
 * container executor for compile-time execution (`:executor: presmium.container`
 * on a code block), the dev-server endpoints that run the edited snippet in
 * the container and commit it (./server.ts, for the dev servers of both
 * forms; Slidev also registers them from setup/vite-plugins.ts), and the
 * snippet as a notebook code cell when it is in the kernel's language.
 */
const plugin: PresmiumNodePlugin = {
  id: EXEC_LOCAL_ID,
  version,
  kernel: '^0.1.0',
  directives: [localEnvDirective],
  passes: [localEnvPass(container)],
  executors: [container],
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
