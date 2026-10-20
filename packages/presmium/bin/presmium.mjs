#!/usr/bin/env node
import { existsSync, realpathSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { createJiti } from 'jiti'

const own = realpathSync(fileURLToPath(new URL('..', import.meta.url)))

function projectPresmium(from) {
  for (let dir = from; ; dir = dirname(dir)) {
    const found = join(dir, 'node_modules/presmium/bin/presmium.mjs')
    if (existsSync(found)) return found
    if (dirname(dir) === dir) return undefined
  }
}

const local = projectPresmium(process.cwd())
if (local && realpathSync(join(dirname(local), '..')) !== own) {
  await import(pathToFileURL(local).href)
} else {
  const emitWarning = process.emitWarning
  process.emitWarning = (warning, ...args) => {
    const code = typeof args[0] === 'object' ? args[0]?.code : args[1]
    if (code !== 'DEP0040') emitWarning.call(process, warning, ...args)
  }
  const { main } = await createJiti(import.meta.url).import('@lincyaw/cli')
  process.exitCode = await main(process.argv.slice(2), { bundled: own, bin: fileURLToPath(import.meta.url) })
}
