import { EXECUTOR } from '@presmium/kernel'
import type { PluginDefinition, Unsubscribe } from '@presmium/kernel'
import { EXEC_LOCAL_ID, execLocalConfig, LOCAL_ENV } from '../domain/index.ts'
import { createLocalEnv } from './local-env.ts'

let unregister: Unsubscribe | undefined

/**
 * Provides the `localEnv` service and, when an `executor` router exists, adds
 * the container executor to it as a second implementation (P-22): with a
 * higher priority it replaces the browser executor for the languages its
 * devcontainer runs, but only while a dev server with Docker is behind the deck.
 */
const plugin: PluginDefinition = {
  manifest: {
    id: EXEC_LOCAL_ID,
    version: '0.1.0',
    kernel: '^0.1.0',
    provides: [LOCAL_ENV],
    requires: [{ token: EXECUTOR, optional: true }],
    capabilities: ['exec', 'fs', 'git'],
  },
  setup(ctx) {
    const env = createLocalEnv()
    ctx.provide(LOCAL_ENV, env)
    unregister = ctx.tryGet(EXECUTOR)?.register(env.executor, execLocalConfig(ctx.config).priority)
    void env.status()
  },
  dispose() {
    unregister?.()
    unregister = undefined
  },
}

export default plugin
