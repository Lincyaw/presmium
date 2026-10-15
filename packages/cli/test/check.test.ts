// Runs the real `presmium` CLI process on the decks in ./fixtures.
import { execFile } from 'node:child_process'
import { cpSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, expect, it } from 'vitest'

const BIN = fileURLToPath(new URL('../bin/presmium.mjs', import.meta.url))
const FIXTURES = fileURLToPath(new URL('./fixtures', import.meta.url))

// Each test works on a copy outside git, so the workspace root is the deck directory
// and lock files are never written into the repository.
const copies: string[] = []
afterAll(() => copies.forEach(dir => rmSync(dir, { recursive: true, force: true })))

function fixtures(): string {
  const dir = mkdtempSync(join(tmpdir(), 'presmium-cli-'))
  cpSync(FIXTURES, dir, { recursive: true })
  copies.push(dir)
  return dir
}

function presmium(cwd: string, ...args: string[]): Promise<{ code: number, stdout: string, stderr: string }> {
  return new Promise((resolve) => {
    execFile(process.execPath, [BIN, ...args], { cwd }, (error, stdout, stderr) => {
      resolve({ code: error ? Number(error.code) : 0, stdout, stderr })
    })
  })
}

it('exits 0 without errors, 1 with error findings and 2 on bad arguments', async () => {
  const dir = fixtures()
  expect((await presmium(dir, 'check', 'ok')).code).toBe(0)
  expect((await presmium(dir, 'check', 'broken')).code).toBe(1)
  expect((await presmium(dir, 'check', 'ok', '--bogus')).code).toBe(2)
  expect((await presmium(dir, 'check', 'no-such-deck')).code).toBe(2)
})

it('locates findings as file:line in text output and prints parseable JSON', async () => {
  const dir = fixtures()
  const text = await presmium(dir, 'check', 'broken')
  expect(text.stdout).toContain('broken/pages/todo.md:4  error  slide 3 is unfinished')
  // A crashing check is located at the entry file, on the headmatter line of its addon.
  expect(text.stdout).toContain('broken/slides.md:4  error  check sample.crash crashed: boom')

  const json = JSON.parse((await presmium(dir, 'check', 'broken', '--json')).stdout)
  expect(json.counts).toEqual({ error: 4, warning: 0, info: 0 })
  expect(json.findings.every((f: { source?: { file: string, line: number } }) => f.source?.file && f.source.line >= 1)).toBe(true)
})

it('--update-lock writes the anchor lock and a second run is stable', async () => {
  const dir = fixtures()
  const lockFile = join(dir, 'ok/.presmium/anchors.lock.json')
  expect((await presmium(dir, 'check', 'ok')).stdout).toContain('anchor line:src/math.py#def add is not locked')

  const first = await presmium(dir, 'check', 'ok', '--update-lock')
  expect(first.code).toBe(0)
  expect(first.stdout).toContain('anchors.lock.json updated (2 anchors)')
  const lock = readFileSync(lockFile, 'utf8')
  expect(JSON.parse(lock).anchors['line:src/math.py#def mul']).toEqual({ fingerprint: 'def mul(a, b):', file: 'src/math.py', startLine: 5 })

  const second = await presmium(dir, 'check', 'ok', '--update-lock')
  expect(second.stdout).toBe('ok/.presmium/anchors.lock.json unchanged (2 anchors)\nno problems\n')
  expect(readFileSync(lockFile, 'utf8')).toBe(lock)
})

it('reports an error for a headmatter addon that cannot be loaded', async () => {
  const dir = fixtures()
  const { findings } = JSON.parse((await presmium(dir, 'check', 'broken', '--json')).stdout)
  const addonErrors = findings.filter((f: { checkId: string }) => f.checkId === 'presmium.addons')
  expect(addonErrors).toMatchObject([
    { severity: 'error', message: expect.stringContaining('presmium-fixture-addon-not-installed'), source: { line: 5 } },
    { severity: 'error', message: expect.stringContaining('fixture addon fails to load'), source: { line: 6 } },
  ])
})
