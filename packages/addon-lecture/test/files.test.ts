// The lecture's routes read the deck's files as they open them (WP-89d, F-12; `openInDeck` in src/node/store.ts),
// under the real `presmium dev`: a symbolic link in place of a medium or a clip gives 404, never what it names
// (here a file outside the deck); a FIFO in place of a track, a medium or a clip is not listed or gives 404 at
// once, and the server goes on answering, as it does not wait for a writer.
import { execFileSync, spawn } from 'node:child_process'
import type { ChildProcess } from 'node:child_process'
import { closeSync, constants, mkdirSync, mkdtempSync, openSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { PRESMIUM_BIN } from '@presmium/cli/testing'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { formatTrack } from '../src/domain/index.ts'
import type { LectureTrack } from '../src/domain/index.ts'

const ADDON = fileURLToPath(new URL('..', import.meta.url))
const CLIP = `${'c'.repeat(32)}.wav`
const OTHER_CLIP = `${'d'.repeat(32)}.wav`
const SECRET = 'NOT-FOR-THE-ROUTES'

const TRACK: LectureTrack = {
  track: 1,
  id: 'rec',
  doc: 'lecture.md',
  lang: 'zh-CN',
  ir: { hash: '' },
  voice: { kind: 'recorded' },
  audio: [{ section: 'intro', start: 0, src: 'audio/intro.ogg', duration: 1 }, { section: 'intro', start: 1, src: 'audio/linked.ogg', duration: 1 }],
  blocks: {},
  utterances: [{ id: 'u1', t: 0, d: 500, text: '一句。', section: 'intro', step: 0, clip: CLIP }],
  events: [[0, 'go', { section: 'intro', step: 0 }]],
}

let dir: string
let outside: string
let dev: ChildProcess | undefined
let server: string
const fifos: string[] = []

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), 'presmium-lecture-files-'))
  outside = mkdtempSync(join(tmpdir(), 'presmium-lecture-outside-'))
  writeFileSync(join(outside, 'secret.txt'), SECRET)
  const files: Record<string, string> = {
    'lecture.md': `---\nplugins:\n  - ${ADDON}\n---\n\n(intro)=\n# 开场\n\n一句。\n`,
    'lectures/rec/track.json': formatTrack(TRACK),
    'lectures/rec/audio/intro.ogg': 'OggIntro',
    [`.presmium/speech/${CLIP}`]: 'CLIP',
  }
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, path)), { recursive: true })
    writeFileSync(join(dir, path), text)
  }
  symlinkSync(join(outside, 'secret.txt'), join(dir, 'lectures/rec/audio/linked.ogg'))
  symlinkSync(join(outside, 'secret.txt'), join(dir, '.presmium/speech', OTHER_CLIP))
  const env: NodeJS.ProcessEnv = { ...process.env }
  delete env.NODE_ENV
  for (const name of Object.keys(env)) if (name.startsWith('PRESMIUM_')) delete env[name]
  dev = spawn(process.execPath, [PRESMIUM_BIN, 'dev', '--to', 'notebook'], { cwd: dir, env, stdio: ['ignore', 'pipe', 'pipe'] })
  server = await new Promise<string>((done, fail) => {
    let output = ''
    const read = (chunk: Buffer) => {
      output += chunk
      const match = /^server {2}(http\S+)$/m.exec(output)
      if (match) done(match[1]!)
    }
    dev!.stdout!.on('data', read)
    dev!.stderr!.on('data', read)
    dev!.once('exit', code => fail(new Error(`presmium dev exited (${code}): ${output}`)))
  })
}, 120_000)

afterAll(async () => {
  // A server that waits gets its writer, so the suite can end.
  for (const file of fifos) {
    try {
      closeSync(openSync(file, constants.O_WRONLY | constants.O_NONBLOCK))
    } catch {
      // No reader waits.
    }
  }
  if (dev && dev.exitCode === null) {
    const exited = new Promise(done => dev!.once('exit', done))
    dev.kill('SIGTERM')
    await exited
  }
  for (const path of [dir, outside]) if (path) rmSync(path, { recursive: true, force: true })
})

/** A route's answer, which must come within 10 s (a server waiting on a FIFO answers none). */
async function get(path: string): Promise<{ status: number, text: string }> {
  const answer = fetch(`${server}/__presmium/presmium.lecture/${path}`).then(async response => ({ status: response.status, text: await response.text() }))
  return Promise.race([answer, new Promise<never>((_, reject) => setTimeout(() => reject(new Error(`no answer to ${path} in 10 s`)), 10_000))])
}

it('gives 404 for a link in place of a medium or a clip, and for a FIFO in place of one, which it does not list as a track; it answers on', async () => {
  expect(await get('tracks/rec/audio/intro.ogg')).toEqual({ status: 200, text: 'OggIntro' })
  expect(await get(`tracks/rec/clips/${CLIP}`)).toEqual({ status: 200, text: 'CLIP' })
  for (const path of ['tracks/rec/audio/linked.ogg', `tracks/rec/clips/${OTHER_CLIP}`]) {
    const linked = await get(path)
    expect(linked.status, path).toBe(404)
    expect(linked.text).not.toContain(SECRET)
  }

  const fifo = (file: string) => {
    rmSync(file, { force: true })
    mkdirSync(dirname(file), { recursive: true })
    execFileSync('mkfifo', [file])
    fifos.push(file)
  }
  fifo(join(dir, 'lectures/evil/track.json'))
  fifo(join(dir, 'lectures/rec/audio/intro.ogg'))
  fifo(join(dir, '.presmium/speech', CLIP))
  const listed = await get('tracks')
  expect(listed.status, listed.text).toBe(200)
  expect((JSON.parse(listed.text) as { id: string }[]).map(track => track.id)).toEqual(['rec'])
  expect((await get('tracks/rec/audio/intro.ogg')).status).toBe(404)
  expect((await get(`tracks/rec/clips/${CLIP}`)).status).toBe(404)
  expect((await get('tracks/rec')).status).toBe(200)
}, 60_000)
