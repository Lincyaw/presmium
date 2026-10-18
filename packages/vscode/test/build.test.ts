import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { expect, it } from 'vitest'

const PKG = fileURLToPath(new URL('..', import.meta.url))
const TSC = createRequire(import.meta.url).resolve('typescript/bin/tsc')

function run(args: string[]): string {
  const { status, stdout, stderr } = spawnSync(process.execPath, args, { cwd: PKG, encoding: 'utf8' })
  if (status !== 0) throw new Error(`${stdout}${stderr}`)
  return stdout
}

it('type-checks and bundles into the main file of its manifest', () => {
  run([TSC, '-p', 'tsconfig.json'])
  run(['scripts/build.mjs'])
  const manifest = JSON.parse(readFileSync(`${PKG}/package.json`, 'utf8')) as { main: string, contributes: { commands: { command: string }[] } }
  const bundle = readFileSync(`${PKG}/${manifest.main}`, 'utf8')
  expect(bundle).toContain('require("vscode")')
  expect(bundle).toContain('presmium/section')
  const registered = [...readFileSync(`${PKG}/src/extension.ts`, 'utf8').matchAll(/registerCommand\('([\w.]+)'/g)].map(m => m[1])
  expect(registered.length).toBeGreaterThan(0)
  expect(manifest.contributes.commands.map(c => c.command)).toEqual(registered)
}, 120_000)
