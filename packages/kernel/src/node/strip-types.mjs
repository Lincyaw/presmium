// Loads TypeScript installed under node_modules (P-141). Presmium's packages publish their sources as
// TypeScript, whose types Node strips itself except under node_modules. The renderers' frameworks run in
// processes of their own (VitePress, Slidev) and import Presmium's packages natively when they load a
// configuration that names them, as in a project that installs Presmium from npm; the renderers start
// them with `--import` of this file (`TYPESCRIPT_IMPORT` of @presmium/kernel/node), which has Node strip
// the types there too. The sources use only erasable syntax (tsconfig.base.json: erasableSyntaxOnly).
import { readFileSync } from 'node:fs'
import { registerHooks, stripTypeScriptTypes } from 'node:module'
import { fileURLToPath } from 'node:url'

// Node notes once that stripTypeScriptTypes is experimental; the frameworks' output stays as it was.
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
