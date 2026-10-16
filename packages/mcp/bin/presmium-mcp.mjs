#!/usr/bin/env node
// Sources ship as TypeScript (docs/architecture.md section 3); jiti loads them.
import { createJiti } from 'jiti'

// stdout carries the MCP messages: whatever a plugin logs goes to stderr.
console.log = console.info = console.debug = console.error

// markdown-it (under myst-parser) requires the deprecated built-in punycode; keep that notice out of the output.
const emitWarning = process.emitWarning
process.emitWarning = (warning, ...args) => {
  const code = typeof args[0] === 'object' ? args[0]?.code : args[1]
  if (code !== 'DEP0040') emitWarning.call(process, warning, ...args)
}

const jiti = createJiti(import.meta.url)
const { main } = await jiti.import('../src/stdio.ts')
const code = await main(process.argv.slice(2))
if (code !== undefined) process.exitCode = code
