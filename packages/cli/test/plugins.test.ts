import { cpSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync } from 'node:fs'
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
