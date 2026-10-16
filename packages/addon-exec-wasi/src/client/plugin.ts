import { environmentExecutor, EXECUTOR } from '@presmium/kernel'
import type { PluginDefinition } from '@presmium/kernel'
import { EXEC_WASI_ID, execWasiConfig, RUNTIME_DIR, WASI_EXECUTOR_ID, WASI_KIND } from '../domain/index.ts'
import { createWasiRunner } from './executor.ts'
import type { WasiRunner } from './executor.ts'

let runner: WasiRunner | undefined

/**
 * Adds the WebAssembly executor to the `executor` router, when one exists
 * (the execution plugin's): it runs C, C++, Ruby and SQL code by language
 * (`presmium.wasi`), and, under the environment's id (`presmium.env.<name>`),
 * the code of each declared `kind: wasi` environment (`ctx.environments`,
 * P-100). The runtime files are those the form publishes at `<base>wasi/`.
 * The router is the kernel's, so the registrations end with it; when the
 * kernel stops (the page is hidden, a hot update), `dispose` ends the worker
 * with its runtimes.
 */
const plugin: PluginDefinition = {
  manifest: {
    id: EXEC_WASI_ID,
    version: '0.1.0',
    kernel: '^0.1.0',
    requires: [{ token: EXECUTOR, optional: true }],
    capabilities: ['exec'],
  },
  setup(ctx) {
    const router = ctx.tryGet(EXECUTOR)
    if (!router) return
    // A kernel started again may set up before the previous one is disposed; ending a worker is
    // safe in either order, since a later run starts a fresh one.
    runner?.dispose()
    // The URL is resolved against the page only when a run starts, so setup needs no `location` (SSR).
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
