// `presmium ir` on fixtures/lecture: the compiler passes of docs/ir.md sections 2 and 4.
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { delimiter, join } from 'node:path'
import type { IRBlock, IRDocument, MdastNode } from '@presmium/kernel'
import { expect, it } from 'vitest'
import { fixtures, presmium } from './helpers.ts'

const step = (b: IRBlock) => `${b.id} ${b.role} ${b.at}${b.span ? `+${b.span}` : ''}${b.only ? ` only ${b.only.join()}` : ''}`

it('splits sections and assigns ids, roles and steps as in docs/ir.md section 2', async () => {
  const dir = fixtures()
  const { code, stdout } = await presmium(dir, ['ir', 'lecture'])
  expect(code).toBe(0)
  const doc = JSON.parse(stdout) as IRDocument
  expect(doc.diagnostics).toEqual([])
  expect(doc.sections.map(s => ({ id: s.id, depth: s.depth, steps: s.steps, blocks: s.blocks.map(step) }))).toEqual([
    // The cover: content before the first `##`, titled by the `#` heading.
    { id: 'bpe-分词', depth: 0, steps: 0, blocks: ['paragraph-1 visual 0', 'paragraph-2 narration 0'] },
    // The id comes from the label; list items reveal one per step; narration binds to the step at which
    // the stepwise block before it appears; visual content without :reveal: shows from step 0.
    { id: 'bpe-merge', depth: 2, steps: 1, blocks: [
      'paragraph-1 narration 0',
      'list-1 visual 0+1',
      'paragraph-2 narration 0',
      'code-1 visual 0',
      'paragraph-3 narration 0 only web,notebook',
    ] },
    // A component spans its steps; a revealed {slide} appears whole at the next step; so does a revealed block.
    // One narration paragraph per internal step of the spanning block (ir.md 2.4).
    { id: '逐步演示', depth: 2, steps: 3, blocks: [
      'fixture-stepper-1 visual 0+1',
      'paragraph-1 narration 0',
      'paragraph-2 narration 1',
      'paragraph-3 visual 2',
      'list-1 visual 2',
      'paragraph-4 narration 2',
      'code-1 visual 3',
      'paragraph-5 narration 3',
    ] },
  ])

  const [cover, merge, demo] = doc.sections
  expect(doc.meta.stamp).toBe('checked') // a plugin pass ran with its configuration
  expect(cover!.title).toBe('BPE 分词')
  expect(merge!.source).toMatchObject({ file: join(dir, 'lecture/chapter.md'), line: 2 })
  expect(merge!.hints).toEqual({ slides: { layout: 'two-cols' } })
  expect(merge!.blocks[1]!.node).toMatchObject({ type: 'markdown', reveal: 'items', mdast: { type: 'root', children: [{ type: 'list' }] } })
  expect(demo!.blocks[0]!.node).toEqual({ type: 'component', plugin: 'fixture.render', name: 'FixtureStepper', props: { labels: ['统计', '合并'] } })

  // Compiling the same source again yields the same IR.
  expect((await presmium(dir, ['ir', 'lecture'])).stdout).toBe(stdout)
})

it('keeps a footnote definition in the section and {slide} it is written in; :emphasize-lines: highlights code', async () => {
  const dir = fixtures()
  const { code, stdout } = await presmium(dir, ['ir', 'notes'])
  expect(code).toBe(0)
  const doc = JSON.parse(stdout) as IRDocument
  // MyST moves definitions to the end of the file, which is the second section.
  expect(doc.sections.map(s => s.blocks.map(step))).toEqual([
    ['paragraph-1 narration 0', 'footnoteDefinition-1 narration 0', 'list-1 visual 0', 'footnoteDefinition-2 visual 0', 'code-1 visual 0'],
    ['paragraph-1 narration 0'],
  ])
  const [prose, slide] = doc.sections[0]!.blocks.filter(b => b.id.startsWith('footnoteDefinition'))
  expect(prose!.source.line).toBe(9)
  expect(slide!.node).toMatchObject({ mdast: { children: [{ type: 'footnoteDefinition', identifier: 'slide' }] } })
  expect(doc.sections[0]!.blocks.at(-1)!.node).toMatchObject({ type: 'code', lang: 'python', title: '求和', highlight: [[2, 3]] })
})

it('executes code once, answers from the cache after, and reruns only changed code', async () => {
  const dir = fixtures()
  const log = join(dir, 'runs.log')
  const runs = () => existsSync(log) ? readFileSync(log, 'utf8').trim().split('\n') : []
  const edit = (file: string, from: string, to: string) => writeFileSync(join(dir, file), readFileSync(join(dir, file), 'utf8').replace(from, to))
  const outputs = async () => {
    const { code, stdout } = await presmium(dir, ['ir', 'lecture'], { PRESMIUM_FIXTURE_RUNS: log })
    expect(code).toBe(0)
    const doc = JSON.parse(stdout) as IRDocument
    return doc.sections.flatMap(s => s.blocks).flatMap(b => b.node.type === 'code' ? [b.node.outputs?.[0]?.stdout] : [])
  }

  expect(await outputs()).toEqual(['COUNT PAIRS\n', 'MERGE PAIR\n'])
  expect(runs()).toEqual(['count pairs', 'merge pair'])
  expect(existsSync(join(dir, 'lecture/.presmium/freeze'))).toBe(true)

  await outputs()
  expect(runs()).toEqual(['count pairs', 'merge pair'])

  edit('lecture/chapter.md', 'merge pair\n', 'merge pairs\n')
  expect(await outputs()).toEqual(['COUNT PAIRS\n', 'MERGE PAIRS\n'])
  expect(runs()).toEqual(['count pairs', 'merge pair', 'merge pairs'])

  // `build` drops the recording of the code that changed.
  const freeze = join(dir, 'lecture/.presmium/freeze')
  const recorded = () => readdirSync(freeze).map(f => JSON.parse(readFileSync(join(freeze, f), 'utf8')).code).sort()
  expect(recorded()).toEqual(['count pairs', 'merge pair', 'merge pairs'])
  expect((await presmium(dir, ['build', 'lecture', '--out', join(dir, 'out')], { PRESMIUM_FIXTURE_RUNS: log })).code).toBe(0)
  expect(recorded()).toEqual(['count pairs', 'merge pairs'])
  expect(runs()).toHaveLength(3)

  // Without the executor installed, the committed cache still provides the same outputs.
  edit('lecture/lecture.md', '  - ../addons/echo\n', '')
  expect(await outputs()).toEqual(['COUNT PAIRS\n', 'MERGE PAIRS\n'])
  expect(runs()).toHaveLength(3)
})

