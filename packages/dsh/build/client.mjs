#!/usr/bin/env node
// Builds the client part of @presmium/dsh (docs/design-dsh.md 7.8): src/client/index.tsx with the workbench's panels
// (@presmium/workbench), CodeMirror and the design system, bundled by esbuild into build/dist/client.js in the factory
// form DeepSeek Harness's module system loads, `window.__ModuleLoader__.load({ id, factory })`, where `factory(require)`
// returns the module's exports and `require` answers the shell's module table (React 18, Cordis, zod, the client store,
// slots, primitives and dock kit): those are the bundle's externals. The styles, the fonts inlined as data URLs (the
// module system serves a plugin's scripts only), are one string the module puts into the page. Run by `prepack` for
// the published package, and by build/ensure.mjs when a checkout's sources are newer than the bundle.
//
//   node build/client.mjs
import { renameSync, mkdirSync, writeFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { SHELL_MODULES } from '../src/client/contract.ts'

const PACKAGE = fileURLToPath(new URL('..', import.meta.url))
export const OUT = join(PACKAGE, 'build', 'dist')
export const BUNDLE = join(OUT, 'client.js')
/** The inputs of the last build, for build/ensure.mjs. */
export const META = join(OUT, 'client.json')
const ID = '@presmium/dsh'

/** Fontsource's stylesheets name a WOFF2 file and a WOFF fallback: every browser the workbench supports takes the first. */
const noWoffFallback = {
  name: 'presmium-no-woff-fallback',
  setup(build) {
    build.onLoad({ filter: /\.woff$/ }, () => ({ contents: '', loader: 'dataurl' }))
  },
}

/** Writes `text` to `file` whole: another process starting DeepSeek Harness meanwhile reads the old file or the new one. */
function writeWhole(file, text) {
  const temporary = `${file}.${process.pid}.${Date.now()}.tmp`
  writeFileSync(temporary, text)
  renameSync(temporary, file)
}

export async function buildClient() {
  const { build } = await import('esbuild')
  const css = await build({
    entryPoints: [join(PACKAGE, 'src/client/styles.css')],
    bundle: true,
    write: false,
    minify: true,
    metafile: true,
    absWorkingDir: PACKAGE,
    loader: { '.woff2': 'dataurl' },
    plugins: [noWoffFallback],
    logLevel: 'warning',
  })
  const js = await build({
    entryPoints: [join(PACKAGE, 'src/client/index.tsx')],
    absWorkingDir: PACKAGE,
    bundle: true,
    write: false,
    format: 'cjs',
    platform: 'browser',
    target: 'es2022',
    jsx: 'automatic',
    minify: true,
    legalComments: 'none',
    metafile: true,
    external: [...SHELL_MODULES],
    define: { '__PRESMIUM_CSS__': JSON.stringify(css.outputFiles[0].text), 'process.env.NODE_ENV': '"production"' },
    logLevel: 'warning',
  })
  const body = js.outputFiles[0].text
  mkdirSync(OUT, { recursive: true })
  writeWhole(BUNDLE, `window.__ModuleLoader__.load({\n\tid: ${JSON.stringify(ID)},\n\tfactory: (require) => {\n\t\tvar module = { exports: {} };\n\t\tvar exports = module.exports;\n${body}\n\t\treturn module.exports;\n\t}\n});\n`)
  // Presmium's own sources (relative to the package); what is installed under node_modules does not change.
  const inputs = [...new Set([...Object.keys(js.metafile.inputs), ...Object.keys(css.metafile.inputs)])].filter(input => !input.includes('node_modules'))
  writeWhole(META, `${JSON.stringify({ inputs }, null, 2)}\n`)
  return BUNDLE
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  // On stderr: `pnpm pack --json` (the consumer install) reads stdout as JSON, and runs this as `prepack`.
  const file = await buildClient()
  process.stderr.write(`built ${relative(process.cwd(), file)}\n`)
}
