// Lecture tracks with the real CLI (WP-77, docs/ir.md section 9): `presmium check` reports the events
// of a recorded lecture whose block is gone, with their time (P-130); `presmium build --to lecture`
// exports captions in the track's language and in a translation, and marks a translation whose
// original changed since as stale (P-137).
import { createHash } from 'node:crypto'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { IRDocument } from '@presmium/kernel'
import { presmium } from '@presmium/cli/testing'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { formatTrack, irHash, referencedBlocks } from '../src/domain/index.ts'
import type { LectureTrack } from '../src/domain/index.ts'

const ADDON = fileURLToPath(new URL('..', import.meta.url))
const CODE = '(merge-code)=\n```python\ndef merge(ids, pair, idx):\n    out = []\n    return out\n```'

const deck = (code: string) => `---
title: 讲授轨
plugins:
  - ${ADDON}
---

(intro)=
# 开场

第一节。

(merge)=
## 合并

:::{slide}
:reveal:
第一步
:::

${code}

## 结尾

最后一节。
`

const sha256 = (text: string) => `sha256:${createHash('sha256').update(text).digest('hex')}`

/** A recorded lecture of the deck: two moves, a spotlight and a pointer on the code, two utterances with English translations. */
function track(doc: IRDocument): LectureTrack {
  const events: LectureTrack['events'] = [
    [0, 'go', { section: 'intro', step: 0, view: 'present' }],
    [3000, 'go', { section: 'merge', step: 0, view: 'present' }],
    [4000, 'go', { section: 'merge', step: 1, view: 'present' }],
    [5200, 'spot', { block: 'merge/merge-code' }],
    [5600, 'point', { block: 'merge/merge-code', path: [[0, 0.2, 0.3], [120, 0.4, 0.5]] }],
  ]
  return {
    track: 1,
    id: 'demo',
    doc: 'lecture.md',
    lang: 'zh-CN',
    ir: { hash: irHash(doc) },
    voice: { kind: 'recorded', speaker: '张老师' },
    blocks: referencedBlocks(doc, events),
    utterances: [
      { id: 'u1', t: 500, d: 2000, text: '我们先看开场', section: 'intro', step: 0, translations: { en: { text: 'First, the opening', source: sha256('我们先看开场') } } },
      { id: 'u2', t: 3200, d: 2400, text: '再看合并函数', section: 'merge', step: 0, translations: { en: { text: 'Then the merge function', source: sha256('再看合并函数') } } },
    ],
    events,
  }
}

let dir: string
let doc: IRDocument

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), 'presmium-lecture-'))
  writeFileSync(join(dir, 'lecture.md'), deck(CODE))
  const { code, stdout, stderr } = await presmium(dir, ['ir', '--out', 'ir.json'])
  expect(code, stdout + stderr).toBe(0)
  doc = JSON.parse(readFileSync(join(dir, 'ir.json'), 'utf8')) as IRDocument
  mkdirSync(join(dir, 'lectures/demo'), { recursive: true })
  writeFileSync(join(dir, 'lectures/demo/track.json'), formatTrack(track(doc)))
}, 120_000)

afterAll(() => {
  if (dir) rmSync(dir, { recursive: true, force: true })
})

interface Finding { checkId: string, severity: string, message: string, source?: { file: string, line?: number } }

async function lectureFindings(): Promise<Finding[]> {
  const { stdout } = await presmium(dir, ['check', '--json'])
  return (JSON.parse(stdout) as { findings: Finding[] }).findings.filter(f => f.checkId === 'presmium.lecture')
}

describe('presmium check (P-130)', () => {
  it('reports the events whose block is gone, with their time', async () => {
    expect(await lectureFindings()).toEqual([])

    writeFileSync(join(dir, 'lecture.md'), deck(''))
    const findings = await lectureFindings()
    const file = join(dir, 'lectures/demo/track.json')
    expect(findings).toEqual([
      expect.objectContaining({ severity: 'warning', message: expect.stringMatching(/^lecture demo at 0:05 \(5200 ms\): spot on merge\/merge-code, .*\(lost\)$/), source: { file, line: 19 } }),
      expect.objectContaining({ severity: 'warning', message: expect.stringMatching(/^lecture demo at 0:05 \(5600 ms\): point on merge\/merge-code, .*\(lost\)$/), source: { file, line: 20 } }),
    ])
    writeFileSync(join(dir, 'lecture.md'), deck(CODE))
  }, 120_000)
})

describe('presmium build --to lecture (P-137)', () => {
  it('exports captions in both languages, and marks a translation whose original changed as stale', async () => {
    const built = await presmium(dir, ['build', '--to', 'lecture'])
    expect(built.code, built.stdout + built.stderr).toBe(0)
    const out = join(dir, 'dist/lecture')
    expect(readFileSync(join(out, 'demo/captions.zh-CN.vtt'), 'utf8')).toBe('WEBVTT\n\nu1\n00:00:00.500 --> 00:00:02.500\n我们先看开场\n\nu2\n00:00:03.200 --> 00:00:05.600\n再看合并函数\n')
    expect(readFileSync(join(out, 'demo/captions.en.vtt'), 'utf8')).toBe('WEBVTT\n\nu1\n00:00:00.500 --> 00:00:02.500\nFirst, the opening\n\nu2\n00:00:03.200 --> 00:00:05.600\nThen the merge function\n')
    expect(readFileSync(join(out, 'demo/chapters.vtt'), 'utf8')).toBe('WEBVTT\n\n00:00:00.000 --> 00:00:03.000\n开场\n\n00:00:03.000 --> 00:00:05.600\n合并\n')
    expect(JSON.parse(readFileSync(join(out, 'index.json'), 'utf8'))).toEqual([expect.objectContaining({ id: 'demo', lang: 'zh-CN', captions: ['zh-CN', 'en'] })])
    expect(built.stdout + built.stderr).not.toContain('stale')

    // The second sentence is said differently now; its English translation was made from the old one.
    const edited = track(doc)
    edited.utterances[1]!.text = '再来看合并函数'
    writeFileSync(join(dir, 'lectures/demo/track.json'), formatTrack(edited))
    const again = await presmium(dir, ['build', '--to', 'lecture'])
    expect(again.code, again.stdout + again.stderr).toBe(0)
    expect(again.stdout + again.stderr).toContain('lecture demo: the en translation of u2 is stale')
    const english = readFileSync(join(out, 'demo/captions.en.vtt'), 'utf8')
    expect(english).toContain('NOTE stale: the original of u2 changed after it was translated\n\nu2\n00:00:03.200 --> 00:00:05.600\nThen the merge function')
    expect(readFileSync(join(out, 'demo/captions.zh-CN.vtt'), 'utf8')).toContain('再来看合并函数')
  }, 180_000)
})
