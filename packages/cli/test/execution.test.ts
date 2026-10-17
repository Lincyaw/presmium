// Compile-time execution as the hosts run it (WP-89b): code does not see a credential such as `VOLC_APPID` (F-34);
// two documents compiled in one process that name the same session have an interpreter each (F-42);
// `PRESMIUM_DEBUG` makes the server of `presmium dev` say more (F-35).
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { docBlocks } from '@presmium/kernel'
import type { CodeNode, IRDocument } from '@presmium/kernel'
import { Compiler } from '@presmium/compiler'
import { afterAll, expect, it } from 'vitest'
import { presmium } from './helpers.ts'
import { cleanEnv, presmiumProcess, waitFor } from './serve-helpers.ts'

const EXEC = fileURLToPath(new URL('../../addon-exec', import.meta.url))
const dirs: string[] = []
afterAll(() => dirs.forEach(dir => rmSync(dir, { recursive: true, force: true })))

/** A deck outside git (its directory is the workspace root) with the execution plugin and these code blocks. */
function deck(blocks: string[]): string {
  const dir = mkdtempSync(join(tmpdir(), 'presmium-execution-'))
  dirs.push(dir)
  const code = blocks.map(block => `\`\`\`{code} python\n${block}\n\`\`\``).join('\n\n')
  writeFileSync(join(dir, 'lecture.md'), `---\ntitle: 执行\nplugins:\n  - ${EXEC}\n---\n\n## 代码\n\n${code}\n`)
  return dir
}

/** The code nodes of a document, in order. */
const codes = (doc: IRDocument) => [...docBlocks(doc)].flatMap(({ block }) => (block.node.type === 'code' ? [block.node as CodeNode] : []))

it('runs compile-time code without the credentials of the environment, VOLC_APPID too', async () => {
  const dir = deck([':run:\nimport os\nprint(os.environ.get("VOLC_APPID", "unset"), os.environ.get("OPENAI_API_KEY", "unset"))'])
  const result = await presmium(dir, ['ir'], { VOLC_APPID: 'volc-app-123', OPENAI_API_KEY: 'sk-test-key' })
  expect(result.code, result.stderr).toBe(0)
  const [code] = codes(JSON.parse(result.stdout) as IRDocument)
  expect(code!.outputs?.[0]).toMatchObject({ ok: true, stdout: 'unset unset\n' })
}, 60_000)

it('gives each compilation its own interpreter for a session: another document of the process sees none of its names, nor its failure', async () => {
  // a's session holds its name until b has looked for it, and b looks only once a has it: the two runs overlap
  // whatever the machine's load (the compiler's own API runs the code without a sandbox, so they meet in files).
  const meet = mkdtempSync(join(tmpdir(), 'presmium-execution-meet-'))
  dirs.push(meet)
  const wait = (name: string) => `for _ in range(600):\n    if os.path.exists(${JSON.stringify(join(meet, name))}): break\n    time.sleep(0.05)\nelse:\n    raise TimeoutError(${JSON.stringify(name)})`
  const mark = (name: string) => `open(${JSON.stringify(join(meet, name))}, "w").close()`
  const a = deck([`:run:\n:session: main\nimport os, time\nsecret_of_a = "A-ONLY-VALUE"\n${mark('a-has-it')}\n${wait('b-looked')}`, ':run:\n:session: main\nraise RuntimeError("A fails")'])
  const b = deck([`:run:\n:session: main\nimport os, time\n${wait('a-has-it')}\nprint(globals().get("secret_of_a"))\n${mark('b-looked')}`])
  // Compiled at the same time, as presmium serve compiles the documents of a workspace.
  const compile = (dir: string) => new Compiler(join(dir, 'lecture.md')).compile()
  const [first, second] = await Promise.all([compile(a), compile(b)])
  expect(codes(first!.doc).at(-1)!.outputs?.[0]).toMatchObject({ ok: false })
  expect(codes(second!.doc).at(-1)!.outputs?.[0]).toMatchObject({ ok: true, stdout: 'None\n' })
}, 60_000)

it('the server of presmium dev logs its debug lines with PRESMIUM_DEBUG', async () => {
  const dir = deck(['print(1)'])
  const dev = presmiumProcess(dir, ['dev', '--to', 'notebook'], cleanEnv({ PRESMIUM_DEBUG: '1' }))
  try {
    await waitFor(dev, /\[presmium server\] listening at http:\/\/127\.0\.0\.1:\d+/, 120_000)
  } finally {
    await dev.stop()
  }
}, 150_000)
