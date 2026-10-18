// Edit mode in `presmium dev` (P-124, WP-92d; docs/architecture.md 10.2): the workspace's source routes over
// the one deck, with the real CLI and the assistant (the scripted test agent as its runtime). A deck in a
// subdirectory of a git repository: its files are listed by their path in the repository, a file outside the
// deck is refused, a save naming an older version is refused with what is on disk, a save compiles again; the
// changes list it, the status bar counts the deck's files only, and a commit with a line of explanation is one
// commit with the editor's origin, in the deck's history; there are no document operations; the assistant
// commits change tasks there, and while one runs the deck's lock is its: a save is refused. A deck at the root
// of a repository with no .gitignore, its entry not lecture.md: the MCP token of `presmium dev`
// (.presmium/server.json) is neither listed, counted nor committed, and the deck is a document the assistant
// changes, not the workspace's home page. A deck in no git repository saves all the same, and commits
// nothing, nor does the assistant.
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { cleanEnv, presmiumProcess, ROOT, waitFor } from './serve-helpers.ts'
import type { Child } from './serve-helpers.ts'

const ASSISTANT = join(ROOT, 'packages/addon-assistant')
const AGENT = join(ASSISTANT, 'test/fixtures/scripted-agent.mjs')
const LECTURE = `---\ntitle: 开发中的编辑\nplugins:\n  - ${ASSISTANT}\n---\n\n# 引言\n\n这一段要改的词是 alpha。\n`

function git(dir: string, args: string[]): string {
  return execFileSync('git', ['-c', 'core.hooksPath=/dev/null', '-c', 'user.name=Test', '-c', 'user.email=test@example.com', '-c', 'commit.gpgSign=false', ...args], { cwd: dir, encoding: 'utf8' })
}

const made: string[] = []
const running: Child[] = []
afterAll(async () => {
  for (const child of running) await child.stop()
  for (const dir of made) rmSync(dir, { recursive: true, force: true })
})

type Route = (path: string, body?: unknown) => Promise<{ status: number, json: any }>

