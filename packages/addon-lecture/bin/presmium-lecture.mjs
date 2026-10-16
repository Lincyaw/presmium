#!/usr/bin/env node
// Sources ship as TypeScript (docs/architecture.md section 3); jiti loads them.
import { createJiti } from 'jiti'

// markdown-it (under the compiler's myst-parser) requires the deprecated built-in punycode; keep that notice out of the output.
const emitWarning = process.emitWarning
process.emitWarning = (warning, ...args) => {
  const code = typeof args[0] === 'object' ? args[0]?.code : args[1]
  if (code !== 'DEP0040') emitWarning.call(process, warning, ...args)
}

const jiti = createJiti(import.meta.url)
const { lectureMain } = await jiti.import('../src/node/cli.ts')
process.exitCode = await lectureMain(process.argv.slice(2))
