import { Compiler, build } from '@presmium/compiler'
import { rmSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const [directory, base] = process.argv.slice(2)
const outDir = resolve(directory, 'dist')
rmSync(outDir, { recursive: true, force: true })
for (const [entry, to] of [['lecture.md', ['notebook']], ['slides.md', ['slides']]]) {
  const compilation = await new Compiler(resolve(directory, entry)).compile()
  if (entry === 'slides.md') compilation.doc.config.renderers.slides = { ...compilation.doc.config.renderers.slides, base, routerMode: 'hash' }
  const result = await build(compilation, { outDir, to })
  writeFileSync(resolve(outDir, entry === 'slides.md' ? 'slides-ir.json' : 'reading-ir.json'), JSON.stringify(compilation.doc))
  for (const finding of [...compilation.doc.diagnostics, ...result.findings]) console.log(`${finding.severity}: ${finding.message}`)
  if ([...compilation.doc.diagnostics, ...result.findings].some(finding => finding.severity === 'error')) process.exitCode = 1
}
