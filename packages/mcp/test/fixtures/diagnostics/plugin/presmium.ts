import { appendFileSync } from 'node:fs'
import { join } from 'node:path'

export default {
  id: 'fixture.diagnostics',
  passes: [{
    name: 'fixture-diagnostics',
    run(doc, ctx) {
      if (doc.meta.title.startsWith('Broken')) ctx.report({ checkId: 'fixture.diagnostics.compile', severity: 'error', message: 'The document needs a repair.', source: { file: doc.meta.entry, line: 2 } })
    },
  }],
  checks: [{
    id: 'fixture.diagnostics.check',
    async run(ctx) {
      appendFileSync(join(ctx.workspaceRoot, 'check-ran'), 'explicit check\n')
      return [{ checkId: 'fixture.diagnostics.check', severity: 'warning', message: 'This finding requires an explicit check.' }]
    },
  }],
}
