// Builds a shared document's web form for the cloud's share page: `share-build.mjs <document dir> <out dir> <base>`.
import { createRequire } from 'node:module'

const [document, out, base] = process.argv.slice(2)
if (!document || !out || !base) throw new Error('usage: share-build.mjs <document dir> <out dir> <base>')
const require = createRequire('/opt/presmium/packages/cli/package.json')
const { createJiti } = require('jiti')
const jiti = createJiti('/opt/presmium/packages/cli/package.json')
const { Compiler, build } = await jiti.import('@lincyaw/compiler')
const compilation = await new Compiler(document, { bundled: '/opt/presmium/packages/presmium' }).compile()
const failed = compilation.doc.diagnostics.filter(finding => finding.severity === 'error')
for (const finding of failed) console.error(`${finding.checkId}: ${finding.message}`)
if (failed.length) process.exit(1)
const report = await build(compilation, { outDir: out, to: ['web'], base, log: line => console.log(line) })
const errors = report.findings.filter(finding => finding.severity === 'error')
for (const finding of errors) console.error(`${finding.checkId}: ${finding.message}`)
process.exit(errors.length || !report.outputs.some(output => output.renderer === 'web') ? 1 : 0)
