// Writing a recorded lecture back into the deck (WP-84; P-136, P-137): `presmium serve` on this machine (LOCAL)
// of a workspace copied from e2e/fixtures/lecture-writeback (a git repository of its own; the assistant, the
// lecture and the speech plugins installed at its root), with the deterministic test agent of the lecture
// plugin (packages/addon-lecture/test/fixtures/writeback-agent.mjs) as the operator's replacement runtime
// (provider "Test Provider"), reviewed with the assistant's git review.
//
// - In edit mode the lecture panel names the provider and hands lecture `demo` (a transcribed recording: a
//   spotlight bound to a word, a mark bound to a character) to "narration from the transcript": the agent reads
//   track_narration and writes each section's tidied draft; the review is accepted and makes one commit; the
//   narration has the cues where the actions were bound; undoing the commit brings the narration back.
// - "Translate" (English): the agent reads track_translations and writes the translations into track.json;
//   accepted, every utterance has its English translation with the digest of its text, and the lecture's
//   build exports English captions without a stale one.
// - WP-83's leftover: correcting a sentence of a synthetic lecture names the provider the operator gives its
//   engine now (`Presmium fake`), not the one the track recorded (`Old Provider`).
import { createHash } from 'node:crypto'
import { execFileSync, spawn } from 'node:child_process'
import type { ChildProcess } from 'node:child_process'
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { openDevPage, presmium } from './fixtures/deck.ts'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const FIXTURE = join(ROOT, 'e2e/fixtures/lecture-writeback')
const PRESMIUM = join(ROOT, 'packages/cli/bin/presmium.mjs')
const AGENT = join(ROOT, 'packages/addon-lecture/test/fixtures/writeback-agent.mjs')
const PLUGINS = { 'slidev-addon-assistant': 'packages/addon-assistant', 'slidev-addon-lecture': 'packages/addon-lecture', 'slidev-addon-speech': 'packages/addon-speech' }
/** This work package's ports (WP-84: 5051 to 5059). */
const PORT = 5053

test.describe.configure({ mode: 'serial', timeout: 240_000 })

function git(dir: string, args: string[]): string {
  return execFileSync('git', ['-c', 'core.hooksPath=/dev/null', '-c', 'user.name=Test', '-c', 'user.email=test@example.com', '-c', 'commit.gpgSign=false', ...args], { cwd: dir, encoding: 'utf8' })
}

/** The commits of a repository, newest first: subject and trailers. */
const commits = (dir: string) => git(dir, ['log', '--format=%H%x00%s%x00%(trailers:only)%x1e']).split('\x1e').map(entry => entry.trim()).filter(Boolean).map((entry) => {
  const [id = '', subject = '', trailers = ''] = entry.split('\0')
  return { id, subject, trailers }
})
const filesOf = (dir: string, id: string) => git(dir, ['show', '--name-only', '--format=', id]).split('\n').filter(Boolean).sort()

/** The test's environment without Vitest's or Presmium's variables or credentials, then `extra`. */
function clean(extra: Record<string, string> = {}): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env }
  delete env.NODE_ENV
  for (const name of Object.keys(env)) {
    if (name.startsWith('PRESMIUM_') || name.startsWith('DEEPSEEK_') || name.startsWith('DSH_') || /(?:_KEY|_TOKEN|_SECRET|_PASSWORD|_APPID)$/i.test(name)) delete env[name]
  }
  return { ...env, ...extra }
}

interface Track {
  utterances: { id: string, text: string, translations?: Record<string, { text: string, source: string }> }[]
}

