import { createRequire } from 'node:module'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Executor } from '@lincyaw/kernel'
import { RUN_REQUEST_FILE, RUN_RESULT_PREFIX } from '@lincyaw/kernel/node'
import { isScript } from '../domain/index.ts'
import { createChildProcessRuns } from './child-process.ts'

export const NODE_SCRIPT_EXECUTOR_ID = 'presmium.node'

const MAIN = fileURLToPath(new URL('./script-main.mjs', import.meta.url))
const READ = [fileURLToPath(new URL('../..', import.meta.url)), dirname(createRequire(import.meta.url).resolve('sucrase/package.json')), dirname(dirname(process.execPath))]

const runs = createChildProcessRuns({
  executorId: NODE_SCRIPT_EXECUTOR_ID,
  argv: [process.execPath, MAIN, RUN_REQUEST_FILE, RUN_RESULT_PREFIX],
  read: () => READ,
  sessions: false,
})

export const scriptExecutor: Executor = {
  id: NODE_SCRIPT_EXECUTOR_ID,
  supports: isScript,
  fingerprint: () => `node ${process.version}`,
  run: runs.run,
}
