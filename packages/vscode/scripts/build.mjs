import { build } from 'esbuild'
import { fileURLToPath } from 'node:url'
import { mkdir, writeFile } from 'node:fs/promises'

await build({
  entryPoints: [fileURLToPath(new URL('../src/extension.ts', import.meta.url))],
  outfile: fileURLToPath(new URL('../dist/extension.cjs', import.meta.url)),
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node20',
  external: ['vscode'],
  sourcemap: true,
  logLevel: 'warning',
})

// Serialize the public kernel schema at build time; there is no separately maintained IDE schema.
const schema = await build({
  stdin: { contents: "export { DOCUMENT_JSON_SCHEMA } from '@lincyaw/kernel'", resolveDir: fileURLToPath(new URL('..', import.meta.url)) },
  bundle: true, platform: 'node', format: 'esm', target: 'node20', write: false, logLevel: 'warning',
})
const { DOCUMENT_JSON_SCHEMA } = await import(`data:text/javascript,${encodeURIComponent(schema.outputFiles[0].text)}`)
await mkdir(new URL('../dist/', import.meta.url), { recursive: true })
await writeFile(new URL('../dist/lecture.schema.json', import.meta.url), JSON.stringify(DOCUMENT_JSON_SCHEMA, null, 2) + '\n')
