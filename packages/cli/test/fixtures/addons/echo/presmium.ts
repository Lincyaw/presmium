// Test-only executor for the `echo` language: prints the code in upper case and
// appends each run to the file named by PRESMIUM_FIXTURE_RUNS, so tests can count runs.
// Its pass after compile-time execution lists the outputs in the IR's metadata.
import { appendFileSync } from 'node:fs'
import type { IRBlock, PresmiumNodePlugin } from '@presmium/kernel'

const outputs = (blocks: IRBlock[]): string[] => blocks.flatMap(({ node }) =>
  node.type === 'code' ? node.outputs?.map(o => o.stdout) ?? [] : node.type === 'component' ? outputs(node.children ?? []) : [])

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
  passes: [{
    name: 'fixture.echo.recorded',
    after: 'execute',
    run(doc) {
      doc.meta.recorded = doc.sections.flatMap(s => outputs(s.blocks))
    },
  }],
}

export default plugin
