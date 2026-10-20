import { EXECUTOR } from '@lincyaw/kernel'
import type { PluginDefinition } from '@lincyaw/kernel'
import { version } from '../../package.json'
import { createExecutorRouter, EXEC_ID, execConfig, TRACER } from '../domain/index.ts'
import { messages } from './messages.ts'
import { environments } from './place.ts'
import { createPyodideExecutor } from './pyodide.ts'
import type { PyodideExecutor } from './pyodide.ts'
import { createScriptExecutor } from './script.ts'

let pyodide: PyodideExecutor | undefined

export const execPlugin: PluginDefinition = {
  manifest: { id: EXEC_ID, version, kernel: '^1.0.0', provides: [EXECUTOR, TRACER], capabilities: ['exec'] },
  setup(ctx) {
    const config = execConfig(ctx.config)
    environments.value = ctx.environments ?? {}
    pyodide?.dispose()
    pyodide = createPyodideExecutor({
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
