/**
 * Local JavaScript and TypeScript executor for compile-time execution (K-19):
 * runs code with the node that runs the compiler, through the same runner as
 * the browser (src/runner.mjs), so the recorded output matches a live run.
 */
import type { Executor } from '@presmium/kernel'
import { isScript, isTypeScript } from '../domain/index.ts'
import { runChild } from './child.ts'

export const SCRIPT_EXECUTOR_ID = 'presmium.node'

// The result goes to file descriptor 3 (./child.ts); the run has cancelled what the code left
// pending, and whatever else it opened ends with the process.
const MAIN = `import { writeSync } from 'node:fs'
import { runScript } from ${JSON.stringify(new URL('../runner.mjs', import.meta.url).href)}
let input = ''
for await (const chunk of process.stdin) input += chunk
const result = Buffer.from(JSON.stringify(await runScript(JSON.parse(input))))
for (let written = 0; written < result.length;) written += writeSync(3, result, written)
process.exit(0)
`

const runner = { executorId: SCRIPT_EXECUTOR_ID, command: process.execPath, args: ['--input-type=module', '-e', MAIN] }

export const scriptExecutor: Executor = {
  id: SCRIPT_EXECUTOR_ID,
  supports: isScript,
  fingerprint: () => `node ${process.version}`,
  run: (request, signal) => runChild(runner, request, { code: request.code, args: request.args, typescript: isTypeScript(request.lang) }, signal),
}
