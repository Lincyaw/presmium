import { execFileSync } from 'node:child_process'
import { cpSync, existsSync, readFileSync, rmSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { parse } from 'yaml'

const root = fileURLToPath(new URL('../', import.meta.url))
const config = parse(readFileSync(new URL('../presmium.workspace.yaml', import.meta.url), 'utf8'))
const base = '/' + (config.site?.base ?? '/').replace(/^\/+|\/+$/g, '')
const prefix = base === '/' ? '/' : base + '/'
const courses = ['bubble-sort', 'libraries']
rmSync(`${root}/dist`, { recursive: true, force: true })
for (const course of courses) {
  execFileSync(process.execPath, [fileURLToPath(new URL('./build-lecture.mjs', import.meta.url)), course, `${prefix}${course}/slides/`], { cwd: root, stdio: 'inherit' })
}
// The workspace build also builds the presentation and the lecture of every document that asks for them (the lesson
// and the film among them): the homepage plays the film live from `promo/slides/`.
execFileSync('presmium', ['build', '.'], { cwd: root, stdio: 'inherit' })
for (const course of courses) for (const form of ['slides', 'notebook', 'lecture']) {
  if (existsSync(`${root}/${course}/dist/${form}`)) cpSync(`${root}/${course}/dist/${form}`, `${root}/dist/web/${course}/${form}`, { recursive: true })
}
