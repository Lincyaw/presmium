import { createRequire } from 'node:module'
import { environmentExecutor } from '@presmium/kernel'
import type { EnvironmentProvider, PresmiumNodePlugin } from '@presmium/kernel'
import { EXEC_WASI_ID, execWasiConfig, WASI_EXECUTOR_ID, WASI_KIND } from '../domain/index.ts'
import { wasiLanguage } from '../runner.mjs'
import { createWasiExecutor } from './executor.ts'
import { runtimesPass } from './pass.ts'
import { missingRuntime } from './runtime.ts'
import { wasiRuntime } from './vite.ts'

const { version } = createRequire(import.meta.url)('../../package.json') as { version: string }

/** The languages an environment declares, else all four. */
const languagesOf = (languages: string[] | undefined) => languages?.length ? languages : ['c', 'cpp', 'ruby', 'sql']

/**
 * The provider of `kind: wasi` environments (P-100): the WASI executor under
 * the environment's id (`presmium.env.<name>`), limited to its `languages`.
 * `presmium check --env` reports a declared language no WASI runtime runs,
 * and runtime files that are missing.
 */
const wasi: EnvironmentProvider = {
  create(name, spec) {
    return createWasiExecutor(environmentExecutor(name), spec.languages)
  },
  async probe(_name, spec) {
    const problems = languagesOf(spec.languages).map(lang => wasiLanguage(lang) ? missingRuntime(lang) : `no WASI runtime runs ${lang}`)
    return [...new Set(problems.filter(Boolean))].join('; ') || undefined
  },
}

/**
 * WebAssembly execution (P-103): C, C++, Ruby and SQL code runs on Runno's
 * WASI binaries, in a worker in the browser (src/client) and in a process of
 * its own at compile time (./executor.ts, in the compiler's process sandbox
 * when there is one), so the build machine needs no toolchain and the
 * recording matches a live run. The forms publish the runtimes the deck's
 * live code needs (./pass.ts, and the Vite plugin of `vitePlugins`,
 * ./vite.ts), which the service worker caches for offline use.
 * Environments of `kind: wasi` select it by name.
 */
const plugin: PresmiumNodePlugin = {
  id: EXEC_WASI_ID,
  version,
  kernel: '^0.1.0',
  passes: [runtimesPass],
  executors: [createWasiExecutor(WASI_EXECUTOR_ID)],
  environments: { [WASI_KIND]: wasi },
  vitePlugins({ config }) {
    return [wasiRuntime(execWasiConfig(config).runtimes)]
  },
}

export default plugin
