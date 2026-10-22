import { copyFileSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { presmium } from '@lincyaw/cli/testing'
import { afterAll, expect, it } from 'vitest'

const ADDON = fileURLToPath(new URL('..', import.meta.url))
const NOTEBOOK = fileURLToPath(new URL('../../render-notebook', import.meta.url))

const DECK = `---
lang: zh-CN
plugins:
  - ${ADDON}
renderers:
  notebook:
    package: ${NOTEBOOK}
---

(film)=
## 影片

前面一段。

\`\`\`{video} ${join(ADDON, 'media/clip.webm')}
:controls:
:poster: films/poster.png
:captions: en=films/loop.en.vtt, zh-CN=films/loop.zh.vtt
:captions-default: en
智能体环路的一轮
\`\`\`
`

const dirs: string[] = []
afterAll(() => dirs.forEach(dir => rmSync(dir, { recursive: true, force: true })))

const vtt = (text: string) => `WEBVTT\n\n00:00.000 --> 00:03.000\n${text}\n`

function deck(text: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'presmium-media-'))
  dirs.push(dir)
  mkdirSync(join(dir, 'films'))
  copyFileSync(join(ADDON, 'media/spinner.png'), join(dir, 'films/poster.png'))
  writeFileSync(join(dir, 'films/loop.en.vtt'), vtt('One turn of the agent loop.'))
  writeFileSync(join(dir, 'films/loop.zh.vtt'), vtt('智能体环路的一轮。'))
  writeFileSync(join(dir, 'lecture.md'), text)
  return dir
}

it('writes a video with its poster and two caption tracks into the notebook, the files copied to media/', async () => {
  const dir = deck(DECK)
  const { code, stdout, stderr } = await presmium(dir, ['build', '--to', 'notebook', '--out', 'out'])
  expect(code, stdout + stderr).toBe(0)
  expect(stdout + stderr).not.toContain('warning')

  const cells = (JSON.parse(readFileSync(join(dir, 'out/notebook/lecture.ipynb'), 'utf8')) as { cells: { source: string[] }[] }).cells
  const video = cells.map(cell => cell.source.join('')).find(source => source.includes('<video'))!
  const media = readdirSync(join(dir, 'out/notebook/media'))
  const copy = (name: string) => `media/${media.find(file => file.endsWith(`-${name}`))}`
  expect(media).toEqual(expect.arrayContaining([expect.stringMatching(/^[\da-f]{8}-poster\.png$/), expect.stringMatching(/-loop\.en\.vtt$/), expect.stringMatching(/-loop\.zh\.vtt$/), expect.stringMatching(/-clip\.webm$/)]))
  expect(video).toContain(`<video controls preload="metadata" src="${copy('clip.webm')}" poster="${copy('poster.png')}">`)
  expect(video).toContain(`<track kind="captions" src="${copy('loop.en.vtt')}" srclang="en" label="英语" default>`)
  expect(video).toContain(`<track kind="captions" src="${copy('loop.zh.vtt')}" srclang="zh-CN" label="中文（中国）">`)
  expect(video).toContain('<figcaption>智能体环路的一轮</figcaption>')
})

it('fails the build when a caption file does not exist, on the line of the {video}', async () => {
  const dir = deck(DECK.replace('films/loop.zh.vtt', 'films/missing.zh.vtt'))
  const line = DECK.split('\n').findIndex(text => text.startsWith('```{video}')) + 1
  const { code, stdout, stderr } = await presmium(dir, ['build', '--to', 'notebook', '--out', 'out'])
  expect(code).toBe(1)
  expect(stdout + stderr).toMatch(new RegExp(`lecture\\.md:${line} +error +\\{video\\}: file not found: films/missing\\.zh\\.vtt`))
})
