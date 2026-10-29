import { Compiler, build } from '@lincyaw/compiler'
import { execFileSync } from 'node:child_process'
import { cpSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { parse } from 'yaml'

const root = fileURLToPath(new URL('../', import.meta.url))
const config = parse(readFileSync(new URL('../presmium.workspace.yaml', import.meta.url), 'utf8'))
const base = '/' + (config.site?.base ?? '/').replace(/^\/+|\/+$/g, '')
const prefix = base === '/' ? '/' : base + '/'
const outDir = fileURLToPath(new URL('../.presmium/lesson-forms/', import.meta.url))
const compilation = await new Compiler(fileURLToPath(new URL('../learn/lecture.json', import.meta.url))).compile()
compilation.doc.config.renderers.slides = { ...compilation.doc.config.renderers.slides, base: `${prefix}learn/slides/` }
compilation.doc.config.presmium['presmium.web'] = { ...compilation.doc.config.presmium['presmium.web'], webUrl: `${prefix}learn/` }
const result = await build(compilation, { outDir, to: ['slides', 'lecture'] })
const film = await new Compiler(fileURLToPath(new URL('../promo/lecture.json', import.meta.url))).compile()
const filmOut = fileURLToPath(new URL('../.presmium/film-forms/', import.meta.url))
const filmResult = await build(film, { outDir: filmOut, to: ['lecture'] })
const errors = [...compilation.doc.diagnostics, ...result.findings, ...film.doc.diagnostics, ...filmResult.findings].filter(finding => finding.severity === 'error')
if (errors.length) throw new Error(errors.map(finding => finding.message).join('\n'))
execFileSync(process.execPath, ['tools/package-source.mjs'], { cwd: root, stdio: 'inherit' })
execFileSync('presmium', ['build', '.'], { cwd: root, stdio: 'inherit' })
cpSync(`${outDir}/slides`, `${root}/dist/web/learn/slides`, { recursive: true })
cpSync(`${outDir}/lecture`, `${root}/dist/web/learn/lecture`, { recursive: true })
cpSync(`${filmOut}/lecture`, `${root}/dist/web/promo/lecture`, { recursive: true })
