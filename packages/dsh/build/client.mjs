#!/usr/bin/env node
import { chmodSync, renameSync, mkdirSync, writeFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { SHELL_MODULES } from '../src/client/contract.ts'

const PACKAGE = fileURLToPath(new URL('..', import.meta.url))
export const OUT = join(PACKAGE, 'build', 'dist')
export const BUNDLE = join(OUT, 'client.js')
export const META = join(OUT, 'client.json')
const ID = '@lincyaw/dsh'

const noWoffFallback = {
  name: 'presmium-no-woff-fallback',
  setup(build) {
    build.onLoad({ filter: /\.woff$/ }, () => ({ contents: '', loader: 'dataurl' }))
  },
}

function writeWhole(file, text) {
  const temporary = `${file}.${process.pid}.${Date.now()}.tmp`
  writeFileSync(temporary, text)
  // Build outputs are public client assets shared by local source-checkout users.
  // A private launcher umask must not make the bundle or its input manifest unreadable.
  chmodSync(temporary, 0o644)
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
    conditions: ['style'],
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
    // the mascot's sprite sheets travel inside the single client file
    loader: { '.png': 'dataurl' },
    define: { '__PRESMIUM_CSS__': JSON.stringify(css.outputFiles[0].text), 'process.env.NODE_ENV': '"production"' },
    logLevel: 'warning',
  })
  const body = js.outputFiles[0].text
  mkdirSync(OUT, { recursive: true })
  writeWhole(BUNDLE, `window.__ModuleLoader__.load({\n\tid: ${JSON.stringify(ID)},\n\tfactory: (require) => {\n\t\tvar module = { exports: {} };\n\t\tvar exports = module.exports;\n${body}\n\t\treturn module.exports;\n\t}\n});\n`)
  const inputs = [...new Set([...Object.keys(js.metafile.inputs), ...Object.keys(css.metafile.inputs)])].filter(input => !input.includes('node_modules'))
  writeWhole(META, `${JSON.stringify({ inputs }, null, 2)}\n`)
  return BUNDLE
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const file = await buildClient()
  process.stderr.write(`built ${relative(process.cwd(), file)}\n`)
}
