#!/usr/bin/env node
import { realpathSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { createJiti } from 'jiti'

const own = realpathSync(fileURLToPath(new URL('..', import.meta.url)))

const emitWarning = process.emitWarning
process.emitWarning = (warning, ...args) => {
  const code = typeof args[0] === 'object' ? args[0]?.code : args[1]
  if (code !== 'DEP0040') emitWarning.call(process, warning, ...args)
}
const { main } = await createJiti(import.meta.url).import('@lincyaw/cli')
process.exitCode = await main(process.argv.slice(2), { bundled: own, bin: fileURLToPath(import.meta.url) })
