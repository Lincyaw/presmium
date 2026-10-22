import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { setTimeout as sleep } from 'node:timers/promises'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { run } from '@lincyaw/cli/testing'
import { CompletionRequest, DefinitionRequest, HoverRequest } from 'vscode-languageserver/node'
import type { CompletionItem, CompletionList, Hover, Location, MarkupContent } from 'vscode-languageserver/node'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { PREVIEW_REQUEST, SECTION_REQUEST } from '../src/domain/protocol.ts'
import type { Preview, SectionLocation } from '../src/domain/protocol.ts'
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

(pinned)=
## Pinned

\`\`\`{code-ref} region:src/bpe.py#count
:pin: HEAD
\`\`\`

(parser)=
## Parser

\`\`\`{code-ref} symbol:src/parser.py#Parser.parse
\`\`\`
`

const PARSER = `class Parser:
    def __init__(self, text):
        self.text = text

    def parse(self):
        return self.text.split()

def helper():
    return Parser('a b').parse()
`

const dir = mkdtempSync(join(tmpdir(), 'presmium-lsp-'))
const deck = join(dir, 'deck/lecture.md')
const code = join(dir, 'src/bpe.py')
const parser = join(dir, 'src/parser.py')
const uri = pathToFileURL(deck).href
const lineOf = (text: string, line: string) => text.split('\n').indexOf(line)
let server: Client

