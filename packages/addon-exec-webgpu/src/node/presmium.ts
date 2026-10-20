import { createRequire } from 'node:module'
import { environmentExecutor, errorMessage } from '@lincyaw/kernel'
import type { EnvironmentProvider, PresmiumNodePlugin } from '@lincyaw/kernel'
import { adapterChoice, EXEC_WEBGPU_ID, WEBGPU_EXECUTOR_ID } from '../domain/index.ts'
import { jaxRuntime } from './jax.ts'
import { createRecorder, findRuntime, plainEnv } from './recorder.ts'

const { version } = createRequire(import.meta.url)('../../package.json') as { version: string }

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

const plugin: PresmiumNodePlugin = {
  id: EXEC_WEBGPU_ID,
  version,
  kernel: '^1.0.0',
  executors: [createRecorder({ id: WEBGPU_EXECUTOR_ID, adapter: 'auto' })],
  environments: { webgpu },
  vitePlugins: () => [jaxRuntime()],
}

export default plugin
