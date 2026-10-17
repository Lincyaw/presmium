/**
 * Local Python executor for compile-time execution (K-19): runs code with the
 * machine's `python3` through the runner the browser uses too
 * (`@presmium/kernel/runner.py`), so parameters, stdin, files, sessions and
 * rich outputs behave alike in both. A session's blocks share one
 * interpreter (./child.ts). Its recordings name the interpreter's version
 * (`fingerprint`) and a digest of the runner (`revision`): a runner that
 * shows outputs otherwise (such as the value of a last expression, D-8)
 * makes the recordings of an older one run again.
 */
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import type { Executor } from '@presmium/kernel'
import { isPython } from '../domain/index.ts'
import { childRuns } from './child.ts'

export const PYTHON_EXECUTOR_ID = 'presmium.python'

const PYTHON = 'python3'
const RUNNER = readFileSync(createRequire(import.meta.url).resolve('@presmium/kernel/runner.py'), 'utf8')
/** The runner's revision: the first 16 hex digits of its sha256. */
const RUNNER_REVISION = `runner ${createHash('sha256').update(RUNNER).digest('hex').slice(0, 16)}`

let probe: { version: string, prefixes: string[] } | undefined

/** `Python 3.x.y` and the installation's prefixes, or '' without a usable python3; asked once. */
function python(): { version: string, prefixes: string[] } {
  if (!probe) {
    const found = spawnSync(PYTHON, ['-c', 'import sys; print(sys.version.split()[0]); print(sys.prefix); print(sys.base_prefix)'], { encoding: 'utf8' })
    const [version, ...prefixes] = found.status === 0 ? found.stdout.trim().split('\n') : []
    probe = version ? { version: `Python ${version}`, prefixes: [...new Set(prefixes)] } : { version: '', prefixes: [] }
  }
  return probe
}

const runs = childRuns({
  executorId: PYTHON_EXECUTOR_ID,
  argv: [PYTHON, '-c', `${RUNNER}\n_pm_main()\n`],
  read: () => python().prefixes,
  sessions: true,
})

export const pythonExecutor: Executor = {
  id: PYTHON_EXECUTOR_ID,
  // Without python3 the compiler falls back to recordings in .presmium/freeze.
  supports: lang => isPython(lang) && python().version !== '',
  fingerprint: () => python().version,
  revision: () => RUNNER_REVISION,
  run: runs.run,
  endSession: runs.endSession,
}
