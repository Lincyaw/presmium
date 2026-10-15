// The language server (P-80, P-81) driven over LSP on a MyST deck that references code in a
// throwaway git repository; the deck is compiled by the real compiler with the code and
// execution plugins.
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { CompletionRequest, DefinitionRequest, HoverRequest } from 'vscode-languageserver/node'
import type { CompletionItem, CompletionList, Hover, Location, MarkupContent } from 'vscode-languageserver/node'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { PREVIEW_REQUEST, SECTION_REQUEST } from '../src/domain/protocol.ts'
import type { Preview, SectionAt } from '../src/domain/protocol.ts'
import { startServer } from './client.ts'
import type { Client } from './client.ts'

const pkg = (name: string) => fileURLToPath(new URL(`../../${name}`, import.meta.url))

const BPE = `def tokens(text):
    return list(text)

# region merge
# region count
pairs = {}
for a, b in zip("abab", "abab"[1:]):
    pairs[a + b] = pairs.get(a + b, 0) + 1
# endregion count
# region pick
best = max(pairs, key=pairs.get)
print(best, pairs[best])
# endregion pick
# endregion merge
`

const DECK = `---
title: LSP
plugins:
  - ${pkg('addon-code')}
  - ${pkg('addon-exec')}
renderers:
  web:
    package: ${pkg('web')}
---

(merge)=
## Merge

\`\`\`{code-ref} region:src/bpe.py#merge
:steps: count, pick
:run:
\`\`\`

(lost)=
## Lost

\`\`\`{code-ref} region:src/bpe.py#gone
:colour: red
\`\`\`
`

const dir = mkdtempSync(join(tmpdir(), 'presmium-lsp-'))
const deck = join(dir, 'deck/lecture.md')
const code = join(dir, 'src/bpe.py')
const uri = pathToFileURL(deck).href
const lineOf = (text: string, line: string) => text.split('\n').indexOf(line)
let server: Client

beforeAll(async () => {
  mkdirSync(join(dir, 'src'))
  mkdirSync(join(dir, 'deck'))
  writeFileSync(code, BPE)
  writeFileSync(deck, DECK)
  const git = (...args: string[]) => execFileSync('git', ['-c', 'user.name=test', '-c', 'user.email=test@example.com', ...args], { cwd: dir })
  git('init', '-q')
  git('add', '.')
  git('commit', '-qm', 'bpe')
  server = await startServer()
  server.open(uri, DECK)
})

afterAll(async () => {
  await server?.close()
  rmSync(dir, { recursive: true, force: true })
})

it('reports a lost anchor and an unknown option at their source positions', async () => {
  const diagnostics = await server.diagnostics(uri)
  const saying = (text: string) => diagnostics.find(d => JSON.stringify(d.message).includes(text))
  const line = lineOf(DECK, '```{code-ref} region:src/bpe.py#gone')
  const lost = saying('region:src/bpe.py#gone is lost')
  expect(lost, JSON.stringify(diagnostics)).toMatchObject({
    severity: 1,
    source: 'presmium',
    code: 'presmium.code.anchors',
    range: { start: { line, character: '```{code-ref} '.length }, end: { line, character: '```{code-ref} region:src/bpe.py#gone'.length } },
  })
  expect(diagnostics.filter(d => d.severity === 1)).toEqual([lost])
  expect(saying('unknown option :colour:')).toMatchObject({ severity: 2, range: { start: { line } } })
})

it('goes from an anchor to the code region it references', async () => {
  const position = { line: lineOf(DECK, '```{code-ref} region:src/bpe.py#merge'), character: 25 }
  const locations = await server.connection.sendRequest(DefinitionRequest.type, { textDocument: { uri }, position }) as Location[]
  const lines = BPE.split('\n')
  expect(locations).toEqual([{
    uri: pathToFileURL(code).href,
    range: { start: { line: lineOf(BPE, '# region count'), character: 0 }, end: { line: lineOf(BPE, '# endregion pick'), character: '# endregion pick'.length } },
  }])
  expect(lines[locations[0]!.range.end.line + 1]).toBe('# endregion merge')
})

it('shows the referenced code and its recorded output on hover', async () => {
  const position = { line: lineOf(DECK, '```{code-ref} region:src/bpe.py#merge'), character: 20 }
  const hover = await server.connection.sendRequest(HoverRequest.type, { textDocument: { uri }, position }) as Hover
  const { value } = hover.contents as MarkupContent
  expect(value).toContain('region:src/bpe.py#merge')
  expect(value).toContain('best = max(pairs, key=pairs.get)')
  expect(value).not.toContain('# region pick')
  expect(value).toMatch(/Recorded output[\s\S]*ab 2/)
})

it('completes region names in an anchor, directive names and options', async () => {
  const draft = `${DECK}\n\`\`\`{code-ref} region:src/bpe.py#\n:\n\`\`\`\n\n\`\`\`{\n`
  server.change(uri, draft, 2)
  const complete = async (line: string) => {
    const position = { line: lineOf(draft, line), character: line.length }
    const result = await server.connection.sendRequest(CompletionRequest.type, { textDocument: { uri }, position }) as CompletionItem[] | CompletionList
    return (Array.isArray(result) ? result : result.items).map(item => item.label)
  }
  const regions = await complete('```{code-ref} region:src/bpe.py#')
  expect(regions).toEqual(expect.arrayContaining(['merge', 'count', 'pick']))
  expect(regions).not.toContain('gone')
  expect(await complete('```{')).toEqual(expect.arrayContaining(['code-ref', 'run-panel', 'slide', 'component']))
  expect(await complete(':')).toEqual(expect.arrayContaining(['steps', 'pin', 'run', 'reveal']))
})

it('maps the cursor to its section and opens the presmium dev preview (P-81)', async () => {
  const position = { line: lineOf(DECK, '```{code-ref} region:src/bpe.py#gone'), character: 0 }
  const section = await server.connection.sendRequest(SECTION_REQUEST, { textDocument: { uri }, position }) as SectionAt
  expect(section).toEqual({ entry: deck, id: 'lost', index: 2, title: 'Lost', link: '/#lost' })

  const preview = await server.connection.sendRequest(PREVIEW_REQUEST, { textDocument: { uri } }) as Preview
  expect(preview.entry).toBe(deck)
  expect(existsSync(join(dir, 'deck/.presmium/preview/ir.json'))).toBe(true)
  const page = await fetch(preview.url)
  expect(page.status).toBe(200)
  expect(await page.text()).toContain('<div id="app">')
}, 120_000)
