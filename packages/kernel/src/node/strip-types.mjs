import { readFileSync } from 'node:fs'
import { registerHooks, stripTypeScriptTypes } from 'node:module'
import { fileURLToPath } from 'node:url'

const emitWarning = process.emitWarning
process.emitWarning = (warning, ...args) => {
  if (!String(warning).includes('stripTypeScriptTypes')) emitWarning.call(process, warning, ...args)
}

registerHooks({
  load(url, context, nextLoad) {
    if (!url.startsWith('file:') || !/\.m?ts$/.test(url) || !url.includes('/node_modules/')) return nextLoad(url, context)
    return { format: 'module', source: stripTypeScriptTypes(readFileSync(fileURLToPath(url), 'utf8')), shortCircuit: true }
  },
})
