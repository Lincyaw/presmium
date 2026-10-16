// Change tasks of the assistant (WP-81; P-113 to P-115, P-121, P-136's tasks; D12): `presmium serve` on this
// machine (LOCAL) with the scripted test agent as the operator's replacement runtime (provider "Test
// Provider"), in workspaces copied from e2e/fixtures/assistant-edit (the assistant installed at the root,
// documents from its template), each a git repository of its own.
//
// - In the browser (6.13's flow): a document created on the home page; in edit mode the annotation and chat
//   panels name the provider; two annotations change two places, the page follows without a reload, the
//   review lists the file and its diff, accepting makes one commit and the annotations show the agent's
//   notes; a chat message adds a section; undoing the annotations' commit brings both places back.
// - D12 with the git review (deltabox's review off): a file rejected in the review comes back as the task
//   found it (uncommitted changes too) and the commit has the rest; rejecting all leaves the directory as it
//   was, without a commit; with `review: auto` the task commits at once.
// - D12 with deltabox (where the host qualifies): the panel names deltabox, the agent works in the session's
//   view, and a rejected file comes back as the task found it (uncommitted changes too).
// - P-121: the home page's new-document form drafts the document with the agent, reviewed in the form.
// - One change task per document at a time; a transcript task through the `tasks` route.
// - The operator directory is refused outright; in a single-deck repository a change of
//   presmium.workspace.yaml needs the owner's write approval.
// - The bundled DeepSeek Harness (LOCAL) with the default settings, driven by a fake model, in a single-deck
//   repository: its change tasks are reviewed with git even where deltabox's review is registered
//   (architecture.md 9.5) and commit; what it writes in the repository's git directory is put back.
// - SHARED (N-08): see the last describe.
import { execFileSync, spawn } from 'node:child_process'
import type { ChildProcess } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { fakeModel } from '../packages/addon-assistant/test/fixtures/fake-model.ts'
import type { FakeModel } from '../packages/addon-assistant/test/fixtures/fake-model.ts'
import { eventStream, raw } from '../packages/addon-assistant/test/helpers.ts'
import type { EventStream } from '../packages/addon-assistant/test/helpers.ts'
import { qualification } from '../packages/addon-deltabox/test/helpers.ts'
import { openDevPage } from './fixtures/deck.ts'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const FIXTURE = join(ROOT, 'e2e/fixtures/assistant-edit')
const PRESMIUM = join(ROOT, 'packages/cli/bin/presmium.mjs')
const AGENT = join(ROOT, 'packages/addon-assistant/test/fixtures/scripted-agent.mjs')
const ASSISTANT = join(ROOT, 'packages/addon-assistant')
/** This work package's ports (WP-81: 4971 to 4979). */
const PORTS = { browser: 4973, git: 4974, single: 4975, shared: 4976, gateway: 4977, dsh: 4978 }

/** The test's environment without Vitest's or Presmium's variables or credentials, then `extra`. */
function clean(extra: Record<string, string> = {}): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env }
  delete env.NODE_ENV
  for (const name of Object.keys(env)) {
    if (name.startsWith('PRESMIUM_') || name.startsWith('DEEPSEEK_') || name.startsWith('DSH_') || /(?:_KEY|_TOKEN|_SECRET|_PASSWORD|_APPID)$/i.test(name)) delete env[name]
  }
  return { ...env, ...extra }
}

function git(dir: string, args: string[]): string {
  return execFileSync('git', ['-c', 'core.hooksPath=/dev/null', '-c', 'user.name=Test', '-c', 'user.email=test@example.com', '-c', 'commit.gpgSign=false', ...args], { cwd: dir, encoding: 'utf8' })
}

/** The commits of a repository, newest first: subject and trailers. */
const commits = (dir: string) => git(dir, ['log', '--format=%H%x00%s%x00%(trailers:only)%x1e']).split('\x1e').map(entry => entry.trim()).filter(Boolean).map((entry) => {
  const [id = '', subject = '', trailers = ''] = entry.split('\0')
  return { id, subject, trailers }
})
const filesOf = (dir: string, id: string) => git(dir, ['show', '--name-only', '--format=', id]).split('\n').filter(Boolean).sort()

/**
 * A workspace in examples/demo/.presmium (ignored by git; VitePress resolves from the demo's node_modules):
 * the fixture copied (or `single`, a single-deck repository), the assistant installed at its root, `settings`
 * added to its configuration, a git repository of its own.
 */
function workspace(prefix: string, settings = '', single?: Record<string, string>): string {
  const work = join(ROOT, 'examples/demo/.presmium')
  mkdirSync(work, { recursive: true })
  const dir = mkdtempSync(join(work, `e2e-assistant-edit-${prefix}-`))
  if (single) {
    for (const [file, text] of Object.entries(single)) writeFileSync(join(dir, file), text)
  } else {
    cpSync(FIXTURE, dir, { recursive: true })
  }
  const config = join(dir, 'presmium.workspace.yaml')
  writeFileSync(config, `${readFileSync(config, 'utf8')}${settings}`)
  writeFileSync(join(dir, '.gitignore'), 'node_modules/\ndist/\n.presmium/\n')
  writeFileSync(join(dir, 'package.json'), `${JSON.stringify({ name: dir.split('/').at(-1)!.toLowerCase(), private: true, type: 'module' })}\n`)
  mkdirSync(join(dir, 'node_modules/@presmium'), { recursive: true })
  symlinkSync(ASSISTANT, join(dir, 'node_modules/@presmium/slidev-addon-assistant'), 'junction')
  git(dir, ['init', '-q', '-b', 'main'])
  git(dir, ['add', '-A'])
  git(dir, ['commit', '-q', '-m', 'Initial commit'])
  return dir
}

interface Serve {
  url: string
  child: ChildProcess
  output(): string
  stop(): Promise<void>
}

