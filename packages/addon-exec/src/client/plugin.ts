import { STATUS } from '@lincyaw/host'
import { EXECUTOR } from '@lincyaw/kernel'
import type { PluginDefinition } from '@lincyaw/kernel'
import { version } from '../../package.json'
import { createExecutorRouter, EXEC_ID, execConfig, TRACER } from '../domain/index.ts'
import { messages } from './messages.ts'
import { environments } from './place.ts'
import { createPyodideExecutor } from './pyodide.ts'
import type { PyodideExecutor } from './pyodide.ts'
import { createScriptExecutor } from './script.ts'
import type { ScriptExecutor } from './script.ts'
import { withRuntimeFeedback } from './feedback.ts'

let pyodide: PyodideExecutor | undefined
let script: ScriptExecutor | undefined
let stopStatus: (() => void) | undefined

export const execPlugin: PluginDefinition = {
  manifest: { id: EXEC_ID, version, kernel: '^1.0.0', provides: [EXECUTOR, TRACER], requires: [{ token: STATUS, optional: true }], capabilities: ['exec'] },
  setup(ctx) {
    const config = execConfig(ctx.config)
    environments.value = ctx.environments ?? {}
    pyodide?.dispose()
    script?.dispose()
    pyodide = createPyodideExecutor({
      indexURL: config.pyodideURL ?? `${import.meta.env.BASE_URL}pyodide/`,
      timeoutMs: config.timeoutMs,
      loadTimeoutMs: config.loadTimeoutMs,
      maxTraceEvents: config.maxTraceEvents,
    })
    script = createScriptExecutor({ timeoutMs: config.timeoutMs })
    const router = createExecutorRouter({
      noExecutor: lang => messages().noExecutor(lang),
      executorUnavailable: (id, lang) => messages().executorUnavailable(id, lang),
      executorCrashed: (id, error) => messages().executorCrashed(id, error),
    })
    router.register(pyodide)
    router.register(script)
    const feedback = withRuntimeFeedback(router)
    stopStatus?.()
    stopStatus = ctx.tryGet(STATUS)?.register({ id: EXEC_ID, read: feedback.read })
    ctx.provide(EXECUTOR, feedback.executor)
    ctx.provide(TRACER, pyodide)
  },
  dispose() {
    pyodide?.dispose()
    pyodide = undefined
    script?.dispose()
    script = undefined
    stopStatus?.()
    stopStatus = undefined
  },
}

export default execPlugin
