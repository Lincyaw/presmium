import { cpSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { IRDocument } from '@lincyaw/kernel'
import { afterAll, expect, it } from 'vitest'
import { presmium } from './helpers.ts'

const FIXTURE = fileURLToPath(new URL('./fixtures/operator', import.meta.url))
const dirs: string[] = []
afterAll(() => dirs.forEach(dir => rmSync(dir, { recursive: true, force: true })))

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
  expect(meta.operatorStamp).toBe('运营者的设置')
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

it('loads a plugin the headmatter lists under its old name, and says its current name', async () => {
  // Below the regression deck, whose node_modules has the official plugins.
  const work = fileURLToPath(new URL('../../../e2e/fixtures/regression/.presmium', import.meta.url))
  mkdirSync(work, { recursive: true })
  const dir = mkdtempSync(join(work, 'renamed-'))
  dirs.push(dir)
  writeFileSync(join(dir, 'lecture.md'), "---\ntitle: Renamed\nplugins:\n  - '@lincyaw/slidev-addon-core'\n---\n\n# Renamed\n\nText.\n")
  const checked = await presmium(dir, ['check', '--json'])
  expect(checked.code, checked.stdout + checked.stderr).toBe(0)
  const { findings } = JSON.parse(checked.stdout) as { findings: { severity: string, message: string, source?: { line: number } }[] }
  expect(findings).toEqual([expect.objectContaining({ severity: 'info', message: 'plugin "@lincyaw/slidev-addon-core" is now named "@lincyaw/addon-core"; the old name still works', source: expect.objectContaining({ line: 4 }) })])
  const built = await presmium(dir, ['build', '--to', 'notebook', '--out', 'out'])
  expect(built.code, built.stdout + built.stderr).toBe(0)
  expect(ir(dir).config.plugins).toEqual(['@lincyaw/addon-core'])
})
