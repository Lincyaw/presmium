import { randomBytes } from 'node:crypto'
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Child } from './helpers.ts'
import { commits, FIXTURES, git, message, presmiumProcess, raw, remove, waitFor, workspace } from './helpers.ts'

describe('document operations', () => {
  let dir: string
  let serve: Child
  let url: string
  const route = (path: string) => `${url}/__presmium/presmium.workspace/${path}`
  const operate = (body: Record<string, unknown>) => raw(route('documents'), { json: body })

  beforeAll(async () => {
    dir = workspace('documents', join(FIXTURES, 'documents'))
    mkdirSync(join(dir, '.git/hooks'), { recursive: true })
    writeFileSync(join(dir, '.git/hooks/pre-commit'), `#!/bin/sh\necho ran > "${join(dir, 'hook-ran')}"\n`)
    chmodSync(join(dir, '.git/hooks/pre-commit'), 0o755)
    serve = presmiumProcess(dir, ['serve', '--port', '0'])
    url = (await waitFor(serve, /^serve {2}(http\S+)$/m))[1]!
  }, 120_000)
  afterAll(async () => {
    await serve?.stop()
    remove(dir)
  })

  it('creates, renames, copies and deletes documents, one commit each, without running the hooks', async () => {
    const before = commits(dir)
    const listed = await raw(route('documents'))
    expect(listed.json<{ documents: { dir: string }[], templates: string[] }>()).toMatchObject({ documents: [{ dir: 'guide' }, { dir: 'intro' }], templates: ['default'] })

    const created = await operate({ op: 'create', dir: 'week3', title: '第三周' })
    expect(created.status).toBe(200)
    expect(created.json()).toMatchObject({ dir: 'week3' })
    expect(readFileSync(join(dir, 'week3/lecture.md'), 'utf8')).toContain('title: "第三周"')
    expect(message(dir)).toMatch(/^Create document week3\n[\s\S]*\nPresmium-Origin: document create week3\nCo-authored-by: local author </m)
    expect(git(dir, ['show', '--name-only', '--format=', 'HEAD']).trim()).toBe('week3/lecture.md')

    const renamed = await operate({ op: 'rename', dir: 'guide', to: 'manual' })
    expect(renamed.status).toBe(200)
    const rename = renamed.json<{ revision: { id: string } }>().revision.id
    expect(existsSync(join(dir, 'guide'))).toBe(false)
    expect(readFileSync(join(dir, 'manual/lecture.md'), 'utf8')).toContain('[导论](../intro/lecture.md)')
    const intro = readFileSync(join(dir, 'intro/lecture.md'), 'utf8')
    expect(intro).toContain('[指南](../manual/lecture.md)')
    expect(intro).toContain('[指南的图](../manual/img/plan.svg)')
    expect(message(dir)).toMatch(/^Rename document guide to manual\n[\s\S]*Presmium-Origin: document rename guide manual$/m)
    expect(git(dir, ['show', '--name-only', '--no-renames', '--format=', 'HEAD']).trim().split('\n').sort()).toEqual(['guide/img/plan.svg', 'guide/lecture.md', 'intro/lecture.md', 'manual/img/plan.svg', 'manual/lecture.md'])

    expect((await operate({ op: 'copy', dir: 'intro', to: 'intro-copy' })).status).toBe(200)
    expect(readFileSync(join(dir, 'intro-copy/lecture.md'), 'utf8')).toContain('[指南](../manual/lecture.md)')
    expect(message(dir)).toMatch(/^Copy document intro to intro-copy\n[\s\S]*Presmium-Origin: document copy intro intro-copy$/m)
    expect((await operate({ op: 'delete', dir: 'week3' })).status).toBe(200)
    expect(existsSync(join(dir, 'week3'))).toBe(false)
    expect(message(dir)).toMatch(/^Delete document week3\n[\s\S]*Presmium-Origin: document delete week3$/m)

    expect(commits(dir)).toBe(before + 4)
    expect(git(dir, ['status', '--porcelain']).trim()).toBe('')
    expect(existsSync(join(dir, 'hook-ran'))).toBe(false)

    const history = await raw(route('revisions'))
    const revisions = history.json<{ revisions: { message: string, operation?: Record<string, string> }[] }>().revisions
    expect(revisions.map(r => r.message.split('\n')[0])).toEqual([
      'Delete document week3',
      'Copy document intro to intro-copy',
      'Rename document guide to manual',
      'Create document week3',
    ])
    expect(revisions.map(r => r.operation)).toEqual([
      { op: 'delete', dir: 'week3' },
      { op: 'copy', dir: 'intro', to: 'intro-copy' },
      { op: 'rename', dir: 'guide', to: 'manual' },
      { op: 'create', dir: 'week3' },
    ])
    expect((await operate({ op: 'create', dir: '../outside' })).status).toBe(400)

    const reverted = await raw(route('revisions/revert'), { json: { id: rename } })
    expect(reverted.status).toBe(200)
    expect(reverted.json()).toMatchObject({ ok: true })
    expect(existsSync(join(dir, 'guide/lecture.md'))).toBe(true)
    expect(existsSync(join(dir, 'manual'))).toBe(false)
    expect(readFileSync(join(dir, 'intro/lecture.md'), 'utf8')).toContain('[指南](../guide/lecture.md)')
    expect(message(dir)).toMatch(new RegExp(`^Revert "Rename document guide to manual"\\n\\nThis reverts commit ${rename}\\.\\n\\nPresmium-Origin: document rename guide manual\\nPresmium-Revert: ${rename}`, 'm'))
    expect(existsSync(join(dir, 'hook-ran'))).toBe(false)

    const undo = git(dir, ['rev-parse', 'HEAD']).trim()
    expect((await raw(route('revisions/revert'), { json: { id: undo } })).status).toBe(200)
    expect(existsSync(join(dir, 'manual/lecture.md'))).toBe(true)
    const redo = git(dir, ['rev-parse', 'HEAD']).trim()
    expect((await raw(route('revisions/revert'), { json: { id: redo } })).status).toBe(200)
    expect(existsSync(join(dir, 'guide/lecture.md'))).toBe(true)
    const again = git(dir, ['rev-parse', 'HEAD']).trim()
    const labels = (await raw(route('revisions'))).json<{ revisions: { id: string, reverts?: string, redo?: boolean, operation?: Record<string, string> }[] }>().revisions.slice(0, 4)
    expect(labels.map(r => [r.id, r.reverts, r.redo, r.operation?.op])).toEqual([
      [again, redo, undefined, 'rename'],
      [redo, undo, true, 'rename'],
      [undo, rename, undefined, 'rename'],
      [expect.any(String), undefined, undefined, 'delete'],
    ])
  })

  it('reports the files a revert conflicts with, and leaves the work tree as it was', async () => {
    const created = (await operate({ op: 'create', dir: 'week4', title: '第四周' })).json<{ revision: { id: string } }>().revision.id
    writeFileSync(join(dir, 'week4/lecture.md'), `${readFileSync(join(dir, 'week4/lecture.md'), 'utf8')}\n作者后来加的一段。\n`)
    git(dir, ['commit', '-q', '-am', 'An author edits week4'])
    const head = git(dir, ['rev-parse', 'HEAD']).trim()
    const content = readFileSync(join(dir, 'week4/lecture.md'), 'utf8')

    const reverted = await raw(route('revisions/revert'), { json: { id: created } })
    expect(reverted.status).toBe(409)
    expect(reverted.json()).toEqual({ ok: false, conflicts: ['week4/lecture.md'] })
    expect(git(dir, ['rev-parse', 'HEAD']).trim()).toBe(head)
    expect(git(dir, ['status', '--porcelain']).trim()).toBe('')
    expect(readFileSync(join(dir, 'week4/lecture.md'), 'utf8')).toBe(content)
  })

  it('copies the recordings, drawings, assets, synthesized speech and locks of .presmium/ byte for byte, not what is generated', async () => {
    const kept: Record<string, Buffer> = {
      '.presmium/freeze/python/run-1.json': Buffer.from('{"stdout":"42\\n"}\n'),
      '.presmium/drawings/merge.json': Buffer.from('{"strokes":[]}\n'),
      '.presmium/assets/remote-image.png': randomBytes(512),
      '.presmium/speech/zh/segment-1.ogg': randomBytes(4096),
      '.presmium/speech.lock.json': Buffer.from('{"segments":{}}\n'),
      '.presmium/anchors.lock.json': Buffer.from('{"anchors":{}}\n'),
    }
    for (const [path, content] of Object.entries(kept)) {
      mkdirSync(dirname(join(dir, 'intro', path)), { recursive: true })
      writeFileSync(join(dir, 'intro', path), content)
    }
    mkdirSync(join(dir, 'intro/.presmium/web'), { recursive: true })
    writeFileSync(join(dir, 'intro/.presmium/web/index.md'), 'generated\n')

    expect((await operate({ op: 'copy', dir: 'intro', to: 'intro-two' })).status).toBe(200)
    for (const [path, content] of Object.entries(kept)) expect(readFileSync(join(dir, 'intro-two', path)).equals(content), path).toBe(true)
    expect(existsSync(join(dir, 'intro-two/.presmium/web'))).toBe(false)
  })

  it('names a listed directory with a space whole in the history (its word of Presmium-Origin percent-encoded)', async () => {
    mkdirSync(join(dir, 'week 1'))
    writeFileSync(join(dir, 'week 1/lecture.md'), '---\ntitle: 第一周\n---\n\n## 一\n')
    git(dir, ['add', '-A'])
    git(dir, ['commit', '-q', '-m', 'An author adds week 1'])
    expect((await operate({ op: 'delete', dir: 'week 1' })).status).toBe(200)
    expect(message(dir)).toMatch(/^Presmium-Origin: document delete week%201$/m)
    const [latest] = (await raw(route('revisions'))).json<{ revisions: { operation?: Record<string, string> }[] }>().revisions
    expect(latest!.operation).toEqual({ op: 'delete', dir: 'week 1' })
  })
})