/** `presmium dev` of the deck in `dir` (no renderer's dev server; `entry` there), its state outside it: the routes of a plugin, once it compiled. */
async function dev(dir: string, state: string, entry?: string): Promise<{ child: Child, route: Route, assistant: Route }> {
  const env = cleanEnv({ XDG_STATE_HOME: join(state, 'state'), XDG_CONFIG_HOME: join(state, 'config'), PRESMIUM_AGENT_COMMAND: `${process.execPath} ${AGENT}`, PRESMIUM_AGENT_PROVIDER: 'Test Provider' })
  const child = presmiumProcess(dir, ['dev', ...entry ? [entry] : [], '--to', 'notebook'], env)
  running.push(child)
  const server = (await waitFor(child, /^server {2}(http\S+)$/m))[1]!
  await waitFor(child, /^watching;/m)
  const of = (plugin: string): Route => async (path, body) => {
    const response = await fetch(`${server}/__presmium/${plugin}/${path}`, body === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    return { status: response.status, json: await response.json().catch(() => ({})) }
  }
  return { child, route: of('presmium.workspace'), assistant: of('presmium.assistant') }
}

/** How many times the dev server compiled so far. */
const compiled = (child: Child) => child.output().match(/^compiled /gm)?.length ?? 0

describe('presmium dev: edit mode', () => {
  it('in a git repository: lists and saves the deck\'s files by their path there, compiles again, commits the change in the deck\'s history; an agent\'s change task holds the deck\'s lock', async () => {
    const repo = mkdtempSync(join(tmpdir(), 'presmium-dev-editing-'))
    const state = mkdtempSync(join(tmpdir(), 'presmium-dev-editing-state-'))
    made.push(repo, state)
    mkdirSync(join(repo, 'talks/bpe'), { recursive: true })
    writeFileSync(join(repo, 'talks/bpe/lecture.md'), LECTURE)
    writeFileSync(join(repo, 'README.md'), '仓库的说明\n')
    writeFileSync(join(repo, '.gitignore'), '.presmium/\n')
    // The assistant's own git review (deltabox's off).
    writeFileSync(join(repo, 'presmium.workspace.yaml'), 'settings:\n  presmium.deltabox:\n    review: false\n')
    git(repo, ['init', '-q', '-b', 'main'])
    git(repo, ['add', '-A'])
    git(repo, ['commit', '-q', '-m', 'Initial commit'])
    const { child, route, assistant } = await dev(join(repo, 'talks/bpe'), state)

    const files = await route('files')
    expect(files.status).toBe(200)
    expect(files.json).toMatchObject({ document: 'talks/bpe', home: false })
    expect(files.json.files.map((file: { path: string }) => file.path)).toEqual(['talks/bpe/lecture.md'])
    expect((await route('source?path=README.md')).status).toBe(403)
    const opened = await route('source?path=talks%2Fbpe%2Flecture.md')
    expect(opened.json.content).toBe(LECTURE)

    // A save naming the version opened writes the file, and the deck compiles again.
    const before = compiled(child)
    const saved = await route('source', { path: 'talks/bpe/lecture.md', content: LECTURE.replace('alpha', 'omega'), base: opened.json.version })
    expect(saved.status).toBe(200)
    expect(readFileSync(join(repo, 'talks/bpe/lecture.md'), 'utf8')).toContain('omega')
    await expect.poll(() => compiled(child), { timeout: 60_000 }).toBeGreaterThan(before)
    // One naming the version it opened before is refused with what is there now.
    const stale = await route('source', { path: 'talks/bpe/lecture.md', content: LECTURE, base: opened.json.version })
    expect(stale.status).toBe(409)
    expect(stale.json.conflict.content).toContain('omega')

    // A file outside the deck changed too: the status bar counts the deck's files only.
    writeFileSync(join(repo, 'README.md'), '改过的说明\n')
    expect((await route('changes')).json.files).toEqual([{ path: 'talks/bpe/lecture.md', kind: 'modified', added: 1, removed: 1 }])
    expect((await route('documents')).json).toMatchObject({ git: true, branch: 'main', uncommitted: 1, single: true })
    expect((await route('documents', { op: 'create', dir: 'talks/other' })).status).toBe(409)

    const committed = await route('changes/commit', { message: '把 alpha 改成 omega' })
    expect(committed.status).toBe(200)
    expect(committed.json.paths).toEqual(['talks/bpe/lecture.md'])
    expect(git(repo, ['log', '-1', '--format=%B'])).toMatch(/^把 alpha 改成 omega\n[\s\S]*Presmium-Origin: editor/)
    expect(git(repo, ['status', '--porcelain'])).toBe(' M README.md\n')
    const history = (await route('revisions')).json.revisions
    expect(history.map((revision: { files: string[] }) => revision.files)).toEqual([['talks/bpe/lecture.md']])

    // The assistant commits change tasks here; while one runs, a save is refused with its lock.
    expect((await assistant('info')).json).toMatchObject({ changes: true, kinds: expect.arrayContaining(['chat']) })
    const now = await route('source?path=talks%2Fbpe%2Flecture.md')
    const task = await assistant('tasks', { kind: 'chat', prompt: '#wait', context: { document: '' } })
    expect(task.status).toBe(201)
    try {
      const locked = await route('source', { path: 'talks/bpe/lecture.md', content: `${now.json.content}作者的一句。\n`, base: now.json.version })
      expect(locked.status).toBe(409)
      expect(locked.json.locked).toEqual({ document: 'talks/bpe', holder: `agent:${task.json.id}` })
      expect(readFileSync(join(repo, 'talks/bpe/lecture.md'), 'utf8')).toBe(now.json.content)
    } finally {
      expect((await assistant(`tasks/${task.json.id}/cancel`, {})).status).toBe(204)
    }
  }, 180_000)

  it('at the root of a repository with no .gitignore, its entry another name: the MCP token is neither listed nor committed; the deck is a document', async () => {
    const repo = mkdtempSync(join(tmpdir(), 'presmium-dev-editing-'))
    const state = mkdtempSync(join(tmpdir(), 'presmium-dev-editing-state-'))
    made.push(repo, state)
    writeFileSync(join(repo, 'talk.md'), LECTURE)
    git(repo, ['init', '-q', '-b', 'main'])
    git(repo, ['add', '-A'])
    git(repo, ['commit', '-q', '-m', 'Initial commit'])
    const { child, route, assistant } = await dev(repo, state, 'talk.md')
    expect(existsSync(join(repo, '.presmium/server.json'))).toBe(true)
    expect(child.output()).toMatch(/git does not ignore \.presmium\/server\.json, this process's MCP token: add the line \*\*\/\.presmium\/server\.json to \.gitignore/)

    expect((await route('changes')).json.files).toEqual([])
    expect((await route('documents')).json).toMatchObject({ git: true, uncommitted: 0, single: true })
    expect((await route('changes/commit', { message: '提交' })).status).toBe(409)
    const opened = await route('source?path=talk.md')
    expect((await route('source', { path: 'talk.md', content: LECTURE.replace('alpha', 'omega'), base: opened.json.version })).status).toBe(200)
    expect((await route('changes')).json.files).toEqual([{ path: 'talk.md', kind: 'modified', added: 1, removed: 1 }])
    const committed = await route('changes/commit', { message: '把 alpha 改成 omega' })
    expect(committed.json.paths).toEqual(['talk.md'])
    expect(git(repo, ['ls-files'])).toBe('talk.md\n')

    // A document of the assistant's, whose change tasks it takes.
    const info = (await assistant('info')).json
    expect(info).toMatchObject({ changes: true, kinds: expect.arrayContaining(['chat']) })
    expect(info.home).toBeUndefined()
  }, 120_000)

  it('in no git repository: saves, and commits nothing', async () => {
    const base = mkdtempSync(join(tmpdir(), 'presmium-dev-editing-'))
    made.push(base)
    mkdirSync(join(base, 'deck'))
    writeFileSync(join(base, 'deck/lecture.md'), LECTURE)
    const { child, route, assistant } = await dev(join(base, 'deck'), base)
    expect(child.output()).toMatch(/is not in a git repository, or git ignores it: edit mode saves, but commits nothing/)

    const opened = await route('source?path=lecture.md')
    expect(opened.status).toBe(200)
    const saved = await route('source', { path: 'lecture.md', content: LECTURE.replace('alpha', 'omega'), base: opened.json.version })
    expect(saved.status).toBe(200)
    expect(readFileSync(join(base, 'deck/lecture.md'), 'utf8')).toContain('omega')
    expect((await route('documents')).json).toMatchObject({ git: false, single: true })
    expect((await route('changes')).json.files).toEqual([])
    expect((await route('changes/commit', { message: '提交' })).status).toBe(409)
    expect((await route('revisions')).json.revisions).toEqual([])
    expect((await assistant('info')).json).toMatchObject({ changes: false, kinds: [] })
  }, 120_000)
})