/** `presmium serve` of a workspace, with the scripted agent as the replacement runtime (or, `bundled`, without one). */
async function serve(dir: string, port: number, extra: Record<string, string> = {}, runtime: 'scripted' | 'bundled' = 'scripted'): Promise<Serve> {
  const scripted: Record<string, string> = runtime === 'scripted' ? { PRESMIUM_AGENT_COMMAND: `${process.execPath} ${AGENT}`, PRESMIUM_AGENT_PROVIDER: 'Test Provider', SCRIPTED_AGENT_LOG: `${dir}.agent.log` } : {}
  const child = spawn(process.execPath, [PRESMIUM, 'serve', '--port', String(port)], {
    cwd: dir,
    env: clean({ ...scripted, XDG_STATE_HOME: `${dir}.state`, XDG_CACHE_HOME: `${dir}.cache`, ...extra }),
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  let output = ''
  child.stdout!.on('data', (chunk: Buffer) => output += chunk)
  child.stderr!.on('data', (chunk: Buffer) => output += chunk)
  const url = await new Promise<string>((resolve, reject) => {
    const check = () => {
      const found = /^serve {2}(http\S+)$/m.exec(output)
      if (found) resolve(found[1]!)
    }
    child.stdout!.on('data', check)
    child.once('exit', code => reject(new Error(`presmium serve exited (${code}):\n${output}`)))
  })
  return {
    url,
    child,
    output: () => output,
    async stop() {
      if (child.exitCode !== null || child.signalCode !== null) return
      const exited = new Promise(done => child.once('exit', done))
      child.kill('SIGTERM')
      const timer = setTimeout(() => child.kill('SIGKILL'), 20_000)
      await exited
      clearTimeout(timer)
    },
  }
}

/** A route of the assistant for a document. */
async function call(server: Serve, document: string, path: string, json?: unknown): Promise<{ status: number, json: Record<string, any> }> {
  const response = await fetch(`${server.url}/__presmium/presmium.assistant/${path}`, {
    method: json === undefined ? 'GET' : 'POST',
    headers: { 'Presmium-Document': encodeURIComponent(document), ...json === undefined ? {} : { 'Content-Type': 'application/json' } },
    ...json === undefined ? {} : { body: JSON.stringify(json) },
  })
  const text = await response.text()
  return { status: response.status, json: text ? JSON.parse(text) as Record<string, any> : {} }
}

/** Submits a change task and opens its events. */
async function submit(server: Serve, document: string, body: Record<string, unknown>): Promise<{ id: string, events: EventStream }> {
  const submitted = await call(server, document, 'tasks', body)
  expect(submitted.status, JSON.stringify(submitted.json)).toBe(201)
  const id = submitted.json.id as string
  return { id, events: await eventStream(`${server.url}/__presmium/presmium.assistant/tasks/${id}/events?document=${encodeURIComponent(document)}`) }
}

/** The task's next event of these types. */
async function next(events: EventStream, ...types: string[]): Promise<Record<string, any>> {
  for (;;) {
    const event = await events.next('message', 90_000)
    if (types.includes(event.type)) return event
    if (event.type === 'error') throw new Error(`the task failed: ${event.message}`)
  }
}

const chat = (prompt: string) => ({ kind: 'chat', prompt, context: { document: '', section: 'x' } })

/** What the scripted agent logged. */
const agentLog = (dir: string) => (existsSync(`${dir}.agent.log`) ? readFileSync(`${dir}.agent.log`, 'utf8').split('\n').filter(Boolean).map(line => JSON.parse(line) as Record<string, any>) : [])

/** Whether this host qualifies for deltabox, asked as its plugin asks. */
const deltabox = qualification()

test.describe.configure({ mode: 'serial', timeout: 240_000 })

test.describe('in the browser: annotations, chat, review and undo (LOCAL)', () => {
  let dir: string
  let server: Serve

  test.beforeAll(async () => {
    test.setTimeout(300_000)
    dir = workspace('browser')
    server = await serve(dir, PORTS.browser)
  })
  test.afterAll(async () => {
    await server?.stop()
    for (const path of [dir, `${dir}.state`, `${dir}.cache`, `${dir}.agent.log`]) if (path) rmSync(path, { recursive: true, force: true })
  })

  /** The edit panel on a document's page, in edit mode. */
  async function editPanel(page: Page, document: string) {
    await openDevPage(page, `${server.url}/${document}/`, page.locator('[data-section]').first())
    await page.locator('.pm-workspace-edit').filter({ visible: true }).click()
    const panel = page.getByRole('complementary', { name: '批注与对话' })
    await expect(panel).toBeVisible()
    return panel
  }

  test('a document created in the browser: two annotations, a chat message, the review, one commit each, and the undo of the annotations', async ({ page }) => {
    await openDevPage(page, `${server.url}/`, page.locator('.pm-site-home__document[data-document="intro"]'))
    await page.locator('.pm-workspace-documents__toggle').click()
    const documents = page.getByRole('dialog', { name: '管理文档' })
    await documents.locator('input[name="dir"]').fill('week5')
    await documents.locator('input[name="title"]').fill('第五周')
    await documents.getByRole('button', { name: '新建', exact: true }).click()
    await expect(page.locator('.pm-site-home__document[data-document="week5"]')).toContainText('第五周')
    const before = commits(dir).length

    const panel = await editPanel(page, 'week5')
    const annotationsPanel = panel.getByRole('region', { name: '批注' })
    const chatPanel = panel.getByRole('region', { name: '对话' })
    // Both name the operator's provider before anything is sent (N-08).
    await expect(annotationsPanel.locator('.pm-assistant-edit__provider')).toHaveText('修改由 Test Provider 的模型完成')
    await expect(chatPanel.locator('.pm-assistant-edit__provider')).toHaveText('修改由 Test Provider 的模型完成')

    // Two blocks annotated: picked on the page, each with its source's excerpt.
    await page.evaluate(() => (window as unknown as { unreloaded: boolean }).unreloaded = true)
    for (const [text, request] of [['第一段讲解', '第一段讲解：分词把文字切成更小的词元。'], ['第二段讲解', '第二段讲解：词表越大，输入越短。']]) {
      await page.locator('[data-section] [data-block]', { hasText: text! }).first().click()
      await expect(annotationsPanel.locator('.pm-assistant-edit__excerpt')).toContainText(text!)
      await annotationsPanel.getByLabel('要求').fill(request!)
      await annotationsPanel.getByRole('button', { name: '添加批注' }).click()
    }
    await expect(annotationsPanel.locator('.pm-assistant-annotation[data-status="draft"]')).toHaveCount(2)
    await annotationsPanel.getByRole('button', { name: '发送 2 条批注' }).click()

    // The source changes in two places and the page follows without a reload, before anything is accepted.
    await expect(page.locator('[data-section]').getByText('第一段讲解：分词把文字切成更小的词元。')).toBeVisible({ timeout: 60_000 })
    await expect(page.locator('[data-section]').getByText('第二段讲解：词表越大，输入越短。')).toBeVisible()
    expect(await page.evaluate(() => (window as unknown as { unreloaded?: boolean }).unreloaded)).toBe(true)

    // The review lists the changed file with its diff; accepting all makes one commit.
    const task = panel.getByRole('region', { name: '修改任务' }).first()
    await expect(task).toHaveAttribute('data-state', 'review', { timeout: 60_000 })
    const file = task.locator('.pm-assistant-change[data-path="week5/lecture.md"]')
    await expect(file).toContainText('修改 +2 −2')
    // And the steps: a checkpoint after each tool call of the agent.
    await expect(task.locator('.pm-assistant-edit__steps summary')).toContainText('已记录')
    await expect(file.locator('.pm-assistant-change__diff')).toContainText('+第一段讲解：分词把文字切成更小的词元。')
    await task.getByRole('button', { name: '全部接受' }).click()
    await expect(task.locator('.pm-assistant-edit__outcome')).toContainText('已提交')
    const [annotated] = commits(dir)
    expect(commits(dir)).toHaveLength(before + 1)
    expect(annotated!.subject).toBe('批注修改：处理 2 条批注')
    expect(annotated!.trailers).toMatch(/^Presmium-Origin: agent$/m)
    expect(annotated!.trailers).toMatch(/^Presmium-Task: \S+$/m)
    expect(filesOf(dir, annotated!.id)).toEqual(['week5/lecture.md'])
    // Both annotations handled, each with the agent's note.
    const done = annotationsPanel.locator('.pm-assistant-annotation[data-status="done"]')
    await expect(done).toHaveCount(2)
    await expect(done.first().locator('.pm-assistant-annotation__status')).toHaveText('已处理')
    await expect(done.first().locator('.pm-assistant-annotation__note')).toContainText('已把 lecture.md 第')

    // A chat message adds a section at the end of the chapter; accepted, one more commit.
    await chatPanel.getByLabel('消息').fill('在本章末尾新增一节')
    await chatPanel.getByRole('button', { name: '发送' }).click()
    await expect(page.getByRole('heading', { name: 'agent 新增的一节' })).toBeVisible({ timeout: 60_000 })
    const chatTask = panel.getByRole('region', { name: '修改任务' }).first()
    await expect(chatTask).toHaveAttribute('data-state', 'review', { timeout: 60_000 })
    await chatTask.getByRole('button', { name: '全部接受' }).click()
    await expect(chatTask.locator('.pm-assistant-edit__outcome')).toContainText('已提交')
    expect(commits(dir)).toHaveLength(before + 2)
    expect(commits(dir)[0]!.subject).toBe('对话修改：在本章末尾新增一节')

    // Undoing the annotations' commit brings both places back, as one more commit.
    const first = panel.locator(`.pm-assistant-edit__task[data-state="done"]`).nth(1)
    await first.getByRole('button', { name: '撤销这次修改' }).click()
    await expect(first.locator('.pm-assistant-edit__reverted')).toContainText('已撤销')
    await expect(page.locator('[data-section]').getByText('第一段讲解：分词把文字切成词元。')).toBeVisible({ timeout: 60_000 })
    await expect(page.locator('[data-section]').getByText('第二段讲解：词表的大小决定模型的输入。')).toBeVisible()
    await expect(page.getByRole('heading', { name: 'agent 新增的一节' })).toBeVisible()
    expect(commits(dir)).toHaveLength(before + 3)
    expect(commits(dir)[0]!.trailers).toMatch(new RegExp(`^Presmium-Revert: ${annotated!.id}$`, 'm'))
    expect(readFileSync(join(dir, 'week5/lecture.md'), 'utf8')).toContain('第一段讲解：分词把文字切成词元。')
  })

  test('deltabox: the panel names it, the agent works in the session\'s view; a rejected file comes back, the rest is committed', async ({ page }) => {
    test.skip(!deltabox.ok, `deltabox is not available on this host: ${deltabox.why}`)
    // A change not committed when the task starts: the rejected file comes back with it.
    writeFileSync(join(dir, 'week5/lecture.md'), `${readFileSync(join(dir, 'week5/lecture.md'), 'utf8')}\n任务开始前没有提交的一行。\n`)
    const lecture = readFileSync(join(dir, 'week5/lecture.md'), 'utf8')
    const before = commits(dir).length
    const panel = await editPanel(page, 'week5')
    const chatPanel = panel.getByRole('region', { name: '对话' })
    await chatPanel.getByLabel('消息').fill('#append lecture.md deltabox 写的一行\n#append notes.md deltabox 写的笔记')
    await chatPanel.getByRole('button', { name: '发送' }).click()
    const task = panel.getByRole('region', { name: '修改任务' }).first()
    await expect(task).toHaveAttribute('data-state', 'review', { timeout: 60_000 })
    await expect(task.locator('.pm-assistant-edit__engine')).toHaveText('请审阅改动（审阅由 deltabox 完成）')
    // The agent's working directory is the session's view of the document, not the directory itself.
    const cwd = agentLog(dir).filter(e => e.event === 'session/new').at(-1)!.cwd as string
    expect(cwd).toMatch(/\/deltabox-lite\/[^/]+\/mount$/)
    expect(cwd).not.toBe(join(dir, 'week5'))
    await task.getByLabel('接受这个文件 week5/lecture.md').uncheck()
    await task.getByRole('button', { name: '接受其余（拒绝 1 个文件）' }).click()
    await expect(task.locator('.pm-assistant-edit__outcome')).toContainText('已提交')
    expect(readFileSync(join(dir, 'week5/lecture.md'), 'utf8')).toBe(lecture)
    expect(readFileSync(join(dir, 'week5/notes.md'), 'utf8')).toBe('deltabox 写的笔记\n')
    expect(commits(dir)).toHaveLength(before + 1)
    expect(filesOf(dir, commits(dir)[0]!.id)).toEqual(['week5/notes.md'])
    git(dir, ['checkout', '--', 'week5/lecture.md'])
  })

  test('the home page\'s form drafts a new document with the agent: reviewed in the form, committed after the document\'s own commit, then opened', async ({ page }) => {
    // Until the workspace gives its home page the assistant (reported to its owner: the home page loads the
    // operator plugins' browser parts, and the assistant's `info` answers there), the test stands in for both:
    // the assistant's browser plugin after the workspace's own, and the home page's `info` asked of a
    // document. The draft itself goes to the new document's assistant, as the AGENT client sends it.
    const home = await fetch(`${server.url}/__presmium/presmium.assistant/info`, { headers: { 'Presmium-Document': '' } })
    await home.text()
    if (!home.ok) {
      await page.route('**/packages/workspace/src/client/plugin.ts*', async (route) => {
        const response = await route.fetch()
        await route.fulfill({ response, body: `${await response.text()}\nexport { assistantPlugin as presmiumAssistant } from '/@fs${ASSISTANT}/src/client/plugin.ts'\n` })
      })
      await page.route('**/__presmium/presmium.assistant/info', route => route.continue({ headers: { ...route.request().headers(), 'presmium-document': 'intro' } }))
    }
    const before = commits(dir).length
    await openDevPage(page, `${server.url}/`, page.locator('.pm-site-home__document[data-document="intro"]'))
    await page.locator('.pm-workspace-documents__toggle').click()
    const documents = page.getByRole('dialog', { name: '管理文档' })
    await documents.locator('input[name="dir"]').fill('week6')
    await documents.locator('input[name="title"]').fill('第六周')
    await documents.getByRole('checkbox', { name: '由 agent 起草（模型由 Test Provider 提供）' }).check()
    await documents.locator('textarea[name="request"]').fill('写一节关于上下文窗口的讲义')
    await documents.getByRole('button', { name: '新建', exact: true }).click()

    // The draft waits for its review in the form; accepted, the page opens the new document with the draft.
    const draft = documents.locator('.pm-workspace-draft')
    await expect(draft).toHaveAttribute('data-state', 'review', { timeout: 60_000 })
    await expect(draft.locator('.pm-workspace-draft__changes')).toContainText('week6/lecture.md')
    await draft.getByRole('button', { name: '接受' }).click()
    await expect(page).toHaveURL(`${server.url}/week6/`, { timeout: 60_000 })
    // The new document's dev server starts with this visit: visited again once Vite has optimized its dependencies.
    await openDevPage(page, `${server.url}/week6/`, page.locator('[data-section]').getByText('这是 agent 按要求写出的初稿：写一节关于上下文窗口的讲义'))
    const lecture = readFileSync(join(dir, 'week6/lecture.md'), 'utf8')
    expect(lecture).toContain('## 上下文窗口')
    expect(lecture).toContain('title: "第六周"')
    // First the document's creation, then the draft.
    const [drafted, created] = commits(dir)
    expect(commits(dir)).toHaveLength(before + 2)
    expect(created!.trailers).toMatch(/^Presmium-Origin: document$/m)
    expect(drafted!.trailers).toMatch(/^Presmium-Origin: agent$/m)
    expect(drafted!.trailers).toMatch(/^Presmium-Task: \S+$/m)
    expect(drafted!.subject).toBe('起草：写一节关于上下文窗口的讲义')
    expect(filesOf(dir, drafted!.id)).toEqual(['week6/lecture.md'])
  })
})


test.describe('the review with git (D12), one task per document, a transcript, the operator directory (LOCAL)', () => {
  let dir: string
  let server: Serve
  let operator: string
  const start = () => serve(dir, PORTS.git, { PRESMIUM_OPERATOR_DIR: operator })

  test.beforeAll(async () => {
    test.setTimeout(300_000)
    // deltabox's review off: the assistant's own git review.
    dir = workspace('git', '  presmium.deltabox:\n    review: false\n')
    operator = mkdtempSync(join(ROOT, 'examples/demo/.presmium/e2e-assistant-edit-operator-'))
    server = await start()
  })
  test.afterAll(async () => {
    await server?.stop()
    for (const path of [dir, operator, `${dir}.state`, `${dir}.cache`, `${dir}.agent.log`]) if (path) rmSync(path, { recursive: true, force: true })
  })

  const lecture = () => readFileSync(join(dir, 'intro/lecture.md'), 'utf8')

  test('a rejected file comes back as the task found it, uncommitted changes too; the commit has the rest', async () => {
    writeFileSync(join(dir, 'intro/lecture.md'), `${lecture()}\n任务开始前没有提交的一行。\n`)
    const found = lecture()
    const before = commits(dir).length
    const { id, events } = await submit(server, 'intro', chat('#append lecture.md agent 写的一行\n#append notes.md agent 写的笔记'))
    try {
      const review = await next(events, 'review')
      expect(review.engine).toBe('git')
      expect(review.changes.map((c: { path: string, kind: string }) => [c.path, c.kind])).toEqual([['intro/lecture.md', 'modified'], ['intro/notes.md', 'added']])
      expect(review.changes[0].diff).toContain('+agent 写的一行')
      expect(review.steps.length).toBeGreaterThan(0)
      expect((await call(server, 'intro', `tasks/${id}/review`, { accept: true, reject: ['intro/lecture.md'] })).status).toBe(204)
      const done = await next(events, 'done')
      expect(lecture()).toBe(found)
      expect(readFileSync(join(dir, 'intro/notes.md'), 'utf8')).toBe('agent 写的笔记\n')
      expect(commits(dir)).toHaveLength(before + 1)
      expect(commits(dir)[0]!.id).toBe(done.revision)
      expect(commits(dir)[0]!.trailers).toMatch(new RegExp(`^Presmium-Task: ${id}$`, 'm'))
      expect(filesOf(dir, done.revision)).toEqual(['intro/notes.md'])
    } finally {
      events.close()
    }
  })

  test('rejecting all leaves the directory as the task found it, its new files deleted, without a commit', async () => {
    const found = lecture()
    const before = commits(dir).length
    const { id, events } = await submit(server, 'intro', chat('#append lecture.md 不会留下的一行\n#append drafts/new.md 不会留下的文件'))
    try {
      const review = await next(events, 'review')
      expect(review.changes.map((c: { path: string }) => c.path)).toEqual(['intro/drafts/new.md', 'intro/lecture.md'])
      expect(lecture()).toContain('不会留下的一行')
      expect((await call(server, 'intro', `tasks/${id}/review`, { accept: false })).status).toBe(204)
      expect(await next(events, 'done')).toEqual({ type: 'done' })
      expect(lecture()).toBe(found)
      expect(existsSync(join(dir, 'intro/drafts'))).toBe(false)
      expect(commits(dir)).toHaveLength(before)
    } finally {
      events.close()
    }
  })

  test('a second change task of a document is refused while the first waits for its review; a transcript task through the tasks route is committed', async () => {
    const first = await submit(server, 'intro', chat('#append lecture.md 第一个任务的一行'))
    try {
      await next(first.events, 'review')
      const second = await call(server, 'intro', 'tasks', chat('#append lecture.md 第二个任务的一行'))
      expect(second.status).toBe(409)
      expect(second.json.error).toBe('这份文档已有一个进行中或等待审阅的修改任务，请先完成它')
      // Questions are not limited.
      expect((await call(server, 'intro', 'tasks', { kind: 'question', prompt: '合并的是哪一对？', context: { document: '' } })).status).toBe(201)
      expect((await call(server, 'intro', `tasks/${first.id}/review`, { accept: false })).status).toBe(204)
      await next(first.events, 'done')
    } finally {
      first.events.close()
    }

    const before = commits(dir).length
    const { id, events } = await submit(server, 'intro', { kind: 'transcript', prompt: '按章节把整理后的逐字稿写成讲解', context: { document: '' }, track: 'demo' })
    try {
      const review = await next(events, 'review')
      expect(review.changes.map((c: { path: string }) => c.path)).toEqual(['intro/lecture.md'])
      expect(lecture()).toContain('据讲授轨 demo 整理的讲解：合并的是出现最多的一对，每轮一次。')
      // The agent was given the track and its file.
      const asked = agentLog(dir).filter(e => e.event === 'session/prompt').at(-1)!
      expect(asked.question).toBe('按章节把整理后的逐字稿写成讲解')
      expect((await call(server, 'intro', `tasks/${id}/review`, { accept: true })).status).toBe(204)
      const done = await next(events, 'done')
      expect(commits(dir)).toHaveLength(before + 1)
      const [made] = commits(dir)
      expect(made!.id).toBe(done.revision)
      expect(made!.subject).toBe('转写回写：讲授轨 demo')
      expect(made!.trailers).toMatch(new RegExp(`^Presmium-Task: ${id}$`, 'm'))
    } finally {
      events.close()
    }
    // A track the document does not have is refused.
    expect((await call(server, 'intro', 'tasks', { kind: 'transcript', prompt: '整理', context: { document: '' }, track: 'missing' })).status).toBe(400)
  })

  test('a write into the operator directory is refused outright: no approval, no file', async () => {
    const window = await eventStream(`${server.url}/__presmium/presmium.server/control?window=author&document=intro`)
    const forged = join(operator, 'consent/volcengine/S_forged.json')
    const { events } = await submit(server, 'intro', chat(`#append ${forged} {"speaker":"伪造"}`))
    try {
      const done = await next(events, 'done')
      expect(done).toEqual({ type: 'done' })
      expect(events.events.filter(e => e.data.type === 'approval')).toEqual([])
      expect(window.events.filter(e => e.event === 'approval')).toEqual([])
      expect(agentLog(dir).filter(e => e.event === 'permission').at(-1)).toMatchObject({ allowed: false, file: forged })
      expect(existsSync(forged)).toBe(false)
    } finally {
      events.close()
      window.close()
    }
  })

  test('a write outside the document that the owner allows is committed with the task', async () => {
    const window = await eventStream(`${server.url}/__presmium/presmium.server/control?window=outside&document=intro`)
    const before = commits(dir).length
    const { id, events } = await submit(server, 'intro', chat(`#append ${join(dir, 'shared/glossary.md')} 词元：模型读入的单位\n#append notes.md 引用了术语表`))
    try {
      const asked = await window.next('approval', 60_000) as { id: string, request: Record<string, unknown> }
      expect(asked.request).toMatchObject({ kind: 'write', scope: 'workspace', from: `agent:${id}` })
      await fetch(`${server.url}/__presmium/presmium.server/control`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ window: 'outside', type: 'answer', id: asked.id, allow: true }) })
      const review = await next(events, 'review')
      // Not in the review: it is outside the document.
      expect(review.changes.map((c: { path: string }) => c.path)).toEqual(['intro/notes.md'])
      expect((await call(server, 'intro', `tasks/${id}/review`, { accept: true })).status).toBe(204)
      const done = await next(events, 'done')
      expect(commits(dir)).toHaveLength(before + 1)
      expect(filesOf(dir, done.revision)).toEqual(['intro/notes.md', 'shared/glossary.md'])
    } finally {
      events.close()
      window.close()
    }
  })

  test('a review still waiting when the process ends is rejected; with review: auto a change task commits at once, without a review', async () => {
    const found = lecture()
    const before = commits(dir).length
    const pending = await submit(server, 'intro', chat('#append lecture.md 进程结束时还在审阅\n#append pending.md 不会留下'))
    await next(pending.events, 'review')
    pending.events.close()
    await server.stop()
    expect(lecture()).toBe(found)
    expect(existsSync(join(dir, 'intro/pending.md'))).toBe(false)
    expect(commits(dir)).toHaveLength(before)

    writeFileSync(join(dir, 'presmium.workspace.yaml'), `${readFileSync(join(dir, 'presmium.workspace.yaml'), 'utf8')}  presmium.assistant:\n    review: auto\n`)
    server = await start()
    const { id, events } = await submit(server, 'intro', chat('#append notes.md 直接提交的笔记'))
    try {
      const done = await next(events, 'done')
      expect(events.events.filter(e => e.data.type === 'review')).toEqual([])
      expect(commits(dir)).toHaveLength(before + 1)
      expect(commits(dir)[0]!.id).toBe(done.revision)
      expect(commits(dir)[0]!.trailers).toMatch(new RegExp(`^Presmium-Task: ${id}$`, 'm'))
    } finally {
      events.close()
    }
  })
})

