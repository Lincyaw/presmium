import { spawn } from 'node:child_process'
import type { ChildProcess } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { IRDocument } from '@lincyaw/kernel'
import { presmium, PRESMIUM_BIN } from '@lincyaw/cli/testing'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { formatTrack, irHash, referencedBlocks } from '../src/domain/index.ts'
import type { LectureTrack } from '../src/domain/index.ts'

const ADDON = fileURLToPath(new URL('..', import.meta.url))
const SPEECH = fileURLToPath(new URL('../../addon-speech', import.meta.url))
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

function clean(extra: Record<string, string> = {}): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env }
  delete env.NODE_ENV
  for (const name of Object.keys(env)) if (name.startsWith('PRESMIUM_')) delete env[name]
  return { ...env, ...extra }
}

async function started(args: string[], cwd: string, env: NodeJS.ProcessEnv, pattern: RegExp): Promise<{ child: ChildProcess, url: string }> {
  const child = spawn(process.execPath, args, { cwd, env, stdio: ['ignore', 'pipe', 'pipe'] })
  const url = await new Promise<string>((done, fail) => {
    let output = ''
    const read = (chunk: Buffer) => {
      output += chunk
      const match = pattern.exec(output)
      if (match) done(match[1]!)
    }
    child.stdout!.on('data', read)
    child.stderr!.on('data', read)
    child.once('exit', code => fail(new Error(`${args.join(' ')} exited (${code}): ${output}`)))
  })
  return { child, url }
}

async function stop(child: ChildProcess | undefined): Promise<void> {
  if (!child || child.exitCode !== null || child.signalCode !== null) return
  const exited = new Promise(done => child.once('exit', done))
  child.kill('SIGTERM')
  await exited
}

