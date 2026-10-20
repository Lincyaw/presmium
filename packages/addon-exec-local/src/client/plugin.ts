import { environmentExecutor, EXECUTOR } from '@lincyaw/kernel'
import type { Executor, PluginDefinition, Unsubscribe } from '@lincyaw/kernel'
import { version } from '../../package.json'
import { EXEC_LOCAL_ID, execLocalConfig, LOCAL_ENV } from '../domain/index.ts'
import { createLocalEnv } from './local-env.ts'

let unregister: Unsubscribe[] = []

const plugin: PluginDefinition = {
  manifest: {
    id: EXEC_LOCAL_ID,
    version,
    kernel: '^1.0.0',
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
