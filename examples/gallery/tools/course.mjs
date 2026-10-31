// Lightweight course commands remain scoped to the two original complete courses.
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const cli = fileURLToPath(new URL('../../../packages/cli/bin/presmium.mjs', import.meta.url))
const LECTURES = ['bubble-sort', 'libraries']
const operation = process.argv[2]
if (!['check', 'ir'].includes(operation)) throw new Error('expected check or ir')
const run = args => execFileSync(process.execPath, [cli, ...args], { cwd: root, stdio: 'inherit' })

for (const lecture of LECTURES) run([operation, lecture])
