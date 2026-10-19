import { cpSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, expect, it } from 'vitest'
import { presmium } from './helpers.ts'

const FIXTURE = fileURLToPath(new URL('./fixtures/repro', import.meta.url))
const ROOT = fileURLToPath(new URL('../../..', import.meta.url))
const WORK = join(ROOT, 'e2e/fixtures/regression/.presmium')

const copies: string[] = []
afterAll(() => copies.forEach(dir => rmSync(dir, { recursive: true, force: true })))

function checkout(): string {
  mkdirSync(WORK, { recursive: true })
  const dir = mkdtempSync(join(WORK, 'repro-'))
  copies.push(dir)
  cpSync(FIXTURE, join(dir, 'deck'), { recursive: true })
  return join(dir, 'deck')
}

async function build(deck: string, out: string): Promise<void> {
  const { code, stdout, stderr } = await presmium(deck, ['build', '--out', out])
  if (code !== 0) throw new Error(`presmium build exited with ${code}\n${stdout}${stderr}`)
}

function outputs(out: string): Map<string, Buffer> {
  const files = new Map<string, Buffer>()
  for (const file of readdirSync(out, { recursive: true, encoding: 'utf8' })) {
    if (statSync(join(out, file)).isFile()) files.set(file, readFileSync(join(out, file)))
  }
  return files
}

it('builds the same IR, web, slides and notebook bytes in two checkouts and on a rebuild, without paths of the machine', async () => {
  const [a, b] = [checkout(), checkout()]
  await Promise.all([
    build(a, join(a, 'out1')).then(() => build(a, join(a, 'out2'))),
    build(b, join(b, 'out1')),
  ])
  const first = outputs(join(a, 'out1'))
  expect(first.size).toBeGreaterThan(20)
  expect(['ir.json', 'notebook/lecture.ipynb'].filter(file => !first.has(file))).toEqual([])
  for (const other of [outputs(join(a, 'out2')), outputs(join(b, 'out1'))]) {
    expect([...other.keys()].sort()).toEqual([...first.keys()].sort())
    for (const [file, bytes] of first) expect(other.get(file)!.equals(bytes), file).toBe(true)
  }
  const local = [...first].filter(([, bytes]) => bytes.includes(ROOT) || bytes.includes(a)).map(([file]) => file)
  expect(local, `files naming ${relative(process.cwd(), ROOT) || ROOT}`).toEqual([])

  const published = JSON.parse(first.get('ir.json')!.toString()) as { meta: { entry: string }, config: { presmium: Record<string, unknown> }, sections: { source: { file: string } }[] }
  expect([published.meta.entry, published.sections.at(-1)!.source.file]).toEqual(['lecture.md', 'pages/two.md'])
  expect(published.config.presmium['fixture.repro']).toEqual({ data: 'img', site: '/tmp' })
  const ir = JSON.parse(first.get('web/ir.json')!.toString()) as { config: { presmium: Record<string, unknown> }, sections: { id: string, config?: unknown }[] }
  expect(ir.config.presmium['fixture.repro']).toEqual({ data: 'img', site: '/tmp' })
  expect(ir.sections.find(section => section.id === 'first')!.config).toEqual({ 'fixture.repro': { data: 'pages' } })
  const slides = readFileSync(join(a, '.presmium/slides/slides.md'), 'utf8')
  expect(slides).toContain('data: ../../img\n    site: /tmp\n')
  expect(slides).toContain('data: ../../pages\n')
}, 600_000)
