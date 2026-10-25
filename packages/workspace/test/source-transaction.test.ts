import { existsSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { SourceAnswer, SourceTransactionAnswer, SourceTransactionChange } from '@lincyaw/kernel'
import { cleanEnv, commits, FIXTURES, git, presmiumProcess, raw, remove, waitFor, workspace } from './helpers.ts'
import type { Child } from './helpers.ts'

describe('one versioned source transaction', () => {
  let dir: string
  let home: string
  let serve: Child
  let url: string
  const read = async (path: string) => (await raw(`${url}/__presmium/presmium.workspace/source?path=${encodeURIComponent(path)}`, { headers: { 'Presmium-Document': 'guide' } })).json<SourceAnswer>()
  const save = (changes: SourceTransactionChange[], document = 'guide') => raw(`${url}/__presmium/presmium.workspace/source/transaction`, { headers: { 'Presmium-Document': document }, json: { changes, message: '新增动画内容' } })

  beforeAll(async () => {
    dir = workspace('source-transaction', join(FIXTURES, 'documents'))
    home = `${dir}.home`
    mkdirSync(home)
    serve = presmiumProcess(dir, ['serve', '--port', '0'], cleanEnv({ HOME: home, XDG_CACHE_HOME: join(home, 'cache'), XDG_STATE_HOME: join(home, 'state'), XDG_CONFIG_HOME: join(home, 'config') }))
    url = (await waitFor(serve, /^serve {2}(http\S+)$/m))[1]!
  }, 120_000)
  afterAll(async () => {
    await serve?.stop()
    remove(dir)
    remove(home)
  })

  it('creates code and its document reference in one revision that one undo removes together', async () => {
    const opened = await read('guide/lecture.md')
    const original = opened.content
    const codePath = 'guide/scenes/transaction.ts'
    const code = 'export default function Scene() { return "created" }\n'
    const content = `${original}\n[新增动画](scenes/transaction.ts)\n`
    writeFileSync(join(dir, 'guide/unrelated.md'), 'Unrelated draft\n')
    const count = commits(dir)
    const answer = await save([{ path: codePath, content: code, base: null }, { path: opened.path, content, base: opened.version }])
    expect(answer.status, answer.text).toBe(200)
    const saved = answer.json<SourceTransactionAnswer>()
    expect(saved.versions.map(file => file.path)).toEqual([codePath, opened.path])
    expect(saved.revision?.files).toEqual(['guide/lecture.md', codePath])
    expect(commits(dir)).toBe(count + 1)
    expect(readFileSync(join(dir, codePath), 'utf8')).toBe(code)
    expect((await read(opened.path)).version).toBe(saved.versions[1]!.version)
    expect(git(dir, ['status', '--porcelain'])).toBe('?? guide/unrelated.md\n')
    const undone = await raw(`${url}/__presmium/presmium.workspace/history/undo`, { headers: { 'Presmium-Document': 'guide' }, json: { expect: saved.revision!.id } })
    expect(undone.status, undone.text).toBe(200)
    expect(existsSync(join(dir, codePath))).toBe(false)
    expect(readFileSync(join(dir, opened.path), 'utf8')).toBe(original)
    expect(readFileSync(join(dir, 'guide/unrelated.md'), 'utf8')).toBe('Unrelated draft\n')
    rmSync(join(dir, 'guide/unrelated.md'))
  })

  it('validates the whole batch and restores files and the index when its real git commit fails', async () => {
    const opened = await read('guide/lecture.md')
    const newPath = 'guide/scenes/refused.ts'
    const next = `${opened.content}\nA changed reference.\n`
    const pair = (path = newPath): SourceTransactionChange[] => [{ path, content: 'export default {}\n', base: null }, { path: opened.path, content: next, base: opened.version }]
    const beforeHead = git(dir, ['rev-parse', 'HEAD'])
    const stale = await save([{ path: newPath, content: '', base: null }, { path: opened.path, content: next, base: 'stale' }])
    expect(stale.status, stale.text).toBe(409)
    expect(existsSync(join(dir, newPath))).toBe(false)
    expect((await save([{ path: 'guide/fresh.ts', content: '', base: null }, { path: 'guide/fresh.ts', content: '', base: null }])).status).toBe(400)
    expect((await save([{ path: 'guide/fresh', content: '', base: null }, { path: 'guide/fresh/child.ts', content: '', base: null }])).status).toBe(400)
    expect((await save([{ path: 'guide/new.ts', content: '', base: null }, { path: 'intro/new.ts', content: '', base: null }], '')).status).toBe(400)
    expect((await save(pair('guide/../intro/new.ts'))).status).toBe(400)
    expect((await save(pair('intro/from-guide.ts'))).status).toBe(403)
    symlinkSync(join(dir, 'intro'), join(dir, 'guide/linked'))
    try {
      expect((await save(pair('guide/linked/new.ts'))).status).toBe(403)
      expect(existsSync(join(dir, 'intro/new.ts'))).toBe(false)
    } finally { rmSync(join(dir, 'guide/linked')) }
    const gitignore = join(dir, '.gitignore')
    const originalIgnore = readFileSync(gitignore, 'utf8')
    const ignoredPath = 'guide/scenes/ignored.ts'
    writeFileSync(gitignore, `${originalIgnore}\n${ignoredPath}\n`)
    try {
      const ignored = await save(pair(ignoredPath))
      expect(ignored.status, ignored.text).toBe(409)
      expect(ignored.json()).toMatchObject({ ignored: [ignoredPath] })
      expect(existsSync(join(dir, ignoredPath))).toBe(false)
      expect(readFileSync(join(dir, opened.path), 'utf8')).toBe(opened.content)
      expect(git(dir, ['rev-parse', 'HEAD'])).toBe(beforeHead)
    } finally { writeFileSync(gitignore, originalIgnore) }
    const index = readFileSync(join(dir, '.git/index'))
    // Git can stage the transaction, but cannot publish its commit while this real ref is locked.
    const refLock = join(dir, '.git/refs/heads/main.lock')
    writeFileSync(refLock, '')
    try {
      const failed = await save(pair())
      expect(failed.status, failed.text).toBe(500)
    } finally { rmSync(refLock, { force: true }) }
    expect(readFileSync(join(dir, '.git/index'))).toEqual(index)
    expect(readFileSync(join(dir, opened.path), 'utf8')).toBe(opened.content)
    expect(existsSync(join(dir, newPath))).toBe(false)
    expect(git(dir, ['rev-parse', 'HEAD'])).toBe(beforeHead)
    expect(git(dir, ['status', '--porcelain'])).toBe('')
  })
})
