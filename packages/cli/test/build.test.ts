// `presmium build` and `presmium dev`: renderer dispatch and incremental recompilation.
import { spawn } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import { BIN, fixtures, presmium } from './helpers.ts'

const json = (file: string) => JSON.parse(readFileSync(file, 'utf8'))

it('build writes the IR, runs the deck renderers and reports what they cannot render', async () => {
  const dir = fixtures()
  const out = join(dir, 'out')
  const built = await presmium(dir, ['build', 'lecture', '--out', out])
  expect(built.code).toBe(0)
  expect(json(join(out, 'ir.json')).sections).toHaveLength(3)
  const { config, outline } = json(join(out, 'fixture/outline.json'))
  expect(config).toEqual({ flavor: 'plain' })
  // The `{only} web, notebook` block is not given to the fixture renderer.
  expect(outline['bpe-merge']).toEqual(['paragraph-1', 'list-1', 'paragraph-2', 'code-1'])
  expect(built.stdout).toContain('逐步演示#fixture-stepper-1: component node not supported by fixture')

  // A requested renderer that is not installed is an error; without any renderer only the IR is written.
  expect((await presmium(dir, ['build', 'lecture', '--to', 'slides', '--out', out])).code).toBe(1)
  const bare = await presmium(dir, ['build', 'ok'])
  expect(bare.code).toBe(0)
  expect(bare.stdout).toContain('no renderer available')
  expect(existsSync(join(dir, 'ok/dist/ir.json'))).toBe(true)
})

it('dev recompiles when a source file is saved and pushes the IR to the renderer dev servers', async () => {
  const dir = fixtures()
  const ir = join(dir, 'dev/ir.json')
  const server = join(dir, 'dev/fixture/dev.json')
  const child = spawn(process.execPath, [BIN, 'dev', 'lecture', '--out', 'dev'], { cwd: dir })
  const exited = new Promise<number | null>(resolve => child.on('exit', resolve))
  try {
    let output = ''
    child.stdout.on('data', (chunk: Buffer) => output += chunk)
    await expect.poll(() => output, { timeout: 15_000 }).toContain('watching')
    expect(output).toContain('fixture  fixture://dev')
    expect(json(ir).sections[2].title).toBe('逐步演示')

    const chapter = join(dir, 'lecture/chapter.md')
    writeFileSync(chapter, readFileSync(chapter, 'utf8').replace('## 逐步演示', '## 逐步演示（修订）'))
    await expect.poll(() => json(ir).sections[2].title, { timeout: 10_000 }).toBe('逐步演示（修订）')
    await expect.poll(() => json(server).at(-1)[2], { timeout: 10_000 }).toBe('逐步演示（修订）')
  } finally {
    child.kill('SIGTERM')
  }
  expect(await exited).toBe(0)
  expect(json(server).at(-1)).toBe('closed')
})
