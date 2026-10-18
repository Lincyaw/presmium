import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import { fixtures, presmium } from './helpers.ts'

const check = (cwd: string, ...args: string[]) => presmium(cwd, ['check', ...args])

it('exits 0 without errors, 1 with error findings and 2 on bad arguments', async () => {
  const dir = fixtures()
  expect((await check(dir, 'ok')).code).toBe(0)
  expect((await check(dir, 'broken')).code).toBe(1)
  expect((await check(dir, 'ok', '--bogus')).code).toBe(2)
  expect((await check(dir, 'no-such-deck')).code).toBe(2)
})

it('locates findings as file:line in text output and prints parseable JSON', async () => {
  const dir = fixtures()
  const text = await check(dir, 'broken')
  expect(text.stdout).toContain('broken/pages/todo.md:7  error  section 3 is unfinished')
  expect(text.stdout).toContain('broken/lecture.md:4  error  check sample.crash crashed: boom')

  const json = JSON.parse((await check(dir, 'broken', '--json')).stdout)
  expect(json.counts).toEqual({ error: 4, warning: 0, info: 0 })
  expect(json.findings.every((f: { source?: { file: string, line: number } }) => f.source?.file && f.source.line >= 1)).toBe(true)
})

it('--update-lock writes the anchor lock and a second run is stable', async () => {
  const dir = fixtures()
  const lockFile = join(dir, 'ok/.presmium/anchors.lock.json')
  expect((await check(dir, 'ok')).stdout).toContain('ok/pages/intro.md:3  warning  anchor line:src/math.py#def add is not locked')

  const first = await check(dir, 'ok', '--update-lock')
  expect(first.code).toBe(0)
  expect(first.stdout).toContain('anchors.lock.json updated (2 anchors)')
  const lock = readFileSync(lockFile, 'utf8')
  expect(JSON.parse(lock).anchors['line:src/math.py#def mul']).toEqual({ fingerprint: 'def mul(a, b):', file: 'src/math.py', startLine: 5 })

  const second = await check(dir, 'ok', '--update-lock')
  expect(second.stdout).toBe('ok/.presmium/anchors.lock.json unchanged (2 anchors)\nno problems\n')
  expect(readFileSync(lockFile, 'utf8')).toBe(lock)
})

it('reports an error for a frontmatter plugin that cannot be loaded', async () => {
  const dir = fixtures()
  const { findings } = JSON.parse((await check(dir, 'broken', '--json')).stdout)
  const pluginErrors = findings.filter((f: { checkId: string }) => f.checkId === 'presmium.plugins')
  expect(pluginErrors).toMatchObject([
    { severity: 'error', message: expect.stringContaining('presmium-fixture-addon-not-installed'), source: { line: 5 } },
    { severity: 'error', message: expect.stringContaining('fixture addon fails to load'), source: { line: 6 } },
  ])
})
