import { EXECUTOR } from '@lincyaw/kernel'
import type { PluginDefinition, Unsubscribe } from '@lincyaw/kernel'
import { version } from '../../package.json'
import { EXEC_JUPYTER_ID, JUPYTER_TERMINALS, jupyterSpecs } from '../domain/index.ts'
import { createJupyterClient } from './jupyter-client.ts'
import type { JupyterClient } from './jupyter-client.ts'

let client: JupyterClient | undefined
let unregister: Unsubscribe[] = []

export const execJupyterPlugin: PluginDefinition = {
  manifest: {
    id: EXEC_JUPYTER_ID,
    version,
    kernel: '^1.0.0',
    provides: [JUPYTER_TERMINALS],
    requires: [{ token: EXECUTOR, optional: true }],
    capabilities: ['exec', 'network'],
  },
  async setup(ctx) {
    await client?.dispose()
    client = createJupyterClient(jupyterSpecs(ctx.environments))
    ctx.provide(JUPYTER_TERMINALS, client.terminals)
    const router = ctx.tryGet(EXECUTOR)
    if (router) unregister = client.executors.map(executor => router.register(executor))
  },
  dispose() {
    unregister.forEach(off => off())
    unregister = []
    const cleanup = client?.dispose()
    client = undefined
    return cleanup
  },
}

export default execJupyterPlugin
