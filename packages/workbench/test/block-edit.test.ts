import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, expect, it } from 'vitest'
import { Compiler } from '@lincyaw/compiler'
import { bodyBlocks, writeBodyBlocks } from '../src/block-edit.ts'

const dirs: string[] = []
afterAll(() =>
  dirs.forEach((dir) => rmSync(dir, { recursive: true, force: true })),
)
function deck() {
  const dir = mkdtempSync(join(tmpdir(), 'presmium-body-roundtrip-'))
  dirs.push(dir)
  return {
    dir,
    async compile(source: string) {
      writeFileSync(join(dir, 'lecture.md'), source)
      return (await new Compiler(dir).compile()).doc
    },
  }
}

it('preserves list reveals and shared containers with directive examples in code when body blocks are saved', async () => {
  const fixture = deck()
  const source =
    '# Review\n\n::::{slide}\n:reveal: items\n\n- **First**\n- Second\n- Third\n::::\n\n::::{slide}\n\n```text\n:::{literal-example}\n```\n\nText **inside** shared wrapper.\n::::\n\nSpeech.\n'
  const before = await fixture.compile(source)
  const section = before.sections[0]!
  const written = writeBodyBlocks(
    before,
    section,
    source,
    bodyBlocks(section).map((block) => ({ id: block.id, source: block.id })),
  )
  const after = await fixture.compile(written)
  expect(after.sections[0]!.steps).toBe(2)
  const body = (doc: typeof before) =>
    bodyBlocks(doc.sections[0]!).map(({ id, at, span, node }) => ({
      id,
      at,
      span,
      node,
    }))
  expect(body(after)).toEqual(body(before))
  expect(after.sections[0]!.blocks.at(-1)!.at).toBe(section.blocks.at(-1)!.at)
  expect(after.sections[0]!.blocks).toHaveLength(section.blocks.length)
  const reordered = bodyBlocks(section).map((block) => ({
    id: block.id,
    source: block.id,
  }))
  expect(() =>
    writeBodyBlocks(before, section, source, [
      reordered[1]!,
      reordered[0]!,
      ...reordered.slice(2),
    ]),
  ).toThrow('block-step-order')
  const preceding = await fixture.compile(
    source.replace('# Review\n', '# Review\n\n```text\nbefore\n```\n'),
  )
  expect(() =>
    writeBodyBlocks(
      preceding,
      preceding.sections[0]!,
      source.replace('# Review\n', '# Review\n\n```text\nbefore\n```\n'),
      bodyBlocks(preceding.sections[0]!)
        .slice(1)
        .map((block) => ({ id: block.id, source: block.id })),
    ),
  ).toThrow('block-step-order')
})

it('retains scene options and captions while changing the scene, and applies an inserted scene starting step', async () => {
  const fixture = deck()
  mkdirSync(join(fixture.dir, 'scenes'))
  for (const scene of ['a', 'b'])
    writeFileSync(
      join(fixture.dir, 'scenes', `${scene}.ts`),
      'export default {}',
    )
  const addon = fileURLToPath(new URL('../../addon-motion', import.meta.url))
  const source = `---\nplugins:\n  - ${addon}\n---\n\n# Scene\n\n:::{scene} a\n:durations: 1s, 2s, 3s\n:aspect: 4/3\n:height: 20rem\n\n**Caption**.\n:::\n`
  const before = await fixture.compile(source)
  const section = before.sections[0]!,
    scene = section.blocks[0]!
  const retained = writeBodyBlocks(before, section, source, [
    {
      id: scene.id,
      source: scene.id,
      scene: 'a',
      durations: [1000, 2000, 3000],
    },
  ])
  const retainedDoc = await fixture.compile(retained)
  expect(retainedDoc.sections[0]!.blocks[0]!.node).toEqual(scene.node)
  const written = writeBodyBlocks(before, section, source, [
    { id: scene.id, source: scene.id, scene: 'b', durations: [500, 800, 900] },
    { id: 'new-scene', scene: 'a', durations: [1000], at: 5 },
  ])
  const after = await fixture.compile(written)
  const [changed, added] = after.sections[0]!.blocks
  expect(changed!.node.type).toBe('component')
  if (changed!.node.type !== 'component')
    throw new Error('the edited scene is not a component')
  expect(changed!.node.props).toEqual({
    scene: 'b',
    aspect: '4/3',
    height: '20rem',
    alt: '**Caption**.',
  })
  expect(changed!.node.durations).toEqual([500, 800, 900])
  expect(added!.at).toBe(5)
  const codeSource = '# Labels\n\n```text\nFirst\n```\n\n```text\nSecond\n```\n'
  const codes = await fixture.compile(codeSource),
    codeSection = codes.sections[0]!
  const moved = writeBodyBlocks(
    codes,
    codeSection,
    codeSource,
    [...codeSection.blocks]
      .reverse()
      .map((block) => ({ id: block.id, source: block.id })),
  )
  const movedDoc = await fixture.compile(moved)
  expect(
    movedDoc.sections[0]!.blocks.map((block) => [
      block.id,
      block.node.type === 'code' ? block.node.value : '',
    ]),
  ).toEqual([
    ['code-2', 'Second'],
    ['code-1', 'First'],
  ])
})
