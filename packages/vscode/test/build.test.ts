// The extension runs only inside VS Code; this checks that it type-checks against the VS Code API
// and bundles into the file its manifest names, with the commands it registers contributed.
import { execFile } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { expect, it } from 'vitest'

const PKG = fileURLToPath(new URL('..', import.meta.url))
const TSC = createRequire(import.meta.url).resolve('typescript/bin/tsc')

function run(args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(process.execPath, args, { cwd: PKG }, (error, stdout, stderr) => (error ? reject(new Error(`${stdout}${stderr}`)) : resolve(stdout)))
  })
}

it('type-checks and bundles into the main file of its manifest', async () => {
  await run([TSC, '-p', 'tsconfig.json'])
  await run(['scripts/build.mjs'])
  const manifest = JSON.parse(readFileSync(`${PKG}/package.json`, 'utf8')) as { main: string, contributes: { commands: { command: string }[] } }
  const bundle = readFileSync(`${PKG}/${manifest.main}`, 'utf8')
  expect(bundle).toContain('require("vscode")')
  expect(bundle).toContain('presmium/section')
  const registered = [...readFileSync(`${PKG}/src/extension.ts`, 'utf8').matchAll(/registerCommand\('([\w.]+)'/g)].map(m => m[1])
  expect(registered.length).toBeGreaterThan(0)
  expect(manifest.contributes.commands.map(c => c.command)).toEqual(registered)
}, 120_000)
