// Operator plugins (D14, docs/architecture.md 4.2): a plugin the workspace configuration lists in
// `settings.presmium.workspace.plugins` and that declares `operator: true` is loaded for every deck,
// whose `plugins` need not name it: its pass runs and its Node service, made with the operator's
// settings, is there. A listed plugin that is no operator plugin, and an unlisted one, are not loaded.
import { cpSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { IRDocument } from '@presmium/kernel'
import { afterAll, expect, it } from 'vitest'
import { presmium } from './helpers.ts'

const FIXTURE = fileURLToPath(new URL('./fixtures/operator', import.meta.url))
const dirs: string[] = []
afterAll(() => dirs.forEach(dir => rmSync(dir, { recursive: true, force: true })))

/** A copy of the workspace (no git: the deck directory is its root), the plugins installed at its root. */
function workspace(): string {
  const dir = mkdtempSync(join(tmpdir(), 'presmium-operator-'))
  dirs.push(dir)
  cpSync(FIXTURE, dir, { recursive: true })
  mkdirSync(join(dir, 'node_modules'))
  for (const name of ['presmium-fixture-operator', 'presmium-fixture-listed']) renameSync(join(dir, 'plugins', name), join(dir, 'node_modules', name))
  return dir
}

const ir = (dir: string) => JSON.parse(readFileSync(join(dir, 'out/ir.json'), 'utf8')) as IRDocument

it('loads the operator plugins the workspace lists for a deck that does not name them', async () => {
  const dir = workspace()
  const built = await presmium(dir, ['build', '--out', 'out'])
  expect(built.code, built.stdout + built.stderr).toBe(0)
  const { meta, config } = ir(dir)
  // Its pass ran, with its Node service made from the operator's settings.
  expect(meta.operatorStamp).toBe('运营者的设置')
  // A listed plugin that is no operator plugin is not loaded; the deck's plugins stay its own.
  expect(meta.listed).toBeUndefined()
  expect(config.plugins).toEqual([])
})

it('loads no operator plugin the workspace does not list', async () => {
  const dir = workspace()
  rmSync(join(dir, 'presmium.workspace.yaml'))
  const built = await presmium(dir, ['build', '--out', 'out'])
  expect(built.code, built.stdout + built.stderr).toBe(0)
  expect(ir(dir).meta.operatorStamp).toBeUndefined()
})
