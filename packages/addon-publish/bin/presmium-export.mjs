#!/usr/bin/env node
import { createJiti } from 'jiti'

const emitWarning = process.emitWarning
process.emitWarning = (warning, ...args) => {
  const code = typeof args[0] === 'object' ? args[0]?.code : args[1]
  if (code !== 'DEP0040') emitWarning.call(process, warning, ...args)
}

const jiti = createJiti(import.meta.url)
const { exportMain } = await jiti.import('../src/node/cli.ts')
process.exitCode = await exportMain(process.argv.slice(2))
