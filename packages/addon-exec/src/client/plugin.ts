import { EXECUTOR } from '@presmium/kernel'
import type { PluginDefinition } from '@presmium/kernel'
import { createExecutorRouter, EXEC_ID, execConfig, TRACER } from '../domain/index.ts'
import { messages } from './messages.ts'
import { environments } from './place.ts'
import { createPyodideExecutor } from './pyodide.ts'
import type { PyodideExecutor } from './pyodide.ts'
import { createScriptExecutor } from './script.ts'

let pyodide: PyodideExecutor | undefined

/**
 * Provides the `executor` service (an `ExecutorRouter` with the Pyodide
 * executor for Python and a worker executor for JavaScript and TypeScript
 * registered; other executors register into it) and the `tracer` service used
 * for stepwise execution. Registered by `setup/main.ts` in the slides form and
 * by the web package in the document form. When the kernel stops (the page is
 * hidden, a hot update), `dispose` ends the Python worker with its runtime.
 */
export const execPlugin: PluginDefinition = {
  manifest: { id: EXEC_ID, version: '0.1.0', kernel: '^0.1.0', provides: [EXECUTOR, TRACER], capabilities: ['exec'] },
  setup(ctx) {
    const config = execConfig(ctx.config)
    // Where a run panel's code runs, by its environment's kind (./place.ts).
    environments.value = ctx.environments ?? {}
    // A kernel started again (a page restored from the back-forward cache) may set up before the
    // previous one is disposed; disposing an executor only ends its worker, so either order is safe.
    pyodide?.dispose()
    pyodide = createPyodideExecutor({
      // `<base>pyodide/` is served by the Vite plugin in src/node/vite.ts. The URL is resolved
      // against the page only when a run starts, so setup needs no `location` (SSR).
      indexURL: config.pyodideURL ?? `${import.meta.env.BASE_URL}pyodide/`,
      timeoutMs: config.timeoutMs,
      loadTimeoutMs: config.loadTimeoutMs,
      maxTraceEvents: config.maxTraceEvents,
    })
    const router = createExecutorRouter({
      noExecutor: lang => messages().noExecutor(lang),
      executorUnavailable: (id, lang) => messages().executorUnavailable(id, lang),
      executorCrashed: (id, error) => messages().executorCrashed(id, error),
    })
    router.register(pyodide)
    router.register(createScriptExecutor({ timeoutMs: config.timeoutMs }))
    ctx.provide(EXECUTOR, router)
    ctx.provide(TRACER, pyodide)
  },
  dispose() {
    pyodide?.dispose()
    pyodide = undefined
  },
}

export default execPlugin
