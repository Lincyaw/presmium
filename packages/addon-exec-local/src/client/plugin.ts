import { environmentExecutor, EXECUTOR } from '@presmium/kernel'
import type { Executor, PluginDefinition, Unsubscribe } from '@presmium/kernel'
import { EXEC_LOCAL_ID, execLocalConfig, LOCAL_ENV } from '../domain/index.ts'
import { createLocalEnv } from './local-env.ts'

let unregister: Unsubscribe[] = []

/**
 * Provides the `localEnv` service and, when an `executor` router exists, adds
 * the container executor to it as a second implementation (P-22): with a
 * higher priority it replaces the browser executor for the languages its
 * devcontainer runs, but only while a dev server with Docker is behind the deck.
 * Each declared `kind: devcontainer` environment (`ctx.environments`, P-100)
 * gets the same executor under its own id, `presmium.env.<name>`, for code
 * that names it with `:env:`; without such a dev server it is unavailable,
 * and such code shows its recorded output.
 */
const plugin: PluginDefinition = {
  manifest: {
    id: EXEC_LOCAL_ID,
    version: '0.1.0',
    kernel: '^0.1.0',
    provides: [LOCAL_ENV],
    requires: [{ token: EXECUTOR, optional: true }],
    capabilities: ['exec', 'fs'],
  },
  setup(ctx) {
    const env = createLocalEnv()
    ctx.provide(LOCAL_ENV, env)
    const router = ctx.tryGet(EXECUTOR)
    if (router) {
      unregister = [router.register(env.executor, execLocalConfig(ctx.config).priority)]
      for (const [name, spec] of Object.entries(ctx.environments ?? {})) {
        if (spec.kind !== 'devcontainer') continue
        const named: Executor = { id: environmentExecutor(name), supports: lang => env.executor.supports(lang), run: (request, signal) => env.executor.run(request, signal) }
        unregister.push(router.register(named))
      }
    }
    void env.status()
  },
  dispose() {
    unregister.forEach(off => off())
    unregister = []
  },
}

export default plugin
