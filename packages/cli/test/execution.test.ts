// Compile-time execution as the hosts run it (WP-89b): code does not see a credential such as `VOLC_APPID` (F-34);
// the blocks of a session that `Compilation.run` sends to a remote run one after the other, so they arrive in
// order (F-39); two documents compiled in one process that name the same session have an interpreter each
// (F-42); `PRESMIUM_DEBUG` makes the server of `presmium dev` say more (F-35).
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { setTimeout as sleep } from 'node:timers/promises'
import { fileURLToPath } from 'node:url'
import { docBlocks } from '@presmium/kernel'
import type { CodeNode, IRDocument, RunRequest } from '@presmium/kernel'
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

it('sends the blocks of a session to a remote one after the other: they arrive and run in order', async () => {
  const dir = deck([':run:\n:session: s\nx = 6', ':run:\n:session: s\ny = x * 7', ':run:\n:session: s\nprint(y)'])
  const local = await new Compiler(join(dir, 'lecture.md')).compile()
  const python = local.executors.find(e => e.id === 'presmium.python')!
  const arrived: string[] = []
  // A remote whose network is slower for the first requests: sent at once, the last would arrive first.
  const delays: Record<string, number> = { 'x = 6': 400, 'y = x * 7': 200 }
  const remote = {
    async run(_executor: string, request: RunRequest, _env: Readonly<Record<string, string>>, signal?: AbortSignal) {
      await sleep(delays[request.code] ?? 0)
      arrived.push(request.code)
      return python.run(request, signal)
    },
    endSession: (_executor: string, session: string) => python.endSession!(session),
  }
  const compilation = await new Compiler(join(dir, 'lecture.md'), { execution: { remote } }).compile()
  const result = await compilation.run(codes(compilation.doc).at(-1)!)
  expect(result).toMatchObject({ ok: true, stdout: '42\n' })
  expect(arrived).toEqual(['x = 6', 'y = x * 7', 'print(y)'])
}, 60_000)

it('gives each compilation its own interpreter for a session: another document of the process sees none of its names, nor its failure', async () => {
  const a = deck([':run:\n:session: main\nsecret_of_a = "A-ONLY-VALUE"', ':run:\n:session: main\nraise RuntimeError("A fails")'])
  const b = deck([':run:\n:session: main\nprint(globals().get("secret_of_a"))'])
  // Compiled at the same time, as presmium serve and agent-host compile the documents of a workspace: the host's
  // `admit` lets both send their runs at once.
  let waiting = 0
  let release!: () => void
  const both = new Promise<void>(resolve => release = resolve)
  const admit = async <T>(runs: T[]) => {
    if (++waiting === 2) release()
    await both
    return runs
  }
  const compile = (dir: string) => new Compiler(join(dir, 'lecture.md'), { execution: { admit } }).compile()
  const [first, second] = await Promise.all([compile(a), compile(b)])
  expect(codes(first!.doc).at(-1)!.outputs?.[0]).toMatchObject({ ok: false })
  expect(codes(second!.doc).at(-1)!.outputs?.[0]).toMatchObject({ ok: true, stdout: 'None\n' })
}, 60_000)

it('the server of presmium dev logs its debug lines with PRESMIUM_DEBUG', async () => {
  const dir = deck(['print(1)'])
  const dev = presmiumProcess(dir, ['dev', '--to', 'notebook'], cleanEnv({ PRESMIUM_DEBUG: '1' }))
  try {
    await waitFor(dev, /\[presmium server\] listening at http:\/\/127\.0\.0\.1:\d+, local mode/, 120_000)
  } finally {
    await dev.stop()
  }
}, 150_000)
