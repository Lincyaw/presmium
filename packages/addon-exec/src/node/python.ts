import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import type { Executor } from '@lincyaw/kernel'
import { isPython } from '../domain/index.ts'
import { createChildProcessRuns } from './child-process.ts'

const PYTHON_EXECUTOR_ID = 'presmium.python'

const PYTHON = 'python3'
const RUNNER = readFileSync(createRequire(import.meta.url).resolve('@lincyaw/kernel/runner.py'), 'utf8')
const RUNNER_REVISION = `runner ${createHash('sha256').update(RUNNER).digest('hex').slice(0, 16)}`

let probe: { version: string, prefixes: string[] } | undefined

function python(): { version: string, prefixes: string[] } {
  if (!probe) {
    const found = spawnSync(PYTHON, ['-c', 'import sys; print(sys.version.split()[0]); print(sys.prefix); print(sys.base_prefix)'], { encoding: 'utf8' })
    const [version, ...prefixes] = found.status === 0 ? found.stdout.trim().split('\n') : []
    probe = version ? { version: `Python ${version}`, prefixes: [...new Set(prefixes)] } : { version: '', prefixes: [] }
  }
  return probe
}

const runs = createChildProcessRuns({
  executorId: PYTHON_EXECUTOR_ID,
  argv: [PYTHON, '-c', `${RUNNER}\n_pm_main()\n`],
  read: () => python().prefixes,
  sessions: true,
})

export const pythonExecutor: Executor = {
  id: PYTHON_EXECUTOR_ID,
  supports: lang => isPython(lang) && python().version !== '',
  fingerprint: () => python().version,
  revision: () => RUNNER_REVISION,
  run: runs.run,
  endSession: runs.endSession,
}
