import { createRequire } from 'node:module'
import { environmentExecutor, errorMessage } from '@presmium/kernel'
import type { EnvironmentProvider, PresmiumNodePlugin } from '@presmium/kernel'
import { adapterChoice, EXEC_WEBGPU_ID, WEBGPU_EXECUTOR_ID } from '../domain/index.ts'
import { jaxRuntime } from './jax.ts'
import { createRecorder, findRuntime, plainEnv } from './recorder.ts'

const { version } = createRequire(import.meta.url)('../../package.json') as { version: string }

/**
 * The provider of `kind: webgpu` environments: the recording executor named
 * after the environment, with its `adapter` (`auto`, `gpu`, `swiftshader`);
 * `presmium check --env` starts Chromium and asks for that adapter.
 */
const webgpu: EnvironmentProvider = {
  create: (name, spec) => createRecorder({ id: environmentExecutor(name), adapter: adapterChoice(spec) }),
  async probe(_name, spec) {
    try {
      await findRuntime(adapterChoice(spec), plainEnv())
      return undefined
    } catch (error) {
      return errorMessage(error)
    }
  },
}

/**
 * The browser GPU backend (P-104): WGSL compute shaders in `{run-panel} wgsl`,
 * run in a worker with WebGPU in the browser (src/client) and recorded in
 * Playwright's Chromium at compile time; the provider of `kind: webgpu`
 * environments; and jax-js for JavaScript and TypeScript code, which its
 * Vite plugin (`vitePlugins`, ./jax.ts) publishes with the deck, with its
 * license, for the execution plugin's script worker to import.
 */
const plugin: PresmiumNodePlugin = {
  id: EXEC_WEBGPU_ID,
  version,
  kernel: '^1.0.0',
  executors: [createRecorder({ id: WEBGPU_EXECUTOR_ID, adapter: 'auto' })],
  environments: { webgpu },
  vitePlugins: () => [jaxRuntime()],
}

export default plugin
