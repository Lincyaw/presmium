import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import type { Executor } from '@lincyaw/kernel'
import { isScript } from '../domain/index.ts'
import { childRuns, REQUEST_FILE } from './child.ts'

export const SCRIPT_EXECUTOR_ID = 'presmium.node'

const RUNNER = new URL('../runner.mjs', import.meta.url)
const READ = [fileURLToPath(new URL('../..', import.meta.url)), dirname(createRequire(RUNNER).resolve('sucrase/package.json')), dirname(dirname(process.execPath))]

const MAIN = `import { readFileSync, renameSync, writeFileSync } from 'node:fs'
import { runScript } from ${JSON.stringify(RUNNER.href)}
const { runs } = JSON.parse(readFileSync(${JSON.stringify(REQUEST_FILE)}, 'utf8'))
for (const [i, run] of runs.entries()) {
  const result = await runScript({ code: run.code, args: run.args, typescript: /^(ts|typescript)$/i.test(run.lang ?? '') })
  writeFileSync(\`.presmium/result-\${i}.part\`, JSON.stringify(result))
  renameSync(\`.presmium/result-\${i}.part\`, \`.presmium/result-\${i}.json\`)
}
process.exit(0)
`

const runs = childRuns({
  executorId: SCRIPT_EXECUTOR_ID,
  argv: [process.execPath, '--input-type=module', '-e', MAIN],
  read: () => READ,
  sessions: false,
})

export const scriptExecutor: Executor = {
  id: SCRIPT_EXECUTOR_ID,
  supports: isScript,
  fingerprint: () => `node ${process.version}`,
  run: runs.run,
}
