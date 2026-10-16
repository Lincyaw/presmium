// `presmium build` and `presmium dev`: renderer dispatch, incremental recompilation and what dev watches.
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { setTimeout as sleep } from 'node:timers/promises'
import { expect, it } from 'vitest'
import { BIN, fixtures, presmium, run } from './helpers.ts'

const json = (file: string) => JSON.parse(readFileSync(file, 'utf8'))

/** `presmium dev` on `deck`, writing to `<deck>/dev`; its output so far, and stopping it. */
function startDev(deck: string) {
  const child = spawn(process.execPath, [BIN, 'dev', '.', '--out', 'dev'], { cwd: deck })
  const exited = new Promise<number | null>(resolve => child.on('exit', resolve))
  let output = ''
  child.stdout.on('data', (chunk: Buffer) => output += chunk)
  return {
    output: () => output,
    ir: () => json(join(deck, 'dev/ir.json')),
    stop: () => {
      child.kill('SIGTERM')
      return exited
    },
  }
}

it('build writes the IR, runs the deck renderers and reports what they cannot render', async () => {
  const dir = fixtures()
  const out = join(dir, 'out')
  const built = await presmium(dir, ['build', 'lecture', '--out', out])
  expect(built.code).toBe(0)
  expect(json(join(out, 'ir.json')).sections).toHaveLength(3)
  const { config, outline, vite } = json(join(out, 'fixture/outline.json'))
  expect(config).toEqual({ flavor: 'plain' })
  // The plugins' Vite plugins, made with their configuration, are in the renderer's context (C-8).
  expect(vite).toEqual(['fixture-vite-checked'])
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
    await expect.poll(() => output, { timeout: 15_000 }).toContain('watching;')
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

it('dev recompiles when code that a pass read changes, when a commit moves the revision it read, and when a declared file changes (K-09)', async () => {
  const deck = join(fixtures(), 'watch')
  const git = async (...args: string[]) => {
    const result = await run('git', ['-c', 'user.name=test', '-c', 'user.email=test@example.com', '-c', 'commit.gpgsign=false', ...args], { cwd: deck })
    expect(result.code, `git ${args.join(' ')}: ${result.stderr}`).toBe(0)
  }
  await git('init', '-q')
  await git('add', '.')
  await git('commit', '-qm', 'first')
  const ir = () => json(join(deck, 'dev/ir.json'))
  // The sample plugin's pass quotes the anchored line from the working tree and from HEAD.
  const quote = () => ir().sections[0].blocks[0].node.props
  const child = spawn(process.execPath, [BIN, 'dev', '.', '--out', 'dev'], { cwd: deck })
  const exited = new Promise<number | null>(resolve => child.on('exit', resolve))
  try {
    let output = ''
    child.stdout.on('data', (chunk: Buffer) => output += chunk)
    await expect.poll(() => output, { timeout: 15_000 }).toContain('watching;')
    expect(quote()).toMatchObject({ text: 'def greet(name):  # first', committed: 'def greet(name):  # first' })

    const code = join(deck, 'greet.py')
    writeFileSync(code, readFileSync(code, 'utf8').replace('# first', '# second'))
    await expect.poll(quote, { timeout: 10_000 }).toMatchObject({ text: 'def greet(name):  # second', committed: 'def greet(name):  # first' })

    await git('commit', '-qam', 'second')
    await expect.poll(quote, { timeout: 10_000 }).toMatchObject({ committed: 'def greet(name):  # second' })

    // The {motto} directive and the pass read these files themselves and declare them with ctx.watch.
    writeFileSync(join(deck, 'motto.txt'), '再读再写\n')
    writeFileSync(join(deck, 'banner.txt'), '第二版\n')
    await expect.poll(() => [ir().sections[0].blocks[2].node.props.text, ir().meta.banner], { timeout: 10_000 }).toEqual(['再读再写', '第二版'])
  } finally {
    child.kill('SIGTERM')
  }
  expect(await exited).toBe(0)
})

it('dev compiles at most once more after the compilation under way, however often the source is saved meanwhile (R-05)', async () => {
  const deck = join(fixtures(), 'slow')
  mkdirSync(deck)
  // The fixture's pass takes a second; the saves come every 150 ms.
  const text = (n: number) => `---\ntitle: Slow\nplugins:\n  - ../addons/slow\n---\n\n## Saved\n\nsave ${n}\n`
  writeFileSync(join(deck, 'lecture.md'), text(0))
  const dev = startDev(deck)
  const compiled = () => dev.output().split('\n').filter(line => line.startsWith('compiled ')).length
  const saved = () => JSON.stringify(dev.ir().sections[0].blocks)
  try {
    await expect.poll(dev.output, { timeout: 15_000 }).toContain('watching;')
    for (let n = 1; n <= 10; n++) {
      writeFileSync(join(deck, 'lecture.md'), text(n))
      await sleep(150)
    }
    await expect.poll(saved, { timeout: 15_000 }).toContain('save 10')
    await sleep(2500)
    expect(saved()).toContain('save 10')
    // The first compilation, then at most three: one under way when the saves start, one after it, one for the last.
    expect(compiled() - 1).toBeLessThanOrEqual(3)
  } finally {
    await dev.stop()
  }
}, 60_000)

it('dev compiles an included file once it is created in a directory that did not exist, and says when the plugins change (R-34, R-35)', async () => {
  const deck = join(fixtures(), 'grow')
  mkdirSync(deck)
  const entry = join(deck, 'lecture.md')
  writeFileSync(entry, '---\ntitle: Grow\nplugins:\n  - ../addons/render\nrenderers:\n  fixture: {}\n---\n\n## First\n\n```{include} pages/new.md\n```\n')
  const dev = startDev(deck)
  try {
    await expect.poll(dev.output, { timeout: 15_000 }).toContain('watching;')
    expect(dev.output()).toContain('{include} pages/new.md: file not found')
    mkdirSync(join(deck, 'pages'))
    writeFileSync(join(deck, 'pages/new.md'), '## New\n\nWritten after dev started.\n')
    await expect.poll(() => dev.ir().sections.map((s: { id: string }) => s.id), { timeout: 10_000 }).toEqual(['first', 'new'])

    // The fixture renderer's dev server keeps the plugins it started with.
    writeFileSync(entry, readFileSync(entry, 'utf8').replace('  - ../addons/render\n', '  - ../addons/render\n  - ../addons/echo\n'))
    await expect.poll(dev.output, { timeout: 10_000 }).toContain('the plugins or renderers in the headmatter changed; restart presmium dev')
  } finally {
    expect(await dev.stop()).toBe(0)
  }
}, 60_000)
