// Test-only executor for the `echo` language: prints the code in upper case and
// appends each run to the file named by PRESMIUM_FIXTURE_RUNS, so tests can count runs.
import { appendFileSync } from 'node:fs'
import type { PresmiumNodePlugin } from '@presmium/kernel'

const plugin: PresmiumNodePlugin = {
  id: 'fixture.echo',
  executors: [{
    id: 'fixture.echo',
    supports: lang => lang === 'echo',
    async run(request) {
      if (process.env.PRESMIUM_FIXTURE_RUNS) appendFileSync(process.env.PRESMIUM_FIXTURE_RUNS, `${request.code}\n`)
      return { ok: true, stdout: `${request.code.toUpperCase()}\n`, stderr: '', exitCode: 0, durationMs: 1, timedOut: false, source: 'live', executorId: 'fixture.echo' }
    },
  }],
}

export default plugin
