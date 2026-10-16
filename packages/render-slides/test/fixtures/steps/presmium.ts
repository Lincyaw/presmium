// Test-only plugin: code blocks that step through line highlights ({stepcode}) or
// versions ({morph}, each at its own lines and permalink, as a code reference gives them),
// and an `echo` executor whose output is recorded at build time.
import type { PresmiumNodePlugin } from '@presmium/kernel'

const lines = (spec: string) => spec.split(',').flatMap((part) => {
  const [from, to = from] = part.split('-').map(Number)
  return Array.from({ length: to! - from! + 1 }, (_, i) => from! + i)
})

const plugin: PresmiumNodePlugin = {
  id: 'fixture.steps',
  directives: [
    {
      // :lines: 1 | 2-3 highlights line 1, then lines 2 and 3.
      name: 'stepcode',
      arg: true,
      body: true,
      options: { lines: 'string' },
      toIR({ arg = '', options, body }) {
        const highlight = String(options.lines).split('|').map(s => lines(s.trim()))
        return { node: { type: 'code', lang: arg, value: body, highlight }, span: highlight.length - 1 }
      },
    },
    {
      // Versions separated by a line `===`.
      name: 'morph',
      arg: true,
      body: true,
      toIR({ arg = '', body }) {
        const variants = body.split(/\n===\n/).map((value, i) => ({ label: `v${i + 1}`, value, permalink: `https://example.org/v${i + 1}/sum.py#L${i + 1}`, startLine: i + 1, endLine: i + 1 }))
        const origin = { anchor: 'line:sum.py#total' as const, file: 'sum.py', startLine: 2, endLine: 2, status: 'exact' as const, permalink: variants.at(-1)!.permalink }
        return { node: { type: 'code', lang: arg, value: variants[0]!.value, variants, origin }, span: variants.length - 1 }
      },
    },
  ],
  executors: [{
    id: 'fixture.echo',
    supports: lang => lang === 'echo',
    async run(request) {
      return { ok: true, stdout: `${request.code.toUpperCase()}\n`, stderr: '', exitCode: 0, durationMs: 1, timedOut: false, source: 'live', executorId: 'fixture.echo' }
    },
  }],
}

export default plugin