test.describe('a single-deck repository: the workspace configuration in the review needs the owner (LOCAL)', () => {
  let dir: string
  let server: Serve
  const CONFIG = `title: 单份文稿
settings:
  presmium.workspace:
    plugins: ['@presmium/slidev-addon-assistant']
`

  test.beforeAll(async () => {
    test.setTimeout(300_000)
    dir = workspace('single', '', {
      'presmium.workspace.yaml': CONFIG,
      'lecture.md': '---\ntitle: 单份文稿\n---\n\n# 引言\n\n## 第一节\n\n开始时的内容。\n',
    })
    server = await serve(dir, PORTS.single)
  })
  test.afterAll(async () => {
    await server?.stop()
    for (const path of [dir, `${dir}.state`, `${dir}.cache`, `${dir}.agent.log`]) if (path) rmSync(path, { recursive: true, force: true })
  })

  for (const allow of [false, true]) {
    test(`accepting all asks the owner first; ${allow ? 'allowed, both files are committed' : 'refused, presmium.workspace.yaml comes back and only lecture.md is committed'}`, async () => {
      const config = readFileSync(join(dir, 'presmium.workspace.yaml'), 'utf8')
      const window = await eventStream(`${server.url}/__presmium/presmium.server/control?window=owner-${allow}&document=`)
      const { id, events } = await submit(server, '', chat(`#append presmium.workspace.yaml # agent ${allow}\n#append lecture.md agent 的一行 ${allow}`))
      try {
        const review = await next(events, 'review')
        expect(review.changes.map((c: { path: string }) => c.path)).toEqual(['lecture.md', 'presmium.workspace.yaml'])
        expect((await call(server, '', `tasks/${id}/review`, { accept: true })).status).toBe(204)
        const asked = await window.next('approval', 60_000) as { id: string, request: Record<string, unknown> }
        expect(asked.request).toMatchObject({ kind: 'write', scope: 'workspace', from: `agent:${id}` })
        expect(String(asked.request.title)).toContain('presmium.workspace.yaml')
        const answered = await fetch(`${server.url}/__presmium/presmium.server/control`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ window: `owner-${allow}`, type: 'answer', id: asked.id, allow }) })
        expect(answered.status).toBe(200)
        const done = await next(events, 'done')
        expect(filesOf(dir, done.revision)).toEqual(allow ? ['lecture.md', 'presmium.workspace.yaml'] : ['lecture.md'])
        if (allow) expect(readFileSync(join(dir, 'presmium.workspace.yaml'), 'utf8')).toBe(`${config}# agent true\n`)
        else expect(readFileSync(join(dir, 'presmium.workspace.yaml'), 'utf8')).toBe(config)
      } finally {
        events.close()
        window.close()
      }
    })
  }
})

