// Test-only executor for the `interp` language: runs the code with the `fakeinterp` program on
// PATH, and fingerprints the runtime with `fakeinterp --version`, as an interpreter executor does.
import { execFileSync } from 'node:child_process'
import type { PresmiumNodePlugin } from '@presmium/kernel'

const plugin: PresmiumNodePlugin = {
  id: 'fixture.interp',
  executors: [{
    id: 'fixture.interp',
    supports: lang => lang === 'interp',
    fingerprint: () => execFileSync('fakeinterp', ['--version'], { encoding: 'utf8' }).trim(),
    async run(request) {
      const stdout = execFileSync('fakeinterp', [], { input: request.code, encoding: 'utf8' })
      return { ok: true, stdout, stderr: '', exitCode: 0, durationMs: 1, timedOut: false, source: 'live', executorId: 'fixture.interp' }
    },
  }],
}

export default plugin
