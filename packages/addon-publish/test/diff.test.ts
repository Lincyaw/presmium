// Runs the real `presmium-diff` (git worktrees, compiler, slides renderer and
// `slidev export`, web renderer and Playwright, pixelmatch) on git repositories
// that hold copies of ./fixtures.
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, expect, it } from 'vitest'
import { bin, command, git, removeCopies, repository } from './helpers.ts'

afterAll(removeCopies)

it('finds no difference between a commit and itself', async () => {
  const dir = repository('deck')
  const { code, stdout, stderr } = await bin('presmium-diff', dir, 'HEAD', 'main', '--json')
  expect(code, stderr).toBe(0)
  const report = JSON.parse(stdout)
  expect(report.pages.map((p: { id: string }) => p.id)).toEqual(['001-01', '001-02', '002-01', '002-02', '003-01'])
  expect(report.listed).toEqual([])
}, 240_000)

it('lists the pages of the slide that changed between two commits', async () => {
  const dir = repository('deck')
  const lecture = join(dir, 'lecture.md')
  writeFileSync(lecture, readFileSync(lecture, 'utf8').replace('Always visible.', 'Always visible, now with a longer sentence.'))
  git(dir, 'commit', '-q', '-am', 'edit slide 2')

  const { code, stdout, stderr } = await bin('presmium-diff', dir, 'HEAD~1', 'HEAD')
  expect(code, stderr).toBe(1)
  expect(stdout).toContain('002-01  changed')
  expect(stdout).toContain('2 of 5 pages differ; report: .presmium/diff/report.md')

  const report = JSON.parse(readFileSync(join(dir, '.presmium/diff/report.json'), 'utf8'))
  expect(report.listed.map((p: { slide: number, step: number }) => [p.slide, p.step])).toEqual([[2, 0], [2, 1]])
  expect(readFileSync(join(dir, '.presmium/diff/report.md'), 'utf8')).toContain('![diff](diff/002-01.png)')
  expect(existsSync(join(dir, '.presmium/diff/diff/002-01.png'))).toBe(true)
  // The temporary worktrees are gone and the report directory ignores itself.
  expect(git(dir, 'worktree', 'list').split('\n')).toHaveLength(1)
  expect(git(dir, 'status', '--porcelain')).toBe('')
}, 240_000)

// fixtures/upgrade: a pnpm workspace whose deck uses an addon of the workspace; a commit changes the addon's CSS.
it('with --install renders each commit with the dependencies of its own lockfile; without, it warns that it does not', async () => {
  const dir = repository('upgrade', 'deck/lecture.md', root => command(root, 'pnpm', 'install', '--prefer-offline'))
  expect(existsSync(join(dir, 'pnpm-lock.yaml'))).toBe(true)
  const style = join(dir, 'addon/style.css')
  writeFileSync(style, readFileSync(style, 'utf8').replace('rgb(20, 20, 20)', 'rgb(200, 30, 30)'))
  git(dir, 'commit', '-q', '-am', 'addon: red slide titles')
  const deck = join(dir, 'deck')

  const installed = await bin('presmium-diff', deck, 'HEAD~1', 'HEAD', '--install', '--json')
  expect(installed.code, installed.stderr).toBe(1)
  expect(JSON.parse(installed.stdout).listed.map((p: { id: string }) => p.id)).toEqual(['001-01'])

  const shared = await bin('presmium-diff', deck, 'HEAD~1', 'HEAD', '--json')
  expect(shared.code, shared.stderr).toBe(0)
  expect(JSON.parse(shared.stdout).listed).toEqual([])
  expect(shared.stderr).toContain('warning: changes outside the deck are not rendered from their commit: addon/style.css; --install renders each commit with its own dependencies')
}, 360_000)

// fixtures/web: a deck with the web form only, under a base of its own (R-93), whose narration has a block for the web form.
it('renders the web form of both commits, and lists the web page whose {only} web content changed (P-53)', async () => {
  const dir = repository('web')
  const lecture = join(dir, 'lecture.md')
  writeFileSync(lecture, readFileSync(lecture, 'utf8').replace('the first version', 'the second version, with more words'))
  git(dir, 'commit', '-q', '-am', 'edit the web-only block')

  const { code, stdout, stderr } = await bin('presmium-diff', dir, 'HEAD~1', 'HEAD', '--json')
  expect(code, stderr).toBe(1)
  const report = JSON.parse(stdout)
  expect(report.pages.map((p: { id: string }) => p.id)).toEqual(['web/index', 'web/present-notes', 'web/present-steps'])
  expect(report.listed.map((p: { id: string }) => p.id)).toEqual(['web/index'])
  expect(existsSync(join(dir, '.presmium/diff/diff/web/index.png'))).toBe(true)
  expect(readFileSync(join(dir, '.presmium/diff/report.md'), 'utf8')).toContain('![diff](diff/web/index.png)')
}, 360_000)
