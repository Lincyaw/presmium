#!/usr/bin/env node
import { join, sep } from 'node:path'
import ts from 'typescript'

const root = new URL('..', import.meta.url).pathname
// tsconfig.json takes the `.ts` sources, tests and specs; the workbench's React panels have their own settings.
const PROJECTS = ['tsconfig.json', 'packages/workbench/tsconfig.json']
// Dependencies that publish their `.ts` sources type-check only with their own settings; skipLibCheck covers `.d.ts`
// files alone. The repository's code is checked against those sources' types, and the errors inside them are not reported.
const DEPENDENCY = `${sep}node_modules${sep}`

const host = {
  getCanonicalFileName: name => name,
  getCurrentDirectory: () => root,
  getNewLine: () => '\n',
}
const problems = []
let files = 0
for (const project of PROJECTS) {
  const config = ts.getParsedCommandLineOfConfigFile(join(root, project), {}, { ...ts.sys, onUnRecoverableConfigFileDiagnostic: d => problems.push(d) })
  if (!config) continue
  const program = ts.createProgram({ rootNames: config.fileNames, options: config.options, projectReferences: config.projectReferences })
  problems.push(...config.errors, ...program.getOptionsDiagnostics(), ...program.getGlobalDiagnostics())
  for (const file of program.getSourceFiles()) {
    if (file.fileName.includes(DEPENDENCY)) continue
    files++
    problems.push(...program.getSyntacticDiagnostics(file), ...program.getSemanticDiagnostics(file))
  }
}

if (problems.length) {
  console.error(ts.formatDiagnostics(problems, host).replaceAll(root, ''))
  console.error(`type errors: ${problems.length}`)
  process.exit(1)
}
console.log(`types ok: ${files} files in ${PROJECTS.join(', ')}`)
