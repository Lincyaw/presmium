// One lecture's slides (for the site's base), notebook and narrated lecture, into <lecture>/dist/; its slides link to its
// page on the workspace's site, the directory above them.
import { build, Compiler } from '@lincyaw/compiler'
import { rmSync } from 'node:fs'
import { resolve } from 'node:path'

const [directory, base] = process.argv.slice(2)
const outDir = resolve(directory, 'dist')
rmSync(outDir, { recursive: true, force: true })
const compilation = await new Compiler(resolve(directory, 'lecture.md')).compile()
const renderers = compilation.doc.config.renderers
if (renderers.slides) renderers.slides = { ...renderers.slides, base }
const web = compilation.doc.config.presmium['presmium.web'] ?? {}
compilation.doc.config.presmium['presmium.web'] = { ...web, webUrl: new URL('..', new URL(base, 'http://site')).pathname }
const to = ['slides', 'notebook', 'lecture'].filter(form => renderers[form])
const result = await build(compilation, { outDir, to })
const findings = [...compilation.doc.diagnostics, ...result.findings]
for (const finding of findings) console.log(`${finding.severity}: ${finding.message}`)
if (findings.some(finding => finding.severity === 'error')) process.exitCode = 1
