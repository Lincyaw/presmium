// Test-only executor: runs `python` code blocks with the local python3 at compile time,
// so the notebook carries real recorded outputs.
import { execFile } from 'node:child_process'
import type { PresmiumNodePlugin, RunResult } from '@lincyaw/kernel'

const plugin: PresmiumNodePlugin = {
  id: 'fixture.python',
  executors: [{
    id: 'fixture.python',
    supports: lang => lang === 'python',
    run: request => new Promise<RunResult>((resolve) => {
      const started = Date.now()
      const env = { ...process.env, PYTHONIOENCODING: 'utf-8' }
      execFile('python3', ['-c', request.code], { env, timeout: request.timeoutMs ?? 30_000 }, (error, stdout, stderr) => {
        resolve({
          ok: !error,
          stdout,
          stderr: stderr || (error && typeof error.code !== 'number' ? error.message : ''),
          exitCode: typeof error?.code === 'number' ? error.code : error ? null : 0,
          durationMs: Date.now() - started,
          timedOut: Boolean(error?.killed),
          source: 'live',
          executorId: 'fixture.python',
        })
      })
    }),
  }],
}

export default plugin
