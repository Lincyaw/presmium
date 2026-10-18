import { build } from 'esbuild'

await build({
  entryPoints: [new URL('../src/extension.ts', import.meta.url).pathname],
  outfile: new URL('../dist/extension.cjs', import.meta.url).pathname,
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node20',
  external: ['vscode'],
  sourcemap: true,
  logLevel: 'warning',
})
