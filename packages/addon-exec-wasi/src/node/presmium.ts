import { createRequire } from 'node:module'
import { environmentExecutor } from '@lincyaw/kernel'
import type { EnvironmentProvider, PresmiumNodePlugin } from '@lincyaw/kernel'
import { EXEC_WASI_ID, execWasiConfig, WASI_EXECUTOR_ID, WASI_KIND } from '../domain/index.ts'
import { wasiLanguage } from '../shared/wasi-runner.mjs'
import { createWasiExecutor } from './executor.ts'
import { missingRuntime } from './runtime.ts'
import { runtimesPass } from './runtimes.ts'
import { wasiAssets } from './vite.ts'

const { version } = createRequire(import.meta.url)('../../package.json') as { version: string }

const languagesOf = (languages: string[] | undefined) => languages?.length ? languages : ['c', 'cpp', 'ruby', 'sql']

const wasi: EnvironmentProvider = {
  create(name, spec) {
    return createWasiExecutor(environmentExecutor(name), spec.languages)
  },
  async probe(_name, spec) {
    const problems = languagesOf(spec.languages).map(lang => wasiLanguage(lang) ? missingRuntime(lang) : `no WASI runtime runs ${lang}`)
    return [...new Set(problems.filter(Boolean))].join('; ') || undefined
  },
}

const plugin: PresmiumNodePlugin = {
  id: EXEC_WASI_ID,
  version,
  kernel: '^1.0.0',
  passes: [runtimesPass],
  executors: [createWasiExecutor(WASI_EXECUTOR_ID)],
  environments: { [WASI_KIND]: wasi },
  vitePlugins({ config }) {
    return [wasiAssets(execWasiConfig(config).runtimes)]
  },
}

export default plugin
