// `presmium build` of fixtures/repro (web and slides) is reproducible (Principle 5): the same bytes
// from two checkouts of the deck and from a rebuild, with no path of the machine in them. The copies
// lie in the demo, whose node_modules hold the renderers and plugins, at the same depth, as two
// clones of the repository would.
import { execFile } from 'node:child_process'
import { cpSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, expect, it } from 'vitest'
import { BIN } from './helpers.ts'

const FIXTURE = fileURLToPath(new URL('./fixtures/repro', import.meta.url))
const ROOT = fileURLToPath(new URL('../../..', import.meta.url))
const WORK = join(ROOT, 'examples/demo/.presmium')

const copies: string[] = []
afterAll(() => copies.forEach(dir => rmSync(dir, { recursive: true, force: true })))

function checkout(): string {
  mkdirSync(WORK, { recursive: true })
  const dir = mkdtempSync(join(WORK, 'repro-'))
  copies.push(dir)
  cpSync(FIXTURE, join(dir, 'deck'), { recursive: true })
  return join(dir, 'deck')
}

/** `presmium build` as an author runs it: Vitest's NODE_ENV=test would make Vue builds name their source files. */
function build(deck: string, out: string): Promise<void> {
  const { NODE_ENV: _test, ...env } = process.env
  return new Promise((resolve, reject) => {
    execFile(process.execPath, [BIN, 'build', '--out', out], { cwd: deck, env, maxBuffer: 16 << 20 }, (error, stdout, stderr) => {
      if (error) reject(new Error(`presmium build exited with ${error.code}\n${stdout}${stderr}`))
      else resolve()
    })
  })
}

/** Every file of the web and slides outputs, by path. */
function outputs(out: string): Map<string, Buffer> {
  const files = new Map<string, Buffer>()
  for (const form of ['web', 'slides']) {
    const dir = join(out, form)
    for (const file of readdirSync(dir, { recursive: true, encoding: 'utf8' })) {
      if (statSync(join(dir, file)).isFile()) files.set(`${form}/${file}`, readFileSync(join(dir, file)))
    }
  }
  return files
}

it('builds the same web and slides bytes in two checkouts and on a rebuild, without paths of the machine', async () => {
  const [a, b] = [checkout(), checkout()]
  await Promise.all([
    build(a, join(a, 'out1')).then(() => build(a, join(a, 'out2'))),
    build(b, join(b, 'out1')),
  ])
  const first = outputs(join(a, 'out1'))
  expect(first.size).toBeGreaterThan(20)
  for (const other of [outputs(join(a, 'out2')), outputs(join(b, 'out1'))]) {
    expect([...other.keys()].sort()).toEqual([...first.keys()].sort())
    for (const [file, bytes] of first) expect(other.get(file)!.equals(bytes), file).toBe(true)
  }
  const local = [...first].filter(([, bytes]) => bytes.includes(ROOT) || bytes.includes(a)).map(([file]) => file)
  expect(local, `files naming ${relative(process.cwd(), ROOT) || ROOT}`).toEqual([])
}, 600_000)
