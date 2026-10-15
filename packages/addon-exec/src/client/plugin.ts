import { EXECUTOR } from '@presmium/kernel'
import type { PluginDefinition } from '@presmium/kernel'
import { createExecutorRouter, EXEC_ID, execConfig, TRACER } from '../domain/index.ts'
import { messages } from './messages.ts'
import { createPyodideExecutor } from './pyodide.ts'
import { createScriptExecutor } from './script.ts'

/**
 * Provides the `executor` service (an `ExecutorRouter` with the Pyodide
 * executor for Python and a worker executor for JavaScript and TypeScript
 * registered; other executors register into it) and the `tracer` service used
 * for stepwise execution. Registered by `setup/main.ts` in the slides form and
 * by the web package in the document form.
 */
export const execPlugin: PluginDefinition = {
  manifest: { id: EXEC_ID, version: '0.1.0', kernel: '^0.1.0', provides: [EXECUTOR, TRACER], capabilities: ['exec'] },
  setup(ctx) {
    const config = execConfig(ctx.config)
    const pyodide = createPyodideExecutor({
      // `<base>pyodide/` is served by the Vite plugin in src/node/vite.ts. The URL is resolved
      // against the page only when a run starts, so setup needs no `location` (SSR).
      indexURL: config.pyodideURL ?? `${import.meta.env.BASE_URL}pyodide/`,
      timeoutMs: config.timeoutMs,
      loadTimeoutMs: config.loadTimeoutMs,
      maxTraceEvents: config.maxTraceEvents,
    })
    const router = createExecutorRouter({
      noExecutor: lang => messages().noExecutor(lang),
      executorCrashed: (id, error) => messages().executorCrashed(id, error),
    })
    router.register(pyodide)
    router.register(createScriptExecutor({ timeoutMs: config.timeoutMs }))
    ctx.provide(EXECUTOR, router)
    ctx.provide(TRACER, pyodide)
  },
}

export default execPlugin
