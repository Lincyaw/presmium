import { environmentExecutor, EXECUTOR } from '@presmium/kernel'
import type { PluginDefinition, Unsubscribe } from '@presmium/kernel'
import { version } from '../../package.json'
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

export const execWebgpuPlugin: PluginDefinition = {
  manifest: { id: EXEC_WEBGPU_ID, version, kernel: '^1.0.0', requires: [{ token: EXECUTOR }], capabilities: ['exec'] },
  setup(ctx) {
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