it('reuses output recorded with another interpreter version and warns, unless the deck asks to run it again', async () => {
  const dir = fixtures()
  const bin = join(dir, 'bin')
  mkdirSync(bin)
  // A fake interpreter on PATH: the executor fingerprints it with `fakeinterp --version`.
  const install = (version: string) => writeFileSync(join(bin, 'fakeinterp'), [
    '#!/bin/sh',
    `if [ "$1" = --version ]; then echo "Interp ${version}"; exit 0; fi`,
    `echo "${version}: $(cat)"`,
    '',
  ].join('\n'), { mode: 0o755 })
  const freeze = join(dir, 'interp/.presmium/freeze')
  const compile = async () => {
    const { code, stdout, stderr } = await presmium(dir, ['ir', 'interp'], { PATH: `${bin}${delimiter}${process.env.PATH}` })
    expect(code).toBe(0)
    const node = (JSON.parse(stdout) as IRDocument).sections[1]!.blocks[0]!.node
    return { output: node.type === 'code' ? node.outputs?.[0]?.stdout : undefined, stderr, files: readdirSync(freeze) }
  }

  install('1.0')
  const recorded = await compile()
  expect(recorded.output).toBe('1.0: print hello\n')

  install('2.0')
  const reused = await compile()
  expect(reused.output).toBe(recorded.output)
  expect(reused.files).toEqual(recorded.files)
  expect(reused.stderr).toContain('its recorded output was made with "Interp 1.0", this build has "Interp 2.0"; the recording is reused')

  const entry = join(dir, 'interp/lecture.md')
  writeFileSync(entry, readFileSync(entry, 'utf8').replace('plugins:', 'execute: { rerun: environment }\nplugins:'))
  const rerun = await compile()
  expect(rerun.output).toBe('2.0: print hello\n')
  expect(rerun.stderr).not.toContain('recorded output')
  // The new recording replaces the old one.
  expect(rerun.files).toHaveLength(1)
  expect(rerun.files).not.toEqual(recorded.files)
})

it('gives {ref}, {eq} and {numref} without text the title or number of their target', async () => {
  const dir = fixtures()
  const { code, stdout, stderr } = await presmium(dir, ['ir', 'refs'])
  expect(code).toBe(0)
  const doc = JSON.parse(stdout) as IRDocument
  const text = (node: MdastNode): string => node.value ?? (node.children ?? []).map(text).join('')
  const references = (node: MdastNode): MdastNode[] => node.type === 'crossReference' ? [node] : (node.children ?? []).flatMap(references)
  const reading = doc.sections.find(s => s.id === 'reading')!
  const found = reading.blocks.flatMap(b => b.node.type === 'markdown' ? references(b.node.mdast) : [])
  expect(found.map(r => [r.kind, r.identifier, text(r)])).toEqual([
    ['ref', 'energy', 'Mass and energy'],
    ['eq', 'eq-energy', '(1)'],
    ['eq', 'eq-pythagoras', '(2)'],
    // MyST keeps the number with its word: a no-break space.
    ['numref', 'fig-dot', 'Figure 1'],
    // Text written with the reference is kept.
    ['ref', 'energy', 'the first section'],
    ['ref', 'figures', 'Figures'],
    ['ref', 'nowhere', ''],
  ])
  expect(stderr).toContain('{ref} target "nowhere" not found')
})

it('{config} overrides a plugin\'s global options in its section, for its directives and passes; a plugin for another kernel is not loaded', async () => {
  const dir = fixtures()
  const { code, stdout } = await presmium(dir, ['ir', 'scoped'])
  expect(code).toBe(0)
  const doc = JSON.parse(stdout) as IRDocument
  const props = (id: string) => doc.sections.find(s => s.id === id)!.blocks.map(b => b.node.type === 'component' ? b.node.props : undefined)
  expect(props('global')).toEqual([{ label: 'global', tone: 'plain' }])
  // Wherever the directive is in the section: before {config}, or in a {slide}.
  expect(props('overridden')).toEqual([{ label: 'section', tone: 'plain' }, { label: 'section', tone: 'plain' }])
  expect(doc.sections.map(s => s.config)).toEqual([undefined, undefined, { 'fixture.scoped': { label: 'section' } }])
  expect(doc.meta.labels).toEqual({ 'scoped-configuration': 'global', 'global': 'global', 'overridden': 'section' })

  const future = await presmium(dir, ['ir', 'future'])
  expect(future.code).toBe(1)
  expect(future.stderr).toContain('plugin "../addons/future" (fixture.future 2.0.0) is not loaded: kernel 0.1.0 does not satisfy "^9.0.0"')
})
