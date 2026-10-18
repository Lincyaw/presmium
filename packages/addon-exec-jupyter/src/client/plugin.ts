import { EXECUTOR } from '@presmium/kernel'
import type { PluginDefinition, Unsubscribe } from '@presmium/kernel'
import { version } from '../../package.json'
import { EXEC_JUPYTER_ID, JUPYTER_ENVIRONMENTS, jupyterEnvironments } from '../domain/index.ts'
import { createRemoteEnvironments } from './environments.ts'
import type { RemoteEnvironments } from './environments.ts'

let remote: RemoteEnvironments | undefined
let unregister: Unsubscribe[] = []

/**
 * Provides `JUPYTER_ENVIRONMENTS` (for `PmTerminal`) and registers, in the
 * `executor` router, an executor `presmium.env.<name>` for each declared
 * `kind: jupyter` environment (`ctx.environments`, P-100), the id the
 * compile-time executor has. Registered by `setup/main.ts` in the slides
 * form and by the web package in the document form. `dispose` shuts the
 * page's kernels down.
 */
const plugin: PluginDefinition = {
  manifest: {
    id: EXEC_JUPYTER_ID,
    version,
    kernel: '^1.0.0',
    provides: [JUPYTER_ENVIRONMENTS],
    requires: [{ token: EXECUTOR, optional: true }],
    capabilities: ['exec', 'network'],
  },
  setup(ctx) {
    remote?.dispose()
    remote = createRemoteEnvironments(jupyterEnvironments(ctx.environments))
    ctx.provide(JUPYTER_ENVIRONMENTS, remote.service)
    const router = ctx.tryGet(EXECUTOR)
    if (router) unregister = remote.executors.map(executor => router.register(executor))
  },
  dispose() {
    unregister.forEach(off => off())
    unregister = []
    remote?.dispose()
    remote = undefined
  },
}

export default plugin
