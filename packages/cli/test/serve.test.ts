import { cpSync, existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import type { Child } from './serve-helpers.ts'
import { FIXTURES, presmiumProcess, raw, remove, waitFor, workspace } from './serve-helpers.ts'

async function siteIR(url: string, dir: string, headers: Record<string, string> = {}): Promise<{ text: string, doc: { diagnostics: { checkId: string, severity: string, message: string }[] } }> {
  const answer = await raw(`${url}/__app/ir?document=${encodeURIComponent(dir)}`, { headers })
  expect(answer.status, answer.text).toBe(200)
  return { text: answer.text, doc: answer.json<{ diagnostics: { checkId: string, severity: string, message: string }[] }>() }
}

describe('the plugins of presmium serve are those the deck lists, as in presmium dev', () => {
  let dir: string
  let serve: Child
  afterAll(async () => {
    await serve?.stop()
    remove(dir)
  }, 60_000)

  it('loads the deck\'s plugin named by a relative path and the one installed only in its node_modules', async () => {
    dir = workspace('deck-plugins', 'deck-plugins')
    cpSync(join(FIXTURES, 'plugins/presmium-fixture-deckonly'), join(dir, 'doc/node_modules/presmium-fixture-deckonly'), { recursive: true })
    serve = presmiumProcess(dir, ['serve', '--port', '0'])
    const url = (await waitFor(serve, /^serve {2}(http\S+)$/m))[1]!
    const { doc } = await siteIR(url, 'doc')
    expect(doc.diagnostics.filter(d => d.checkId === 'presmium.plugins')).toEqual([])
    for (const marker of ['doc/relative/loaded', 'doc/node_modules/presmium-fixture-deckonly/loaded']) expect(existsSync(join(dir, marker)), marker).toBe(true)
  }, 180_000)
})

function execWorkspace(prefix: string): string {
  const dir = workspace(prefix, 'exec', { '@lincyaw/addon-exec': 'packages/addon-exec' })
  writeFileSync(join(dir, 'presmium.workspace.yaml'), `title: 编译时执行
settings:
  presmium.workspace:
    plugins: ['@lincyaw/addon-exec']
`)
  return dir
}

function recordings(dir: string): { env: Record<string, string>, parent: number }[] {
  const freeze = join(dir, 'code/.presmium/freeze')
  return readdirSync(freeze).filter(name => name.endsWith('.json')).map((name) => {
    const { run } = JSON.parse(readFileSync(join(freeze, name), 'utf8')) as { run: { ok: boolean, stdout: string, stderr: string } }
    expect(run.ok, run.stderr).toBe(true)
    const env = /^ENV (.*)$/m.exec(run.stdout)?.[1]
    const parent = /^PARENT (\d+)$/m.exec(run.stdout)?.[1]
    expect(env, run.stdout).toBeDefined()
    expect(parent, run.stdout).toBeDefined()
    return { env: JSON.parse(env!) as Record<string, string>, parent: Number(parent) }
  })
}

describe('compile-time execution in presmium serve', () => {
  const cleanups: (() => Promise<void> | void)[] = []
  afterAll(async () => {
    for (const cleanup of cleanups.reverse()) await cleanup()
  }, 120_000)

  it('runs the code in serve without asking, with the serve rules\' HOME', async () => {
    const dir = execWorkspace('exec-local')
    const serve = presmiumProcess(dir, ['serve', '--port', '0'])
    cleanups.push(() => serve.stop(), () => remove(dir))
    const url = (await waitFor(serve, /^serve {2}(http\S+)$/m))[1]!
    expect((await raw(`${url}/code/`)).status).toBe(200)
    const runs = recordings(dir)
    expect(runs).toHaveLength(1)
    const [run] = runs
    expect(run!.parent).toBe(serve.pid)
    expect(run!.env.HOME).toMatch(/\/presmium\/run-home\/[0-9a-f]{16}$/)
  }, 300_000)
})
