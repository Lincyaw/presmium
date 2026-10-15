// `presmium ir` on fixtures/lecture: the compiler passes of docs/ir.md sections 2 and 4.
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { IRBlock, IRDocument } from '@presmium/kernel'
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
