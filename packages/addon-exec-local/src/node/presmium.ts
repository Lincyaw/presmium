import type { CodeNode, PresmiumNodePlugin } from '@presmium/kernel'
import { EXEC_LOCAL_ID, languageId } from '../domain/index.ts'
import { createContainerExecutor } from './container.ts'
import { localEnvDirective } from './directive.ts'
import { localEnvPass } from './pass.ts'

const container = createContainerExecutor()

/**
 * The local environment (P-22, P-26): the `{local-env}` directive, the
 * container executor for compile-time execution (`:executor: presmium.container`
 * on a code block), and the snippet as a notebook code cell. Running the
 * edited snippet and committing it work through the dev-server endpoints
 * (./server.ts, registered by setup/vite-plugins.ts).
 */
const plugin: PresmiumNodePlugin = {
  id: EXEC_LOCAL_ID,
  directives: [localEnvDirective],
  passes: [localEnvPass(container)],
  executors: [container],
  rendererExtensions: {
    notebook: {
      components: {
        PmLocalEnv(node) {
          const code = node.children?.find(child => child.node.type === 'code')?.node as CodeNode | undefined
          return code && languageId(code.lang) === 'python' ? { cell_type: 'code', source: code.value, outputs: [], execution_count: null } : undefined
        },
      },
    },
  },
}

export default plugin
