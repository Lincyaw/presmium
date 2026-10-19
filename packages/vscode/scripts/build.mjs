import { build } from 'esbuild'
import { fileURLToPath } from 'node:url'

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