test.describe('the bundled DeepSeek Harness with the default settings, in a single-deck repository (LOCAL)', () => {
  let dir: string
  let server: Serve
  let model: FakeModel

  test.beforeAll(async () => {
    test.setTimeout(300_000)
    // No deltabox settings: where the host qualifies, deltabox's review is registered all the same.
    dir = workspace('dsh', '', {
      'presmium.workspace.yaml': `title: 单份文稿\nsettings:\n  presmium.workspace:\n    plugins: ['@presmium/slidev-addon-assistant']\n`,
      'lecture.md': '---\ntitle: 单份文稿\n---\n\n# 引言\n\n## 第一节\n\n开始时的内容。\n',
    })
    // DeepSeek Harness, driven by the model's script: the first two tasks write a note each; the third writes a
    // hook, attributes naming a filter driver, git's configuration defining it (in the repository's git
    // directory: its sandbox lets it, without asking, the document directory being its working directory) and
    // a note.
    model = await fakeModel([
      { tool: 'write', input: { file_path: 'notes.md', content: '第一个任务的笔记\n' } },
      { text: '完毕：写了笔记。' },
      { tool: 'write', input: { file_path: 'summary.md', content: '第二个任务的小结\n' } },
      { text: '完毕：写了小结。' },
      { tool: 'write', input: { file_path: '.git/hooks/post-checkout', content: '#!/bin/sh\necho planted\n' } },
      { tool: 'write', input: { file_path: '.gitattributes', content: '* filter=planted\n' } },
      { tool: 'read', input: { file_path: '.git/config' } },
      { tool: 'write', input: { file_path: '.git/config', content: '[core]\n\thooksPath = .git/hooks\n[filter "planted"]\n\tclean = touch planted\n' } },
      { tool: 'write', input: { file_path: 'remarks.md', content: '第三个任务的备注\n' } },
      { text: '完毕：写了备注。' },
    ])
    server = await serve(dir, PORTS.dsh, { PRESMIUM_MODEL_URL: model.url, PRESMIUM_MODEL_KEY: 'model-key-81e', PRESMIUM_MODEL_PROVIDER: 'Test Provider' }, 'bundled')
  })
  test.afterAll(async () => {
    await server?.stop()
    await model?.close()
    for (const path of [dir, `${dir}.state`, `${dir}.cache`]) if (path) rmSync(path, { recursive: true, force: true })
  })

  /** A chat task accepted in its review (but the `reject`ed files): the paths it listed, and its commit. */
  async function accepted(prompt: string, reject: string[] = []): Promise<{ paths: string[], revision: string, id: string }> {
    const { id, events } = await submit(server, '', chat(prompt))
    try {
      const review = await next(events, 'review')
      expect(review.engine).toBe('git')
      expect((await call(server, '', `tasks/${id}/review`, { accept: true, reject })).status).toBe(204)
      const done = await next(events, 'done')
      return { paths: review.changes.map((c: { path: string }) => c.path), revision: done.revision as string, id }
    } finally {
      events.close()
    }
  }

  test('its change tasks are reviewed with git and committed one after the other, leaving nothing behind', async () => {
    const before = commits(dir).length
    for (const file of ['notes.md', 'summary.md']) {
      const { paths, revision, id } = await accepted(`写 ${file}`)
      expect(paths).toEqual([file])
      expect(commits(dir)[0]!.id).toBe(revision)
      expect(commits(dir)[0]!.trailers).toMatch(new RegExp(`^Presmium-Task: ${id}$`, 'm'))
      expect(filesOf(dir, revision)).toEqual([file])
    }
    expect(commits(dir)).toHaveLength(before + 2)
    // DeepSeek Harness's staging directories are gone with its writes: nothing uncommitted is left.
    expect(git(dir, ['status', '--porcelain', '--untracked-files=all'])).toBe('')
    // Where deltabox's review is registered, the log says why the assistant does not use it.
    if (deltabox.ok) expect(server.output()).toContain('change tasks use the assistant\'s git review, not deltabox\'s')
  })

  test('what it writes in the repository\'s git directory is put back before the review runs git: no hook, no filter driver', async () => {
    const config = readFileSync(join(dir, '.git/config'), 'utf8')
    const { paths, revision } = await accepted('写备注', ['.gitattributes'])
    expect(paths).toEqual(['.gitattributes', 'remarks.md'])
    expect(filesOf(dir, revision)).toEqual(['remarks.md'])
    expect(existsSync(join(dir, '.git/hooks/post-checkout'))).toBe(false)
    expect(readFileSync(join(dir, '.git/config'), 'utf8')).toBe(config)
    // The review's git never ran the planted filter driver.
    expect(existsSync(join(dir, 'planted'))).toBe(false)
    expect(server.output()).toMatch(/the agent changed the git directory, put back: .*\.git\/hooks\/post-checkout/)
    expect(server.output()).toMatch(/the agent changed the git directory, put back: .*\.git\/config/)
  })
})