test.describe('a recorded lecture written back by the agent (P-136, P-137)', () => {
  let dir: string
  let serve: ChildProcess | undefined
  let output = ''
  let url: string

  test.beforeAll(async () => {
    test.setTimeout(300_000)
    const work = join(ROOT, 'examples/demo/.presmium')
    mkdirSync(work, { recursive: true })
    dir = mkdtempSync(join(work, 'e2e-lecture-writeback-'))
    cpSync(FIXTURE, dir, { recursive: true })
    // The assistant's own git review, not deltabox's, where the host qualifies for it.
    writeFileSync(join(dir, 'presmium.workspace.yaml'), `${readFileSync(join(dir, 'presmium.workspace.yaml'), 'utf8')}  presmium.deltabox:\n    review: false\n`)
    writeFileSync(join(dir, '.gitignore'), 'node_modules/\ndist/\n.presmium/\n')
    writeFileSync(join(dir, 'package.json'), `${JSON.stringify({ name: dir.split('/').at(-1)!.toLowerCase(), private: true, type: 'module' })}\n`)
    mkdirSync(join(dir, 'node_modules/@presmium'), { recursive: true })
    for (const [name, path] of Object.entries(PLUGINS)) symlinkSync(join(ROOT, path), join(dir, 'node_modules/@presmium', name), 'junction')
    git(dir, ['init', '-q', '-b', 'main'])
    git(dir, ['add', '-A'])
    git(dir, ['commit', '-q', '-m', 'Initial commit'])
    serve = spawn(process.execPath, [PRESMIUM, 'serve', '--port', String(PORT)], {
      cwd: dir,
      env: clean({
        PRESMIUM_AGENT_COMMAND: `${process.execPath} ${AGENT}`,
        PRESMIUM_AGENT_PROVIDER: 'Test Provider',
        WRITEBACK_AGENT_LOG: `${dir}.agent.log`,
        // An engine the operator defines (nothing is synthesized here): its provider is what the player names.
        PRESMIUM_SPEECH_FAKE_URL: `http://127.0.0.1:${PORT + 6}/v1`,
        PRESMIUM_SPEECH_FAKE_PROVIDER: 'Presmium fake',
        XDG_STATE_HOME: `${dir}.state`,
        XDG_CACHE_HOME: `${dir}.cache`,
      }),
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    serve.stdout!.on('data', (chunk: Buffer) => output += chunk)
    serve.stderr!.on('data', (chunk: Buffer) => output += chunk)
    url = await new Promise<string>((resolve, reject) => {
      const check = () => {
        const found = /^serve {2}(http\S+)$/m.exec(output)
        if (found) resolve(found[1]!)
      }
      serve!.stdout!.on('data', check)
      serve!.once('exit', code => reject(new Error(`presmium serve exited (${code}):\n${output}`)))
    })
  })
  test.afterAll(async () => {
    if (serve && serve.exitCode === null && serve.signalCode === null) {
      const exited = new Promise(done => serve!.once('exit', done))
      serve.kill('SIGTERM')
      await exited
    }
    for (const path of [dir, `${dir}.state`, `${dir}.cache`, `${dir}.agent.log`]) if (path) rmSync(path, { recursive: true, force: true })
  })

  const lecture = () => readFileSync(join(dir, 'intro/lecture.md'), 'utf8')

  /** The lecture panel on the document's page, in edit mode. */
  async function lecturePanel(page: Page) {
    await openDevPage(page, `${url}/intro/`, page.locator('[data-section="merge"]').first())
    await page.locator('.pm-workspace-edit').filter({ visible: true }).click()
    await page.getByRole('button', { name: '讲授回写' }).click()
    const panel = page.getByRole('complementary', { name: '讲授回写' })
    await expect(panel).toBeVisible()
    return panel
  }

  test('narration from the transcript: the cues where the actions were bound, one commit, undone', async ({ page }) => {
    const original = lecture()
    const before = commits(dir).length
    const panel = await lecturePanel(page)
    // The model's provider is named before anything is sent (N-08).
    await expect(panel.locator('.pm-lecture-writeback__provider')).toHaveText('修改由 Test Provider 的模型完成')
    const demo = panel.locator('li[data-track="demo"]')
    await expect(demo).toContainText('讲授 demo（3 句）')
    await demo.getByRole('button', { name: '整理为讲解' }).click()

    // The agent read the transcript as narration (the lecture side's tool) and wrote it; the review lists the file.
    const task = panel.getByRole('region', { name: '回写任务' }).first()
    await expect(task).toHaveAttribute('data-state', 'review', { timeout: 90_000 })
    await expect(task.locator('.pm-lecture-writeback__change[data-path="intro/lecture.md"]')).toContainText('+2 −2')
    await task.getByRole('button', { name: '接受' }).click()
    await expect(task.getByRole('status')).toContainText('已提交')

    // The narration of each section is the tidied transcript; the spotlight is cued before the word 这 it was
    // bound to, the mark before 词 (bound by a character, the utterance having no word times).
    const written = lecture()
    expect(written).toContain('\n我们先看{cue to=code-1 lines=2-3}`spot`这两行代码，合并出现最多的一对。\n')
    expect(written).toContain('\n{cue}`mark 词表`词表随合并增长。\n')
    expect(written).not.toContain('原来的讲解')
    expect(written).not.toContain('词表的讲解')
    expect(written.replace(/\n[^\n]*\{cue[^\n]*\n/g, '\n')).toBe(original.replace(/\n(原来的讲解|词表的讲解)[^\n]*\n/g, '\n'))
    // One commit, of the task, with the lecture track in its message.
    expect(commits(dir)).toHaveLength(before + 1)
    const [made] = commits(dir)
    expect(made!.subject).toBe('转写回写：讲授轨 demo')
    expect(made!.trailers).toMatch(/^Presmium-Task: \S+$/m)
    expect(filesOf(dir, made!.id)).toEqual(['intro/lecture.md'])
    // The page follows without a reload; edit mode marks the cue where it is.
    await expect(page.locator('section.pm-section[data-section="merge"]')).toContainText('我们先看〔cue spot〕这两行代码，合并出现最多的一对。', { timeout: 60_000 })
    const tools = readFileSync(`${dir}.agent.log`, 'utf8').split('\n').filter(Boolean).map(line => JSON.parse(line) as { event: string, name?: string }).filter(entry => entry.event === 'tool')
    expect(tools.map(entry => entry.name)).toEqual(['track_narration'])

    // Undone: the narration comes back, as one more commit.
    await task.getByRole('button', { name: '撤销这次修改' }).click()
    await expect(task.getByRole('status').filter({ hasText: '已撤销' })).toBeVisible()
    expect(lecture()).toBe(original)
    expect(commits(dir)).toHaveLength(before + 2)
    await expect(page.locator('section.pm-section[data-section="merge"]')).toContainText('原来的讲解', { timeout: 60_000 })
  })

  test('translate: the utterances get their English translations, and the lecture exports English captions', async ({ page }) => {
    const panel = await lecturePanel(page)
    const demo = panel.locator('li[data-track="demo"]')
    await expect(demo.getByLabel('译文语言')).toHaveValue('en')
    await demo.getByRole('button', { name: '生成译文' }).click()
    const task = panel.getByRole('region', { name: '回写任务' }).first()
    await expect(task).toHaveAttribute('data-state', 'review', { timeout: 90_000 })
    await expect(task.locator('.pm-lecture-writeback__change[data-path="intro/lectures/demo/track.json"]')).toContainText('+3 −3')
    await task.getByRole('button', { name: '接受' }).click()
    await expect(task.getByRole('status')).toContainText('已提交')
    expect(commits(dir)[0]!.subject).toBe('对话修改：为讲授 demo 生成英语译文（en）')

    // Each utterance has its translation, recording the digest of the text it translates.
    const track = JSON.parse(readFileSync(join(dir, 'intro/lectures/demo/track.json'), 'utf8')) as Track
    const sha = (text: string) => `sha256:${createHash('sha256').update(text).digest('hex')}`
    expect(track.utterances.map(u => [u.id, u.translations?.en])).toEqual([
      ['u1', { text: 'Well, first look at these two lines of code,', source: sha('嗯，我们先看这两行代码，') }],
      ['u2', { text: 'merge the pair that occurs most often.', source: sha('合并出现最多的一对。') }],
      ['u3', { text: 'The vocabulary grows with each merge.', source: sha('那个，词表随合并增长。') }],
    ])
    // The lecture's build exports the English captions, none of them stale.
    const built = await presmium(['build', '--to', 'lecture'], join(dir, 'intro'))
    expect(built).not.toContain('stale')
    const captions = readFileSync(join(dir, 'intro/dist/lecture/demo/captions.en.vtt'), 'utf8')
    expect(captions).toBe('WEBVTT\n\nu1\n00:00:01.000 --> 00:00:03.920\nWell, first look at these two lines of code,\n\nu2\n00:00:04.500 --> 00:00:07.120\nmerge the pair that occurs most often.\n\nu3\n00:00:08.000 --> 00:00:10.000\nThe vocabulary grows with each merge.\n')
  })

  test('correcting a sentence of a synthetic lecture names the provider of its engine as the operator gives it now (N-08)', async ({ page }) => {
    await openDevPage(page, `${url}/intro/?view=lecture&track=said`, page.getByRole('region', { name: '讲授回放' }))
    const player = page.getByRole('region', { name: '讲授回放' })
    await player.getByRole('button', { name: '逐字稿' }).click()
    const sentence = page.locator('.pm-lecture-transcript__item[data-utterance="u1"]')
    await sentence.getByRole('button', { name: '修改语音段 u1' }).click()
    await expect(sentence.getByRole('button', { name: '保存并重新合成（Presmium fake）' })).toBeVisible()
    await expect(sentence).not.toContainText('Old Provider')
  })
})
