import { environmentExecutor, EXECUTOR } from '@lincyaw/kernel'
import type { PluginDefinition } from '@lincyaw/kernel'
import { version } from '../../package.json'
import { EXEC_WASI_ID, execWasiConfig, RUNTIME_DIR, WASI_EXECUTOR_ID, WASI_KIND } from '../domain/index.ts'
import { createWasiExecutors } from './executors.ts'
import type { WasiExecutors } from './executors.ts'

let executors: WasiExecutors | undefined

export const execWasiPlugin: PluginDefinition = {
  manifest: {
    id: EXEC_WASI_ID,
    version,
    kernel: '^1.0.0',
    requires: [{ token: EXECUTOR, optional: true }],
    capabilities: ['exec'],
  },
  setup(ctx) {
    const router = ctx.tryGet(EXECUTOR)
    if (!router) return
    executors?.dispose()
    executors = createWasiExecutors({ runtimeURL: `${import.meta.env.BASE_URL}${RUNTIME_DIR}`, loadTimeoutMs: execWasiConfig(ctx.config).loadTimeoutMs })
    router.register(executors.executor(WASI_EXECUTOR_ID))
    for (const [name, spec] of Object.entries(ctx.environments ?? {})) {
      if (spec.kind === WASI_KIND) router.register(executors.executor(environmentExecutor(name), spec.languages))
    }
  },
  dispose() {
    executors?.dispose()
  },
}

export default execWasiPlugin
