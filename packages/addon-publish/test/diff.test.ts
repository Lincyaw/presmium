// Runs the real `presmium-diff` (git worktrees, `slidev export`, pixelmatch) on a
// git repository that holds a copy of ./fixtures/deck.
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, expect, it } from 'vitest'
import { bin, copyFixture, git, removeCopies } from './helpers.ts'

afterAll(removeCopies)

function repository(): string {
  const dir = copyFixture('deck')
  writeFileSync(join(dir, '.gitignore'), 'node_modules/\n')
  git(dir, 'init', '-q', '-b', 'main')
  git(dir, 'add', '-A')
  git(dir, 'commit', '-q', '-m', 'deck')
  return dir
}

it('finds no difference between a commit and itself', async () => {
  const dir = repository()
  const { code, stdout, stderr } = await bin('presmium-diff', dir, 'HEAD', 'main', '--json')
  expect(code, stderr).toBe(0)
  const report = JSON.parse(stdout)
  expect(report.pages.map((p: { id: string }) => p.id)).toEqual(['001-01', '002-01', '002-02', '003-01'])
  expect(report.listed).toEqual([])
}, 120_000)

it('lists the pages of the slide that changed between two commits', async () => {
  const dir = repository()
  const slides = join(dir, 'slides.md')
  writeFileSync(slides, readFileSync(slides, 'utf8').replace('Always visible.', 'Always visible, now with a longer sentence.'))
  git(dir, 'commit', '-q', '-am', 'edit slide 2')

  const { code, stdout, stderr } = await bin('presmium-diff', dir, 'HEAD~1', 'HEAD')
  expect(code, stderr).toBe(1)
  expect(stdout).toContain('002-01  changed')
  expect(stdout).toContain('2 of 4 pages differ; report: .presmium/diff/report.md')

  const report = JSON.parse(readFileSync(join(dir, '.presmium/diff/report.json'), 'utf8'))
  expect(report.listed.map((p: { slide: number, step: number }) => [p.slide, p.step])).toEqual([[2, 0], [2, 1]])
  expect(readFileSync(join(dir, '.presmium/diff/report.md'), 'utf8')).toContain('![diff](diff/002-01.png)')
  expect(existsSync(join(dir, '.presmium/diff/diff/002-01.png'))).toBe(true)
  // The temporary worktrees are gone and the report directory ignores itself.
  expect(git(dir, 'worktree', 'list').split('\n')).toHaveLength(1)
  expect(git(dir, 'status', '--porcelain')).toBe('')
}, 120_000)
