import { environmentExecutor, EXECUTOR } from '@lincyaw/kernel'
import type { PluginDefinition } from '@lincyaw/kernel'
import { version } from '../../package.json'
import { EXEC_WASI_ID, execWasiConfig, RUNTIME_DIR, WASI_EXECUTOR_ID, WASI_KIND } from '../domain/index.ts'
import { createWasiRunner } from './executor.ts'
import type { WasiRunner } from './executor.ts'

let runner: WasiRunner | undefined

const plugin: PluginDefinition = {
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
    runner?.dispose()
    runner = createWasiRunner({ runtimeURL: `${import.meta.env.BASE_URL}${RUNTIME_DIR}`, loadTimeoutMs: execWasiConfig(ctx.config).loadTimeoutMs })
    router.register(runner.executor(WASI_EXECUTOR_ID))
    for (const [name, spec] of Object.entries(ctx.environments ?? {})) {
      if (spec.kind === WASI_KIND) router.register(runner.executor(environmentExecutor(name), spec.languages))
    }
  },
  dispose() {
    runner?.dispose()
  },
}

export default plugin
