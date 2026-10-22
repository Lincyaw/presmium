import { EXECUTOR } from '@lincyaw/kernel'
import type { PluginDefinition, Unsubscribe } from '@lincyaw/kernel'
import { version } from '../../package.json'
import { EXEC_JUPYTER_ID, JUPYTER_ENVIRONMENTS, jupyterEnvironments } from '../domain/index.ts'
import { createRemoteEnvironments } from './environments.ts'
import type { RemoteEnvironments } from './environments.ts'

let remote: RemoteEnvironments | undefined
let unregister: Unsubscribe[] = []

const plugin: PluginDefinition = {
  manifest: {
    id: EXEC_JUPYTER_ID,
    version,
    kernel: '^1.0.0',
    provides: [JUPYTER_ENVIRONMENTS],
    requires: [{ token: EXECUTOR, optional: true }],
    capabilities: ['exec', 'network'],
  },
  async setup(ctx) {
    await remote?.dispose()
    remote = createRemoteEnvironments(jupyterEnvironments(ctx.environments))
    ctx.provide(JUPYTER_ENVIRONMENTS, remote.service)
    const router = ctx.tryGet(EXECUTOR)
    if (router) unregister = remote.executors.map(executor => router.register(executor))
  },
  dispose() {
    unregister.forEach(off => off())
    unregister = []
    const cleanup = remote?.dispose()
    remote = undefined
    return cleanup
  },
}

export default plugin
