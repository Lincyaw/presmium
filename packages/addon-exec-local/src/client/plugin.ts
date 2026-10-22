import { environmentExecutor, EXECUTOR } from '@lincyaw/kernel'
import type { Executor, PluginDefinition, Unsubscribe } from '@lincyaw/kernel'
import { version } from '../../package.json'
import { DEVCONTAINER_KIND, EXEC_LOCAL_ID, execLocalConfig, LOCAL_ENV } from '../domain/index.ts'
import { createLocalEnvClient } from './local-env.ts'

let unregister: Unsubscribe[] = []

export const execLocalPlugin: PluginDefinition = {
  manifest: {
    id: EXEC_LOCAL_ID,
    version,
    kernel: '^1.0.0',
    provides: [LOCAL_ENV],
    requires: [{ token: EXECUTOR, optional: true }],
    capabilities: ['exec', 'fs'],
  },
  setup(ctx) {
    const env = createLocalEnvClient()
    ctx.provide(LOCAL_ENV, env)
    const router = ctx.tryGet(EXECUTOR)
    if (router) {
      unregister = [router.register(env.executor, execLocalConfig(ctx.config).priority)]
      for (const [name, spec] of Object.entries(ctx.environments ?? {})) {
        if (spec.kind !== DEVCONTAINER_KIND) continue
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

export default execLocalPlugin
