#!/usr/bin/env node
// The Presmium language server: presmium-language-server --stdio | --node-ipc | --socket=<port>.
// Sources ship as TypeScript (docs/architecture.md section 3); jiti loads them.
import { createJiti } from 'jiti'

// With --stdio, stdout carries the protocol: console output of the compiler and the plugins goes to stderr.
console.log = console.info = console.debug = console.error

// markdown-it (under myst-parser) requires the deprecated built-in punycode; keep that notice out of the output.
const emitWarning = process.emitWarning
process.emitWarning = (warning, ...args) => {
  const code = typeof args[0] === 'object' ? args[0]?.code : args[1]
  if (code !== 'DEP0040') emitWarning.call(process, warning, ...args)
}

const jiti = createJiti(import.meta.url)
const { startServer } = await jiti.import('../src/node/server.ts')
startServer()
