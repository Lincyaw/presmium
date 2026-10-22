import { createRequire } from 'node:module'
import { environmentExecutor, errorMessage } from '@lincyaw/kernel'
import type { EnvironmentProvider, PresmiumNodePlugin } from '@lincyaw/kernel'
import { minimalRunEnv } from '@lincyaw/kernel/node'
import { adapterChoice, EXEC_WEBGPU_ID, WEBGPU_EXECUTOR_ID, WEBGPU_KIND } from '../domain/index.ts'
import { createChromiumExecutor, findChromiumAdapter } from './recorder.ts'
import { jaxAssets } from './vite.ts'

const { version } = createRequire(import.meta.url)('../../package.json') as { version: string }

const webgpu: EnvironmentProvider = {
  create: (name, spec) => createChromiumExecutor({ id: environmentExecutor(name), adapter: adapterChoice(spec) }),
  async probe(_name, spec) {
    try {
      await findChromiumAdapter(adapterChoice(spec), minimalRunEnv())
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
  executors: [createChromiumExecutor({ id: WEBGPU_EXECUTOR_ID, adapter: 'auto' })],
  environments: { [WEBGPU_KIND]: webgpu },
  vitePlugins: () => [jaxAssets()],
}

export default plugin