describe('the operator\'s media policies (settings.presmium.lecture.audio, P-130)', () => {
  const PREFIX = 'https://media.example.test/lectures/'
  const SAID = '开场的录音讲解。'
  let fake: { child: ChildProcess, url: string } | undefined
  let dev: ChildProcess | undefined
  const dirs: string[] = []

  const policyDeck = (audio: string) => {
    const dir = mkdtempSync(join(tmpdir(), 'presmium-lecture-media-'))
    dirs.push(dir)
    writeFileSync(join(dir, 'presmium.workspace.yaml'), `settings:\n  presmium.lecture:\n    audio: ${audio}\n`)
    writeFileSync(join(dir, 'lecture.md'), `---\ntitle: 媒体策略\nplugins:\n  - ${ADDON}\n  - ${SPEECH}\n---\n\n(intro)=\n# 开场\n\n开场。\n`)
    return dir
  }

  beforeAll(async () => {
    fake = await started([join(SPEECH, 'bin/presmium-speech.mjs'), 'fake', '--port', '0'], tmpdir(), clean(), /^fake {2}(http\S+)$/m)
  }, 60_000)

  afterAll(async () => {
    await stop(dev)
    await stop(fake?.child)
    for (const dir of dirs) rmSync(dir, { recursive: true, force: true })
  })

  async function record(server: string): Promise<{ id: string, src: string, bytes: Buffer }> {
    const route = (path: string, init?: RequestInit) => fetch(`${server}/__presmium/presmium.lecture/${path}`, init)
    const post = (path: string, body: unknown) => route(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    const { id } = await (await post('recordings', {})).json() as { id: string }
    const { src } = await (await post(`recordings/${id}/media`, { folder: 'audio', section: 'intro', ext: 'ogg' })).json() as { src: string }
    const speech = await fetch(`${fake!.url}/audio/speech`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ input: SAID, voice: 'alpha' }) })
    const bytes = Buffer.from(await speech.arrayBuffer())
    expect((await route(`recordings/${id}/files/${src}?at=0`, { method: 'PUT', body: bytes })).status).toBe(200)
    const finished = await post(`recordings/${id}/finish`, {
      head: { doc: 'lecture.md', irHash: 'x', lang: 'zh-CN', sections: {}, voice: { kind: 'recorded' }, blocks: {} },
      recording: { events: [[0, 'go', { section: 'intro', step: 0 }]], audio: [{ section: 'intro', start: 0, src, duration: 2 }], video: [], utterances: [], duration: 2000 },
    })
    expect(finished.status, await finished.clone().text()).toBe(200)
    return { id, src, bytes }
  }

  it('url: the track keeps its media\'s paths, transcribed and played from this machine; the build names them under the URL', async () => {
    const dir = policyDeck(PREFIX)
    const server = await started([PRESMIUM_BIN, 'dev', '--to', 'notebook'], dir, clean({ PRESMIUM_SPEECH_FAKE_URL: fake!.url, PRESMIUM_SPEECH_FAKE_PROVIDER: 'Presmium fake' }), /^server {2}(http\S+)$/m)
    dev = server.child
    const route = (path: string, init?: RequestInit) => fetch(`${server.url}/__presmium/presmium.lecture/${path}`, init)
    const { id, src, bytes } = await record(server.url)
    expect(src).toBe('audio/intro.ogg')
    const stored = () => JSON.parse(readFileSync(join(dir, 'lectures', id, 'track.json'), 'utf8')) as { audio: { src: string }[], utterances: { text: string }[] }
    expect(stored().audio.map(a => a.src)).toEqual([src])
    expect(readFileSync(join(dir, 'lectures', id, '.gitignore'), 'utf8')).toContain(`published under ${PREFIX}`)

    const transcribed = await route(`editing/${id}/transcribe`, { method: 'POST' })
    expect(transcribed.status, await transcribed.clone().text()).toBe(200)
    expect(stored().utterances.map(u => u.text)).toEqual([SAID])
    const served = async () => ((await (await route(`tracks/${id}`)).json()) as { audio: { src: string }[] }).audio.map(a => a.src)
    expect(await served()).toEqual([src])
    const played = await route(`tracks/${id}/${src}`)
    expect(played.status).toBe(200)
    expect(Buffer.from(await played.arrayBuffer()).equals(bytes)).toBe(true)

    const built = await presmium(dir, ['build', '--to', 'lecture'])
    expect(built.code, built.stdout + built.stderr).toBe(0)
    const published = JSON.parse(readFileSync(join(dir, 'dist/lecture', id, 'track.json'), 'utf8')) as { audio: { src: string }[] }
    expect(published.audio.map(a => a.src)).toEqual([`${PREFIX}${id}/${src}`])
    expect(existsSync(join(dir, 'dist/lecture', id, src))).toBe(false)

    rmSync(join(dir, 'lectures', id, src))
    expect(await served()).toEqual([`${PREFIX}${id}/${src}`])
    await stop(dev)
  }, 240_000)

  it('lfs: the media go to git LFS, and the build publishes them beside the track', async () => {
    const dir = policyDeck('lfs')
    const server = await started([PRESMIUM_BIN, 'dev', '--to', 'notebook'], dir, clean(), /^server {2}(http\S+)$/m)
    dev = server.child
    const { id, src, bytes } = await record(server.url)
    await stop(dev)
    expect(readFileSync(join(dir, 'lectures', id, '.gitattributes'), 'utf8')).toBe('audio/** filter=lfs diff=lfs merge=lfs -text\nvideo/** filter=lfs diff=lfs merge=lfs -text\n')
    expect(existsSync(join(dir, 'lectures', id, '.gitignore'))).toBe(false)
    const built = await presmium(dir, ['build', '--to', 'lecture'])
    expect(built.code, built.stdout + built.stderr).toBe(0)
    expect((JSON.parse(readFileSync(join(dir, 'dist/lecture', id, 'track.json'), 'utf8')) as { audio: { src: string }[] }).audio.map(a => a.src)).toEqual([src])
    expect(readFileSync(join(dir, 'dist/lecture', id, src)).equals(bytes)).toBe(true)
  }, 240_000)
})
