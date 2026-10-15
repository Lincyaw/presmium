// Bundles the extension into dist/extension.cjs. VS Code loads extensions as JavaScript, so
// this package, unlike the others, is built; the language server it starts stays TypeScript.
import { build } from 'esbuild'

await build({
  entryPoints: [new URL('../src/extension.ts', import.meta.url).pathname],
  outfile: new URL('../dist/extension.cjs', import.meta.url).pathname,
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node20',
  // Provided by VS Code at run time.
  external: ['vscode'],
  sourcemap: true,
  logLevel: 'warning',
})