test.describe('SHARED (N-08): a write outside the document, of an editor\'s task, is the owner\'s on the console only', () => {
  const SECRETS = { proxy: 'proxy-secret-81a', gateway: 'gateway-token-81b', agentHost: 'agent-host-token-81c', model: 'model-key-81d' }
  let dir: string
  let model: FakeModel
  const children: ChildProcess[] = []
  let serveUrl: string

  /** The headers the login proxy adds for a member on the site's host name (or the owner console's). */
  const as = (email: string, host: 'site' | 'console' = 'site') => ({
    'Host': `${host}.test:${PORTS.shared}`,
    'X-Presmium-Proxy-Secret': SECRETS.proxy,
    'X-Forwarded-Email': email,
    ...host === 'site' ? { 'Presmium-Document': 'intro' } : {},
  })

  /** `presmium <args>` in the workspace, resolving once it prints `pattern`. */
  async function start(args: string[], env: Record<string, string>, pattern: RegExp): Promise<string> {
    const child = spawn(process.execPath, [PRESMIUM, ...args], { cwd: dir, env: clean({ XDG_STATE_HOME: `${dir}.state`, XDG_CACHE_HOME: `${dir}.cache`, ...env }), stdio: ['ignore', 'pipe', 'pipe'] })
    children.unshift(child)
    let output = ''
    return new Promise((resolve, reject) => {
      const check = () => {
        const found = pattern.exec(output)
        if (found) resolve(found[1]!)
      }
      child.stdout!.on('data', (chunk: Buffer) => {
        output += chunk
        check()
      })
      child.stderr!.on('data', (chunk: Buffer) => output += chunk)
      child.once('exit', code => reject(new Error(`presmium ${args[0]} exited (${code}):\n${output}`)))
    })
  }

  test.beforeAll(async () => {
    test.setTimeout(300_000)
    // The default settings: the assistant reviews DeepSeek Harness's changes with git in serve whether or not
    // agent-host offers deltabox's review (its writes fault a deltabox-lite 0.1.1 session, architecture.md 9.5).
    dir = workspace('shared')
    const config = join(dir, 'presmium.workspace.yaml')
    writeFileSync(config, `${readFileSync(config, 'utf8')}members:\n  owners: [owner@test]\n  editors: [editor@test]\n`)
    git(dir, ['commit', '-q', '-am', 'Members'])
    // DeepSeek Harness, driven by the model's script: it writes a note in the document, then reads the
    // workspace configuration outside it and writes it, denied by its sandbox, then asks to write it anyway.
    model = await fakeModel([
      { tool: 'write', input: { file_path: 'notes.md', content: 'agent 的笔记\n' } },
      { tool: 'read', input: { file_path: config } },
      { tool: 'write', input: { file_path: config, content: 'title: 被改写\n' } },
      { tool: 'write', input: { file_path: config, content: 'title: 被改写\n', sandbox_permissions: 'danger-full-access', justification: '需要改写工作区配置' } },
      { text: '完毕：写了笔记；改写工作区配置被拒绝。' },
    ])
    const agentHost = await start(['agent-host', '--port', '0'], { PRESMIUM_AGENT_HOST_TOKEN: SECRETS.agentHost }, /^agent-host {2}(http\S+)$/m)
    const gatewayUrl = `http://127.0.0.1:${PORTS.gateway}`
    serveUrl = await start(['serve', '--port', String(PORTS.shared)], {
      PRESMIUM_PROXY_SECRET: SECRETS.proxy,
      PRESMIUM_GATEWAY_URL: gatewayUrl,
      PRESMIUM_GATEWAY_TOKEN: SECRETS.gateway,
      PRESMIUM_AGENT_HOST_URL: agentHost,
      PRESMIUM_AGENT_HOST_TOKEN: SECRETS.agentHost,
      PRESMIUM_CONSOLE_HOST: 'console.test',
    }, /^serve {2}(http\S+)$/m)
    await start(['gateway', '.', '--serve', serveUrl, '--port', String(PORTS.gateway), '--operator-dir', `${dir}.operator`], {
      PRESMIUM_GATEWAY_TOKEN: SECRETS.gateway,
      PRESMIUM_MODEL_URL: model.url,
      PRESMIUM_MODEL_KEY: SECRETS.model,
      PRESMIUM_MODEL_PROVIDER: 'Test Provider',
    }, /^gateway {2}(http\S+)$/m)
  })
  test.afterAll(async () => {
    for (const child of children) {
      if (child.exitCode !== null || child.signalCode !== null) continue
      const exited = new Promise(done => child.once('exit', done))
      child.kill('SIGTERM')
      const timer = setTimeout(() => child.kill('SIGKILL'), 20_000)
      await exited
      clearTimeout(timer)
    }
    await model?.close()
    for (const path of [dir, `${dir}.state`, `${dir}.cache`, `${dir}.operator`]) if (path) rmSync(path, { recursive: true, force: true })
  })

  test('the write approval reaches the owner console only; the editor cannot answer it; refused, the file stays and the task\'s commit has the rest', async () => {
    const config = readFileSync(join(dir, 'presmium.workspace.yaml'), 'utf8')
    const ownerConsole = await eventStream(`${serveUrl}/__presmium/presmium.server/control?window=console&console=1`, as('owner@test', 'console'))
    const ownerSite = await eventStream(`${serveUrl}/__presmium/presmium.server/control?window=owner&document=intro`, as('owner@test'))
    const editorSite = await eventStream(`${serveUrl}/__presmium/presmium.server/control?window=editor&document=intro`, as('editor@test'))
    try {
      const info = await raw(`${serveUrl}/__presmium/presmium.assistant/info`, { headers: as('editor@test') })
      expect(info.json()).toEqual({ provider: 'Test Provider', kinds: ['question', 'annotations', 'chat', 'transcript'] })
      const submitted = await raw(`${serveUrl}/__presmium/presmium.assistant/tasks`, { headers: as('editor@test'), json: chat('改写笔记与工作区配置') })
      expect(submitted.status, submitted.text).toBe(201)
      const id = submitted.json<{ id: string }>().id
      const events = await eventStream(`${serveUrl}/__presmium/presmium.assistant/tasks/${id}/events`, as('editor@test'))
      try {
        const asked = await ownerConsole.next('approval', 120_000) as { id: string, request: Record<string, unknown> }
        expect(asked.request).toMatchObject({ kind: 'write', scope: 'workspace', from: `agent:${id}`, member: 'editor@test' })
        expect(String(asked.request.title)).toContain('presmium.workspace.yaml')
        // Neither the editor's page nor the owner's page on the site has it to answer.
        expect(await ownerSite.next('pending')).toMatchObject({ count: 1 })
        expect(editorSite.events.filter(e => e.event === 'approval')).toEqual([])
        expect(ownerSite.events.filter(e => e.event === 'approval')).toEqual([])
        const byEditor = await raw(`${serveUrl}/__presmium/presmium.server/control`, { headers: as('editor@test'), json: { window: 'editor', type: 'answer', id: asked.id, allow: true } })
        expect(byEditor.status).toBe(403)
        const byOwner = await raw(`${serveUrl}/__presmium/presmium.server/control`, {
          headers: { ...as('owner@test', 'console'), 'Origin': `http://console.test:${PORTS.shared}`, 'Presmium-Console': '1' },
          json: { window: 'console', type: 'answer', id: asked.id, allow: false },
        })
        expect(byOwner.status, byOwner.text).toBe(200)

        const review = await next(events, 'review')
        expect(review.engine).toBe('git')
        expect(review.changes.map((c: { path: string }) => c.path)).toEqual(['intro/notes.md'])
        const decided = await raw(`${serveUrl}/__presmium/presmium.assistant/tasks/${id}/review`, { headers: as('editor@test'), json: { accept: true } })
        expect(decided.status, decided.text).toBe(204)
        const done = await next(events, 'done')
        expect(readFileSync(join(dir, 'presmium.workspace.yaml'), 'utf8')).toBe(config)
        expect(filesOf(dir, done.revision)).toEqual(['intro/notes.md'])
        expect(commits(dir)[0]!.trailers).toMatch(/^Co-authored-by: .*editor@test/m)
      } finally {
        events.close()
      }
    } finally {
      for (const stream of [ownerConsole, ownerSite, editorSite]) stream.close()
    }
  })
})
