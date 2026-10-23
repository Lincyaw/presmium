// The example's two lectures: `check` and `ir` run on each; `build` builds the workspace's site into dist/web/ and adds
// each lecture's slides, notebook and narrated lecture to it, at <lecture>/slides/, <lecture>/notebook/ and
// <lecture>/lecture/ (where the page's lecture view looks first).
import { execFileSync } from 'node:child_process'
import { cpSync, existsSync, readFileSync, rmSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { parse } from 'yaml'

const root = fileURLToPath(new URL('..', import.meta.url))
const cli = fileURLToPath(new URL('../../../packages/cli/bin/presmium.mjs', import.meta.url))
const LECTURES = ['bubble-sort', 'libraries']
const base = '/' + (parse(readFileSync(new URL('../presmium.workspace.yaml', import.meta.url), 'utf8')).site?.base ?? '').replace(/^\/+|\/+$/g, '')
const prefix = base === '/' ? '/' : base + '/'
const operation = process.argv[2]
if (!['build', 'check', 'ir'].includes(operation)) throw new Error('expected build, check or ir')
const run = args => execFileSync(process.execPath, [cli, ...args], { cwd: root, stdio: 'inherit' })

if (operation !== 'build') for (const lecture of LECTURES) run([operation, lecture])
else {
  rmSync(`${root}/dist`, { recursive: true, force: true })
  for (const lecture of LECTURES) {
    console.log(`\n${lecture}`)
    execFileSync(process.execPath, [fileURLToPath(new URL('./build-lecture.mjs', import.meta.url)), lecture, `${prefix}${lecture}/slides/`], { cwd: root, stdio: 'inherit' })
  }
  run(['build', '.'])
  for (const lecture of LECTURES) {
    for (const form of ['slides', 'notebook', 'lecture']) {
      if (existsSync(`${root}/${lecture}/dist/${form}`)) cpSync(`${root}/${lecture}/dist/${form}`, `${root}/dist/web/${lecture}/${form}`, { recursive: true })
    }
  }
}
