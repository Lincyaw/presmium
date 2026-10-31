import { Compiler, build } from '@lincyaw/compiler'
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
// The lesson and the film each get a presentation with its lecture next to their page: the homepage plays the film
// live from `promo/slides/`, drawn by the browser at the viewer's resolution instead of a compressed video.
async function forms(name) {
  const outDir = fileURLToPath(new URL(`../.presmium/${name}-forms/`, import.meta.url))
  const compilation = await new Compiler(fileURLToPath(new URL(`../${name}/lecture.json`, import.meta.url))).compile()
  compilation.doc.config.renderers.slides = { ...compilation.doc.config.renderers.slides, base: `${prefix}${name}/slides/` }
  const settings = compilation.doc.config.presmium ??= {}
  settings['presmium.web'] = { ...settings['presmium.web'], webUrl: `${prefix}${name}/` }
  const result = await build(compilation, { outDir, to: ['slides', 'lecture'] })
  return { name, outDir, findings: [...compilation.doc.diagnostics, ...result.findings] }
}
const built = [await forms('learn'), await forms('promo')]
const errors = built.flatMap(form => form.findings).filter(finding => finding.severity === 'error')
if (errors.length) throw new Error(errors.map(finding => finding.message).join('\n'))
execFileSync('presmium', ['build', '.'], { cwd: root, stdio: 'inherit' })
for (const { name, outDir } of built) {
  cpSync(`${outDir}/slides`, `${root}/dist/web/${name}/slides`, { recursive: true })
  cpSync(`${outDir}/lecture`, `${root}/dist/web/${name}/lecture`, { recursive: true })
}
for (const course of courses) for (const form of ['slides', 'notebook', 'lecture']) {
  if (existsSync(`${root}/${course}/dist/${form}`)) cpSync(`${root}/${course}/dist/${form}`, `${root}/dist/web/${course}/${form}`, { recursive: true })
}
