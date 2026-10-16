import { environmentExecutor, EXECUTOR } from '@presmium/kernel'
import type { PluginDefinition, Unsubscribe } from '@presmium/kernel'
import { DEFAULT_TIMEOUT_MS, EXEC_WEBGPU_ID, WEBGPU_EXECUTOR_ID } from '../domain/index.ts'
import { createWebgpuExecutor } from './executor.ts'
import type { WebgpuExecutor } from './executor.ts'

let executors: WebgpuExecutor[] = []
let registrations: Unsubscribe[] = []

function release(): void {
  registrations.forEach(unregister => unregister())
  executors.forEach(executor => executor.dispose())
  registrations = []
  executors = []
}

/**
 * Registers the WGSL executor with the `executor` service of the execution
 * plugin (`presmium.webgpu`), and one for each `kind: webgpu` environment the
 * deck declares (`presmium.env.<name>`, the id its code names). Registered by
 * `setup/main.ts` in the slides form and by the web package in the document
 * form. `dispose` ends the workers of runs under way.
 */
export const execWebgpuPlugin: PluginDefinition = {
  manifest: { id: EXEC_WEBGPU_ID, version: '0.1.0', kernel: '^0.1.0', requires: [{ token: EXECUTOR }], capabilities: ['exec'] },
  setup(ctx) {
    // A kernel started again (a page restored from the back-forward cache) may set up before the previous one is disposed.
    release()
    const router = ctx.get(EXECUTOR)
    const named = Object.entries(ctx.environments ?? {}).filter(([, spec]) => spec.kind === 'webgpu').map(([name]) => environmentExecutor(name))
    for (const id of [WEBGPU_EXECUTOR_ID, ...named]) {
      const executor = createWebgpuExecutor({ id, timeoutMs: DEFAULT_TIMEOUT_MS })
      executors.push(executor)
      registrations.push(router.register(executor))
    }
  },
  dispose: release,
}

export default execWebgpuPlugin
