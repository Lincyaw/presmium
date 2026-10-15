import { EXECUTOR } from '@presmium/kernel'
import type { PluginDefinition } from '@presmium/kernel'
import { createExecutorRouter, EXEC_ID, execConfig, TRACER } from '../domain/index.ts'
import { createPyodideExecutor } from './pyodide.ts'

/** Pyodide files are served at `<base>pyodide/` by the Vite plugin in `src/node/vite.ts`. */
function defaultPyodideURL(): string {
  return new URL(`${import.meta.env.BASE_URL}pyodide/`, location.href).href
}

/**
 * Provides the `executor` service (an `ExecutorRouter` with the Pyodide
 * executor registered; other executors register into it) and the `tracer`
 * service used for stepwise execution. Registered by `setup/main.ts` in the
 * slides form and by the web package in the document form.
 */
export const execPlugin: PluginDefinition = {
  manifest: { id: EXEC_ID, version: '0.1.0', kernel: '^0.1.0', provides: [EXECUTOR, TRACER], capabilities: ['exec'] },
  setup(ctx) {
    const config = execConfig(ctx.config)
    const pyodide = createPyodideExecutor({
      indexURL: config.pyodideURL ?? defaultPyodideURL(),
      timeoutMs: config.timeoutMs,
      maxTraceEvents: config.maxTraceEvents,
    })
    const router = createExecutorRouter()
    router.register(pyodide)
    ctx.provide(EXECUTOR, router)
    ctx.provide(TRACER, pyodide)
  },
}

export default execPlugin
