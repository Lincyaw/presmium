/**
 * Local Python executor for compile-time execution (K-19): runs code with the
 * machine's `python3` through the same runner as the browser (src/runner.py),
 * so parameters, stdin and files behave alike in both. Each run starts in a
 * fresh temporary directory, where the request's files are written.
 */
import { spawn, spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Executor, RunResult } from '@presmium/kernel'
import { DEFAULT_EXEC_CONFIG, failedRun, isPython } from '../domain/index.ts'

export const PYTHON_EXECUTOR_ID = 'presmium.python'

const PYTHON = 'python3'
const MAIN = `${readFileSync(new URL('../runner.py', import.meta.url), 'utf8')}
import json as _pm_json, sys as _pm_sys
_pm_request = _pm_json.loads(_pm_sys.stdin.read())
_pm_sys.stdout.write(_pm_run(_pm_request['code'], _pm_json.dumps(_pm_request.get('args') or {}), _pm_request.get('stdin') or '', _pm_json.dumps(_pm_request.get('files') or {}), 0))
`

let version: string | undefined

/** `Python 3.x.y`, or '' without a usable python3; asked once. */
function pythonVersion(): string {
  if (version === undefined) {
    const probe = spawnSync(PYTHON, ['--version'], { encoding: 'utf8' })
    version = probe.status === 0 ? `${probe.stdout}${probe.stderr}`.trim() : ''
  }
  return version
}

interface RunnerOutput {
  stdout: string
  stderr: string
  exitCode: number
}

export const pythonExecutor: Executor = {
  id: PYTHON_EXECUTOR_ID,
  // Without python3 the compiler falls back to recordings in .presmium/freeze.
  supports: lang => isPython(lang) && pythonVersion() !== '',
  fingerprint: () => pythonVersion(),
  run(request, signal) {
    const timeoutMs = request.timeoutMs ?? DEFAULT_EXEC_CONFIG.timeoutMs
    const cwd = mkdtempSync(join(tmpdir(), 'presmium-python-'))
    const started = Date.now()
    return new Promise<RunResult>((resolve) => {
      const child = spawn(PYTHON, ['-c', MAIN], { cwd, env: { ...process.env, PYTHONIOENCODING: 'utf-8' }, signal })
      const out: Buffer[] = []
      const err: Buffer[] = []
      let timedOut = false
      const timer = setTimeout(() => {
        timedOut = true
        child.kill('SIGKILL')
      }, timeoutMs)
      child.stdout.on('data', (chunk: Buffer) => out.push(chunk))
      child.stderr.on('data', (chunk: Buffer) => err.push(chunk))
      const finish = (result: RunResult) => {
        clearTimeout(timer)
        rmSync(cwd, { recursive: true, force: true })
        resolve(result)
      }
      child.on('error', error => finish(failedRun(PYTHON_EXECUTOR_ID, error.message, Date.now() - started)))
      child.on('close', () => {
        const durationMs = Date.now() - started
        if (timedOut) return finish({ ...failedRun(PYTHON_EXECUTOR_ID, `执行超过 ${timeoutMs} ms，已停止`, durationMs), timedOut: true })
        let output: RunnerOutput
        try {
          output = JSON.parse(Buffer.concat(out).toString('utf8')) as RunnerOutput
        }
        catch {
          return finish(failedRun(PYTHON_EXECUTOR_ID, Buffer.concat(err).toString('utf8') || 'python3 produced no result', durationMs))
        }
        finish({ ok: output.exitCode === 0, stdout: output.stdout, stderr: output.stderr, exitCode: output.exitCode, durationMs, timedOut: false, source: 'live', executorId: PYTHON_EXECUTOR_ID })
      })
      child.stdin.on('error', () => {})
      child.stdin.end(JSON.stringify(request))
    })
  },
}
