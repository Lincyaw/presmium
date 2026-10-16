/**
 * Local Python executor for compile-time execution (K-19): runs code with the
 * machine's `python3` through the same runner as the browser (src/runner.py),
 * so parameters, stdin and files behave alike in both. The request's files
 * are written into the run's own temporary directory.
 */
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import type { Executor } from '@presmium/kernel'
import { isPython } from '../domain/index.ts'
import { runChild } from './child.ts'

export const PYTHON_EXECUTOR_ID = 'presmium.python'

const PYTHON = 'python3'
// The result goes to file descriptor 3 (./child.ts).
const MAIN = `${readFileSync(new URL('../runner.py', import.meta.url), 'utf8')}
import json as _pm_json, os as _pm_os, sys as _pm_sys
_pm_request = _pm_json.loads(_pm_sys.stdin.read())
_pm_result = _pm_run(_pm_request['code'], _pm_json.dumps(_pm_request.get('args') or {}), _pm_request.get('stdin') or '', _pm_json.dumps(_pm_request.get('files') or {}), 0)
with _pm_os.fdopen(3, 'w', encoding='utf-8') as _pm_channel:
    _pm_channel.write(_pm_result)
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

const runner = { executorId: PYTHON_EXECUTOR_ID, command: PYTHON, args: ['-c', MAIN], env: { PYTHONIOENCODING: 'utf-8' } }

export const pythonExecutor: Executor = {
  id: PYTHON_EXECUTOR_ID,
  // Without python3 the compiler falls back to recordings in .presmium/freeze.
  supports: lang => isPython(lang) && pythonVersion() !== '',
  fingerprint: () => pythonVersion(),
  run: (request, signal) => runChild(runner, request, request, signal),
}
