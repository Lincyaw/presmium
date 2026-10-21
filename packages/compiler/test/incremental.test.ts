import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, expect, it } from 'vitest'
import { Compiler } from '../src/index.ts'

const dirs: string[] = []
afterAll(() => dirs.forEach(dir => rmSync(dir, { recursive: true, force: true })))
const plain = (value: unknown) => JSON.parse(JSON.stringify(value))
function workspace(): string {
  const dir = mkdtempSync(join(tmpdir(), 'presmium-incremental-'))
  dirs.push(dir)
  return dir
}

it('rebuilds a large document, shifted source lines and included files exactly as a fresh compiler, without changing an earlier IR', async () => {
  const dir = workspace()
  const file = join(dir, 'lecture.md')
  const part = join(dir, 'part.md')
  const sections = Array.from({ length: 160 }, (_, i) => `(s${i})=\n## Section ${i}\n\nParagraph ${i} with **emphasis**.\n\n:::{slide}\nShown ${i}.\n:::\n\n\`\`\`python\n# A fence contains Markdown, not new sections.\nprint("## ignored")\n\`\`\`\n\n$$\nx_${i} = ${i}\n$$\n\n| Name | Value |\n| --- | --- |\n| entry | ${i} |\n`).join('\n')
  const source = `---\ntitle: Incremental\n---\n${sections}\n:::{include} part.md\n:::\n`
  writeFileSync(file, source)
  writeFileSync(part, '## Included\n\nAn included paragraph.\n')
  const compiler = new Compiler(file, { workspaceRoot: dir, settings: {} })
  const first = await compiler.compile()
  const snapshot = plain(first.doc)
  for (const text of [
    source.replace('with **emphasis**.', 'has strong **emphasis**.'),
    source.replace('**emphasis**', '**focus**'),
    source.replace('Paragraph 0', 'An edited paragraph 0'),
    source.replace('Paragraph 0', 'A new paragraph.\n\nParagraph 0'),
    source.replace('## ignored', '## still ignored'),
    source,
  ]) {
    writeFileSync(file, text)
    const next = await compiler.compile()
    const fresh = await new Compiler(file, { workspaceRoot: dir, settings: {} }).compile()
    expect(next.doc.diagnostics.filter(d => d.severity === 'error')).toEqual([])
    expect(plain(next.doc)).toEqual(plain(fresh.doc))
    expect(next.doc.sections).toHaveLength(161)
    const equations = next.doc.sections.flatMap(section => section.blocks).flatMap(block => block.node.type === 'markdown' ? block.node.mdast.children ?? [] : []).filter(node => node.type === 'math')
    expect(equations.at(-1)?.enumerator).toBe('160')
  }
  writeFileSync(part, '## Included\n\nThe include changed.\n')
  expect(JSON.stringify((await compiler.compile()).doc)).toContain('The include changed.')
  expect(plain(first.doc)).toEqual(snapshot)
  // Markdown reference definitions and footnotes retain their file-wide scope.
  writeFileSync(file, `${source}\nA [cross-file-sized link][target] and note[^n].\n\n[target]: https://example.com/\n[^n]: A footnote at the end.\n`)
  const linked = await compiler.compile()
  expect(linked.doc.diagnostics.filter(d => d.severity === 'error')).toEqual([])
  expect(JSON.stringify(linked.doc)).toContain('https://example.com/')
  expect(JSON.stringify(linked.doc)).toContain('footnoteReference')
}, 120_000)

it('serializes independent compilations and re-evaluates plugin syntax after its external dependency changes', async () => {
  const dir = workspace()
  mkdirSync(join(dir, 'plugin'))
  writeFileSync(join(dir, 'plugin/package.json'), JSON.stringify({ name: 'fixture-incremental', private: true, type: 'module', exports: { './presmium': './plugin.mjs' } }))
  writeFileSync(join(dir, 'value.txt'), 'first')
  writeFileSync(join(dir, 'plugin/plugin.mjs'), `
import { appendFileSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
const metadata = new WeakMap()
export default {
  id: 'fixture.incremental',
  directives: [{ name: 'value', toIR(_input, ctx) {
    const file = join(ctx.deckDir, 'value.txt'); ctx.watch(file)
    const node = { type: 'markdown', mdast: { type: 'root', children: [{ type: 'paragraph', children: [{ type: 'text', value: readFileSync(file, 'utf8') }] }] } }
    metadata.set(node, true)
    return { node }
  }}],
  passes: [{ name: 'record', async run(doc) {
    if (!doc.sections.some(section => section.blocks.some(block => metadata.has(block.node)))) throw new Error('directive node identity lost')
    const log = join(${JSON.stringify(dir)}, 'order.txt')
    appendFileSync(log, 'start ' + doc.meta.title + '\\n')
    await new Promise(resolve => setTimeout(resolve, 15))
    appendFileSync(log, 'end ' + doc.meta.title + '\\n')
  }}],
}
`)
  for (const title of ['A', 'B']) writeFileSync(join(dir, `${title}.md`), `---\ntitle: ${title}\nplugins: ['./plugin']\n---\n# ${title}\n\n:::{value}\n:::\n`)
  const a = new Compiler(join(dir, 'A.md'), { workspaceRoot: dir, settings: {} })
  const b = new Compiler(join(dir, 'B.md'), { workspaceRoot: dir, settings: {} })
  const [first, second] = await Promise.all([a.compile(), b.compile()])
  expect(first.doc.diagnostics.filter(d => d.severity === 'error')).toEqual([])
  expect(second.doc.diagnostics.filter(d => d.severity === 'error')).toEqual([])
  expect(readFileSync(join(dir, 'order.txt'), 'utf8')).toBe('start A\nend A\nstart B\nend B\n')
  writeFileSync(join(dir, 'value.txt'), 'second')
  expect(JSON.stringify((await a.compile()).doc)).toContain('second')
  expect(JSON.stringify(first.doc)).toContain('first')
})
