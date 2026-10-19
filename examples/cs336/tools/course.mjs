import { execFileSync } from 'node:child_process'
import { readFileSync, cpSync, rmSync } from 'node:fs'
import { parse } from 'yaml'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const cli = fileURLToPath(new URL('../../../packages/cli/bin/presmium.mjs', import.meta.url))
const { lectures } = JSON.parse(readFileSync(new URL('../coverage.json', import.meta.url), 'utf8'))
const base = '/' + (parse(readFileSync(new URL('../presmium.workspace.yaml', import.meta.url), 'utf8')).site?.base ?? '').replace(/^\/+|\/+$/g, '')
const prefix = base === '/' ? '/' : base + '/'
const operation = process.argv[2]
if (!['build', 'check', 'ir'].includes(operation)) throw new Error('expected build, check or ir')
const run = args => execFileSync(process.execPath, [cli, ...args], { cwd: root, stdio: 'inherit' })
execFileSync(process.execPath, [fileURLToPath(new URL('./audit.mjs', import.meta.url))], { stdio: 'inherit' })
if (operation === 'build') rmSync(`${root}/dist`, { recursive: true, force: true })
for (const lecture of lectures) {
  const dir = lecture.entry.slice(0, -'/lecture.md'.length)
  console.log(`\nCS336 ${String(lecture.lecture).padStart(2, '0')}: ${lecture.title}`)
  if (operation === 'build') execFileSync(process.execPath, [fileURLToPath(new URL('./build-lecture.mjs', import.meta.url)), dir, `${prefix}${dir}/slides/`], { cwd: root, stdio: 'inherit' })
  else {
    run([operation, dir])
    run([operation, `${dir}/slides.md`])
  }
}
if (operation === 'build') {
  run(['build', '.'])
  for (const lecture of lectures) {
    const dir = lecture.entry.split('/')[0]
    for (const form of ['slides', 'notebook']) cpSync(`${root}/${dir}/dist/${form}`, `${root}/dist/web/${dir}/${form}`, { recursive: true })
  }
  execFileSync(process.execPath, [fileURLToPath(new URL('./audit-build.mjs', import.meta.url))], { stdio: 'inherit' })
}