beforeAll(async () => {
  mkdirSync(join(dir, 'src'))
  mkdirSync(join(dir, 'deck'))
  writeFileSync(code, BPE)
  writeFileSync(parser, PARSER)
  writeFileSync(deck, DECK)
  const git = async (...args: string[]) => {
    const result = await run('git', ['-c', 'user.name=test', '-c', 'user.email=test@example.com', '-c', 'commit.gpgsign=false', ...args], { cwd: dir })
    expect(result.code, `git ${args.join(' ')}: ${result.stderr}`).toBe(0)
  }
  await git('init', '-q')
  await git('add', '.')
  await git('commit', '-qm', 'bpe')
  writeFileSync(code, BPE.replace('pairs = {}', 'pairs = dict()'))
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

it('reports pinned code that drifted in the working tree at its anchor', async () => {
  const diagnostics = await server.diagnostics(uri)
  const drift = diagnostics.filter(d => d.code === 'presmium.code.drift')
  expect(drift, JSON.stringify(diagnostics)).toMatchObject([{ severity: 2, range: { start: { line: lineOf(DECK, '```{code-ref} region:src/bpe.py#count') } } }])
  expect(JSON.stringify(drift[0]!.message)).toContain('region:src/bpe.py#count drifted since pinned commit HEAD')
})

it('goes from a symbol anchor to the declaration, and shows its code on hover', async () => {
  const line = lineOf(DECK, '```{code-ref} symbol:src/parser.py#Parser.parse')
  const position = { line, character: '```{code-ref} symbol:src/parser.py#Par'.length }
  const locations = await server.connection.sendRequest(DefinitionRequest.type, { textDocument: { uri }, position }) as Location[]
  expect(locations).toEqual([{
    uri: pathToFileURL(parser).href,
    range: { start: { line: lineOf(PARSER, '    def parse(self):'), character: 0 }, end: { line: lineOf(PARSER, '        return self.text.split()'), character: '        return self.text.split()'.length } },
  }])
  const hover = await server.connection.sendRequest(HoverRequest.type, { textDocument: { uri }, position }) as Hover
  const { value } = hover.contents as MarkupContent
  expect(value).toContain('symbol:src/parser.py#Parser.parse')
  expect(value).toContain('def parse(self):\n    return self.text.split()')
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

it('shows the referenced code and its recorded output on hover, in the deck\'s language', async () => {
  const position = { line: lineOf(DECK, '```{code-ref} region:src/bpe.py#merge'), character: 20 }
  const hover = await server.connection.sendRequest(HoverRequest.type, { textDocument: { uri }, position }) as Hover
  const { value } = hover.contents as MarkupContent
  expect(value).toContain('region:src/bpe.py#merge')
  expect(value).toContain('best = max(pairs, key=pairs.get)')
  expect(value).not.toContain('# region pick')
  expect(value).toMatch(/录制的输出[\s\S]*ab 2/)
})

it('completes region names in an anchor, directive names and options', async () => {
  const draft = `${DECK}\n\`\`\`{code-ref} region:src/bpe.py#\n:\n\`\`\`\n\n\`\`\`{code-ref} symbol:src/parser.py#\n\`\`\`\n\n\`\`\`{\n`
  server.change(uri, draft, 2)
  const complete = async (line: string) => {
    const position = { line: lineOf(draft, line), character: line.length }
    const result = await server.connection.sendRequest(CompletionRequest.type, { textDocument: { uri }, position }) as CompletionItem[] | CompletionList
    return (Array.isArray(result) ? result : result.items).map(item => item.label)
  }
  const regions = await complete('```{code-ref} region:src/bpe.py#')
  expect(regions).toEqual(expect.arrayContaining(['merge', 'count', 'pick']))
  expect(regions).not.toContain('gone')
  expect(await complete('```{code-ref} symbol:src/parser.py#')).toEqual(expect.arrayContaining(['Parser', 'Parser.__init__', 'Parser.parse', 'helper']))
  expect(await complete('```{')).toEqual(expect.arrayContaining(['code-ref', 'run-panel', 'slide', 'component', 'config']))
  expect(await complete(':')).toEqual(expect.arrayContaining(['steps', 'pin', 'run', 'reveal']))
})

it('maps the cursor to its section and opens the presmium dev preview', async () => {
  const position = { line: lineOf(DECK, '```{code-ref} region:src/bpe.py#gone'), character: 0 }
  const section = await server.connection.sendRequest(SECTION_REQUEST, { textDocument: { uri }, position }) as SectionLocation
  expect(section).toEqual({ entry: deck, id: 'lost', index: 2, title: 'Lost', link: '/#lost' })

  const preview = await server.connection.sendRequest(PREVIEW_REQUEST, { textDocument: { uri } }) as Preview
  expect(preview.entry).toBe(deck)
  expect(existsSync(join(dir, 'deck/.presmium/preview/ir.json'))).toBe(true)
  const page = await fetch(preview.url)
  expect(page.status).toBe(200)
  expect(await page.text()).toContain('<div id="app">')
}, 120_000)

it('answers at once about a file of a deck that is compiling again after a save', async () => {
  const entry = join(dir, 'slow/lecture.md')
  const text = `---\ntitle: Slow\nplugins:\n  - ${fileURLToPath(new URL('./fixtures/slow', import.meta.url))}\n---\n\n## Slow\n\nA pass of a second.\n`
  mkdirSync(join(dir, 'slow'))
  writeFileSync(entry, text)
  const slow = pathToFileURL(entry).href
  server.open(slow, text)
  await server.diagnostics(slow)
  server.save(slow)
  await sleep(300)
  const started = Date.now()
  await server.connection.sendRequest(HoverRequest.type, { textDocument: { uri: slow }, position: { line: 7, character: 0 } })
  expect(Date.now() - started).toBeLessThan(200)
}, 30_000)

it('starts one presmium dev for a deck again after a start that failed, however often the preview is asked for', async () => {
  const entry = join(dir, 'again/lecture.md')
  mkdirSync(join(dir, 'again'))
  const text = (web: string) => `---\ntitle: Again\nrenderers:\n  web:\n    package: ${web}\n---\n\n## One\n\nText.\n`
  writeFileSync(entry, text(join(dir, 'no-web-renderer')))
  const again = pathToFileURL(entry).href
  server.open(again, text(join(dir, 'no-web-renderer')))
  await server.diagnostics(again)
  await expect(server.connection.sendRequest(PREVIEW_REQUEST, { textDocument: { uri: again } })).rejects.toThrow(/no web server/)
  writeFileSync(entry, text(pkg('web')))
  const first = await server.connection.sendRequest(PREVIEW_REQUEST, { textDocument: { uri: again } }) as Preview
  const second = await server.connection.sendRequest(PREVIEW_REQUEST, { textDocument: { uri: again } }) as Preview
  expect(second.url).toBe(first.url)
  if (process.platform !== 'win32') expect(devProcesses(entry)).toHaveLength(1)
  else console.info('Skipping preview-process count: Unix ps is required; preview startup and URL reuse are still checked.')
}, 180_000)

function devProcesses(entry: string): string[] {
  return execFileSync('ps', ['-ww', '-axo', 'pid=,args='], { encoding: 'utf8' }).split('\n').flatMap((line) => {
    const match = /^\s*(\d+)\s+(.*)$/.exec(line)
    if (!match) return []
    const args = match[2]!.split(/\s+/)
    return args.includes('dev') && args.includes(entry) ? [match[1]!] : []
  })
}
