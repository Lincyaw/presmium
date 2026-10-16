import { docBlocks, environmentExecutor, isRecord } from '@presmium/kernel'
import type { IRPass } from '@presmium/kernel'
import { EXEC_WASI_ID, WASI_EXECUTOR_ID, WASI_KIND } from '../domain/index.ts'
import { runtimeOf } from '../runner.mjs'

/**
 * `presmium.execWasi.runtimes`: the runtimes the deck's code that runs in the
 * browser needs (`:run: live` or `both`, run panels' code included, by the
 * WASI executor or a `kind: wasi` environment), written to the plugin's
 * configuration (`runtimes`), so a build publishes those and no others
 * (`clang` alone is some 50 MB).
 */
export const runtimesPass: IRPass = {
  name: 'presmium.execWasi.runtimes',
  run(doc) {
    const environments = Object.entries(doc.config.execute?.environments ?? {})
      .filter(([, spec]) => spec.kind === WASI_KIND)
      .map(([name]) => environmentExecutor(name))
    const runtimes = new Set<string>()
    for (const { block: { node } } of docBlocks(doc)) {
      if (node.type !== 'code' || !node.run || node.run.when === 'compile') continue
      const { executor, lang } = node.run
      if (executor && executor !== WASI_EXECUTOR_ID && !environments.includes(executor)) continue
      const runtime = runtimeOf(lang)
      if (runtime) runtimes.add(runtime)
    }
    const config = doc.config.presmium[EXEC_WASI_ID]
    doc.config.presmium[EXEC_WASI_ID] = { ...isRecord(config) ? config : {}, runtimes: [...runtimes].sort() }
  },
}
