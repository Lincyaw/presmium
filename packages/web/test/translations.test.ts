import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { presmium } from '@presmium/cli/testing'
import type { Finding } from '@presmium/kernel'
import { afterAll, expect, it } from 'vitest'

const FIXTURE = fileURLToPath(new URL('./fixtures/translations', import.meta.url))

const deck = mkdtempSync(join(tmpdir(), 'presmium-translations-'))
cpSync(FIXTURE, deck, { recursive: true })
afterAll(() => rmSync(deck, { recursive: true, force: true }))

async function translationFindings(): Promise<Finding[]> {
  const { code, stdout, stderr } = await presmium(deck, ['check', '--json'])
  expect(code, stderr).toBe(0)
  return (JSON.parse(stdout) as { findings: Finding[] }).findings.filter(f => f.checkId === 'presmium.translations')
}

it('reports the translation out of date once the original changes, with the new digest; written back, no more', async () => {
  expect(await translationFindings()).toEqual([])

  const original = join(deck, 'lecture.md')
  writeFileSync(original, readFileSync(original, 'utf8').replace('第一节的内容。', '第一节的内容，改过了。'))
  const [stale, ...others] = await translationFindings()
  expect(others).toEqual([])
  expect(stale!.severity).toBe('warning')
  expect(stale!.source).toEqual({ file: join(deck, 'lecture.en.md'), line: 4 })
  const translation = join(deck, 'lecture.en.md')
  const old = /digest: ([0-9a-f]{64})/.exec(readFileSync(translation, 'utf8'))![1]!
  const digest = /set translationOf\.digest to ([0-9a-f]{64})/.exec(stale!.message)?.[1]
  expect(digest, stale!.message).toBeDefined()
  expect(digest).not.toBe(old)

  writeFileSync(translation, readFileSync(translation, 'utf8').replace(old, digest!))
  expect(await translationFindings()).toEqual([])
}, 120_000)
