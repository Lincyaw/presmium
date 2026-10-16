// The publication checks of `presmium check` (WP-87, P-54, docs/ir.md 2.11): a broken local link, a `#fragment`
// that names nothing, a `{csv-table}` with `:file:` (myst-parser's `mystDirectiveError`) and text that
// `checks.forbid` forbids, each an error on its own line; a link that only the slides show, to a block only the
// web form shows, is reported for the slides alone; a link to a place another document lacks is reported; without
// lychee, `--external-links` says so.
import { spawnSync } from 'node:child_process'
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, expect, it } from 'vitest'
import { presmium } from './helpers.ts'
import { ROOT } from './serve-helpers.ts'

const DECK = join(ROOT, 'e2e/fixtures/publish-checks/checks')

const copies: string[] = []
afterAll(() => copies.forEach(dir => rmSync(dir, { recursive: true, force: true })))

interface Finding { checkId: string, severity: string, message: string, source: { file: string, line: number } }

it('reports a broken link, #nowhere, {csv-table} with :file: and a forbidden word on their lines, and a link only the slides break in the slides alone', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'presmium-publish-checks-'))
  copies.push(dir)
  cpSync(DECK, dir, { recursive: true })
  const lines = readFileSync(join(dir, 'lecture.md'), 'utf8').split('\n')
  const line = (text: string) => lines.findIndex(l => l.includes(text)) + 1

  const checked = await presmium(dir, ['check', '--json', '--external-links'])
  expect(checked.code).toBe(1)
  const { findings } = JSON.parse(checked.stdout) as { findings: Finding[] }
  const errors = findings.filter(f => f.severity === 'error').map(f => ({ checkId: f.checkId, line: f.source.line, message: f.message }))
  expect(errors).toEqual([
    { checkId: 'presmium.links', line: line('data/missing.csv'), message: expect.stringContaining('data/missing.csv: no such file') },
    { checkId: 'presmium.links', line: line('#nowhere'), message: expect.stringContaining('#nowhere is no section') },
    { checkId: 'presmium.directive', line: line('{csv-table}'), message: expect.stringMatching(/\{csv-table\}.*takes no :file:/) },
    { checkId: 'presmium.links', line: line('#web-note'), message: expect.stringMatching(/#web-note is no section.*\(in slides\)$/) },
    { checkId: 'presmium.forbid', line: line('T-123'), message: expect.stringContaining('"T-123" matches T-\\d{3}') },
  ])
  // The links that work (a file of the deck, a section's label, another document's place) are not reported.
  expect(findings.map(f => f.message).join('\n')).not.toMatch(/starter\.py|#tables|#later/)
  if (spawnSync('lychee', ['--version']).error) {
    expect(findings).toContainEqual(expect.objectContaining({ checkId: 'presmium.links', severity: 'info', message: expect.stringContaining('lychee is not installed') }))
  }

  // A place another document of the workspace does not have.
  writeFileSync(join(dir, 'lecture.md'), lines.join('\n').replace('other/lecture.md#later', 'other/lecture.md#sooner'))
  const again = JSON.parse((await presmium(dir, ['check', '--json'])).stdout) as { findings: Finding[] }
  expect(again.findings).toContainEqual(expect.objectContaining({
    checkId: 'presmium.links',
    severity: 'error',
    message: 'other/lecture.md#sooner: no section, block, label or heading of other/lecture.md has the id sooner',
    source: expect.objectContaining({ line: line('other/lecture.md#later') }),
  }))
})
