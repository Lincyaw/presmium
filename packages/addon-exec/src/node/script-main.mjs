import { readFileSync, renameSync, writeFileSync } from 'node:fs'
import { runScript } from '../shared/script-runner.mjs'

const [requestFile, resultPrefix] = process.argv.slice(2)
const { runs } = JSON.parse(readFileSync(requestFile, 'utf8'))
for (const [i, run] of runs.entries()) {
  const result = await runScript({ code: run.code, args: run.args, typescript: /^(ts|typescript)$/i.test(run.lang ?? '') })
  writeFileSync(`${resultPrefix}${i}.part`, JSON.stringify(result))
  renameSync(`${resultPrefix}${i}.part`, `${resultPrefix}${i}.json`)
}
process.exit(0)
