import { execFileSync, spawn } from 'node:child_process'
import type { ChildProcess } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, test } from '@playwright/test'
import type { Locator, Page } from '@playwright/test'
import { fakeModel } from '../packages/cli/src/testing.ts'
import type { FakeModel } from '../packages/cli/src/testing.ts'
import { eventStream } from '../packages/addon-assistant/test/helpers.ts'
import type { EventStream } from '../packages/addon-assistant/test/helpers.ts'
import { qualification } from '../packages/addon-deltabox/test/helpers.ts'
import { openDevPage } from './fixtures/deck.ts'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const FIXTURE = join(ROOT, 'e2e/fixtures/assistant-edit')
const PRESMIUM = join(ROOT, 'packages/cli/bin/presmium.mjs')
const AGENT = join(ROOT, 'packages/addon-assistant/test/fixtures/scripted-agent.mjs')
const ASSISTANT = join(ROOT, 'packages/addon-assistant')

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

const commits = (dir: string) => git(dir, ['log', '--format=%H%x00%s%x00%(trailers:only)%x1e']).split('\x1e').map(entry => entry.trim()).filter(Boolean).map((entry) => {
  const [id = '', subject = '', trailers = ''] = entry.split('\0')
  return { id, subject, trailers }
})
const filesOf = (dir: string, id: string) => git(dir, ['show', '--name-only', '--format=', id]).split('\n').filter(Boolean).sort()

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

async function serve(dir: string, extra: Record<string, string> = {}, runtime: 'scripted' | 'bundled' = 'scripted'): Promise<Serve> {
  const scripted: Record<string, string> = runtime === 'scripted' ? { PRESMIUM_AGENT_COMMAND: `${process.execPath} ${AGENT}`, PRESMIUM_AGENT_PROVIDER: 'Test Provider', SCRIPTED_AGENT_LOG: `${dir}.agent.log` } : {}
  const child = spawn(process.execPath, [PRESMIUM, 'serve', '--port', '0'], {
    cwd: dir,
    env: clean({ ...scripted, XDG_STATE_HOME: `${dir}.state`, XDG_CACHE_HOME: `${dir}.cache`, XDG_CONFIG_HOME: `${dir}.config`, ...extra }),
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

async function call(server: Serve, document: string, path: string, json?: unknown): Promise<{ status: number, json: Record<string, any> }> {
  const response = await fetch(`${server.url}/__presmium/presmium.assistant/${path}`, {
    method: json === undefined ? 'GET' : 'POST',
    headers: { 'Presmium-Document': encodeURIComponent(document), ...json === undefined ? {} : { 'Content-Type': 'application/json' } },
    ...json === undefined ? {} : { body: JSON.stringify(json) },
  })
  const text = await response.text()
  return { status: response.status, json: text ? JSON.parse(text) as Record<string, any> : {} }
}

async function submit(server: Serve, document: string, body: Record<string, unknown>): Promise<{ id: string, events: EventStream }> {
  const submitted = await call(server, document, 'tasks', body)
  expect(submitted.status, JSON.stringify(submitted.json)).toBe(201)
  const id = submitted.json.id as string
  return { id, events: await eventStream(`${server.url}/__presmium/presmium.assistant/tasks/${id}/events?document=${encodeURIComponent(document)}`) }
}

async function next(events: EventStream, ...types: string[]): Promise<Record<string, any>> {
  for (;;) {
    const event = await events.next('message', 90_000)
    if (types.includes(event.type)) return event
    if (event.type === 'error') throw new Error(`the task failed: ${event.message}`)
  }
}

const chat = (prompt: string) => ({ kind: 'chat', prompt, context: { document: '', section: 'x' } })

async function plantCommonDirectory(server: Serve, dir: string): Promise<string> {
  const planted = [
    '#append evil/config [filter "planted"]',
    '#append evil/config   clean = touch planted-commondir',
    '#append evil/objects/info/keep x',
    '#append evil/refs/keep x',
    '#append .gitattributes * filter=planted',
    '#append .git/commondir ../evil',
    '#append lecture.md agent 写的一行',
  ]
  const others = ['.gitattributes', 'evil/config', 'evil/objects/info/keep', 'evil/refs/keep']
  const { id, events } = await submit(server, '', chat(planted.join('\n')))
  let engine: string
  try {
    const review = await next(events, 'review')
    engine = review.engine as string
    const paths = review.changes.map((c: { path: string }) => c.path).sort()
    expect(paths).toEqual([...engine === 'git' ? [] : ['.git/commondir'], ...others, 'lecture.md'].sort())
    expect((await call(server, '', `tasks/${id}/review`, { accept: true, reject: others })).status).toBe(204)
    const done = await next(events, 'done')
    expect(filesOf(dir, done.revision)).toEqual(['lecture.md'])
  } finally {
    events.close()
  }
  expect(existsSync(join(dir, '.git/commondir'))).toBe(false)
  expect(existsSync(join(dir, 'evil'))).toBe(false)
  expect(existsSync(join(dir, 'planted-commondir'))).toBe(false)
  return engine
}

const agentLog = (dir: string) => (existsSync(`${dir}.agent.log`) ? readFileSync(`${dir}.agent.log`, 'utf8').split('\n').filter(Boolean).map(line => JSON.parse(line) as Record<string, any>) : [])

const deltabox = qualification()

test.describe.configure({ mode: 'serial', timeout: 240_000 })

test.describe('in the browser: annotations, chat, review and undo', () => {
  let dir: string
  let server: Serve

  test.beforeAll(async () => {
    test.setTimeout(300_000)
    dir = workspace('browser')
    server = await serve(dir)
  })
  test.afterAll(async () => {
    await server?.stop()
    for (const path of [dir, `${dir}.state`, `${dir}.cache`, `${dir}.agent.log`]) if (path) rmSync(path, { recursive: true, force: true })
  })

  async function editPanel(page: Page, document: string) {
    const panel = page.getByRole('region', { name: '批注与对话' })
    for (let visit = 0; visit < 2; visit++) {
      await openDevPage(page, `${server.url}/${document}/`, page.locator('[data-section]').first())
      await page.locator('.pm-workspace-edit').filter({ visible: true }).click()
      await expect(panel).toBeVisible({ timeout: 30_000 })
      await page.waitForLoadState('networkidle')
    }
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
    await expect(annotationsPanel.locator('.pm-assistant-edit__provider')).toHaveText('修改由 Test Provider 的模型完成')
    await expect(chatPanel.locator('.pm-assistant-edit__provider')).toHaveText('修改由 Test Provider 的模型完成')

    await page.evaluate(() => (window as unknown as { unreloaded: boolean }).unreloaded = true)
    for (const [text, request] of [['第一段讲解', '第一段讲解：分词把文字切成更小的词元。'], ['第二段讲解', '第二段讲解：词表越大，输入越短。']]) {
      await page.locator('[data-section] [data-block]', { hasText: text! }).first().click()
      await expect(annotationsPanel.locator('.pm-assistant-edit__excerpt')).toContainText(text!)
      await annotationsPanel.getByLabel('要求').fill(request!)
      await annotationsPanel.getByRole('button', { name: '添加批注' }).click()
    }
    await expect(annotationsPanel.locator('.pm-assistant-annotation[data-status="draft"]')).toHaveCount(2)
    await annotationsPanel.getByRole('button', { name: '发送 2 条批注' }).click()

    await expect(page.locator('[data-section]').getByText('第一段讲解：分词把文字切成更小的词元。')).toBeVisible({ timeout: 60_000 })
    await expect(page.locator('[data-section]').getByText('第二段讲解：词表越大，输入越短。')).toBeVisible()
    expect(await page.evaluate(() => (window as unknown as { unreloaded?: boolean }).unreloaded)).toBe(true)

    const task = panel.getByRole('region', { name: '修改任务' }).first()
    await expect(task).toHaveAttribute('data-state', 'review', { timeout: 60_000 })
    const file = task.locator('.pm-assistant-change[data-path="week5/lecture.md"]')
    await expect(file).toContainText('修改 +2 −2')
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
    const done = annotationsPanel.locator('.pm-assistant-annotation[data-status="done"]')
    await expect(done).toHaveCount(2)
    await expect(done.first().locator('.pm-assistant-annotation__status')).toHaveText('已处理')
    await expect(done.first().locator('.pm-assistant-annotation__note')).toContainText('已把 lecture.md 第')

    await chatPanel.getByLabel('消息').fill('在本章末尾新增一节')
    await chatPanel.getByRole('button', { name: '发送' }).click()
    await expect(page.getByRole('heading', { name: 'agent 新增的一节' })).toBeVisible({ timeout: 60_000 })
    const chatTask = panel.getByRole('region', { name: '修改任务' }).first()
    await expect(chatTask).toHaveAttribute('data-state', 'review', { timeout: 60_000 })
    await chatTask.getByRole('button', { name: '全部接受' }).click()
    await expect(chatTask.locator('.pm-assistant-edit__outcome')).toContainText('已提交')
    expect(commits(dir)).toHaveLength(before + 2)
    expect(commits(dir)[0]!.subject).toBe('对话修改：在本章末尾新增一节')

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
    const home = await call(server, '', 'info')
    expect(home.json).toEqual({ provider: 'Test Provider', source: 'environment', kinds: ['annotations', 'chat', 'transcript'], changes: true, home: true })
    expect((await call(server, '', 'tasks', chat('#append lecture.md 首页不是文档'))).status).toBe(400)
    const before = commits(dir).length
    await openDevPage(page, `${server.url}/`, page.locator('.pm-site-home__document[data-document="intro"]'))
    await page.locator('.pm-workspace-documents__toggle').click()
    const documents = page.getByRole('dialog', { name: '管理文档' })
    await documents.locator('input[name="dir"]').fill('week6')
    await documents.locator('input[name="title"]').fill('第六周')
    await documents.getByRole('checkbox', { name: '由 agent 起草（模型由 Test Provider 提供）' }).check()
    await documents.locator('textarea[name="request"]').fill('写一节关于上下文窗口的讲义')
    await documents.getByRole('button', { name: '新建', exact: true }).click()

    const draft = documents.locator('.pm-workspace-draft')
    await expect(draft).toHaveAttribute('data-state', 'review', { timeout: 60_000 })
    await expect(draft.locator('.pm-workspace-draft__changes')).toContainText('week6/lecture.md')
    await draft.getByRole('button', { name: '接受' }).click()
    await expect(page).toHaveURL(`${server.url}/week6/`, { timeout: 60_000 })
    await openDevPage(page, `${server.url}/week6/`, page.locator('[data-section]').getByText('这是 agent 按要求写出的初稿：写一节关于上下文窗口的讲义'))
    const lecture = readFileSync(join(dir, 'week6/lecture.md'), 'utf8')
    expect(lecture).toContain('## 上下文窗口')
    expect(lecture).toContain('title: "第六周"')
    const [drafted, created] = commits(dir)
    expect(commits(dir)).toHaveLength(before + 2)
    expect(created!.trailers).toMatch(/^Presmium-Origin: document create week6$/m)
    expect(drafted!.trailers).toMatch(/^Presmium-Origin: agent$/m)
    expect(drafted!.trailers).toMatch(/^Presmium-Task: \S+$/m)
    expect(drafted!.subject).toBe('起草：写一节关于上下文窗口的讲义')
    expect(filesOf(dir, drafted!.id)).toEqual(['week6/lecture.md'])
  })
})

test.describe('the review with git (D12), one task per document, a transcript, the operator directory', () => {
  let dir: string
  let server: Serve
  let operator: string
  const start = () => serve(dir, { PRESMIUM_OPERATOR_DIR: operator })

  test.beforeAll(async () => {
    test.setTimeout(300_000)
    dir = workspace('git', '  presmium.deltabox:\n    review: false\n')
    symlinkSync(join(ROOT, 'packages/render-notebook'), join(dir, 'node_modules/@presmium/render-notebook'), 'junction')
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

  test('the review\'s git reads none of the repository\'s configuration: a filter driver defined there never runs while the review runs git (WP-92d)', async () => {
    const config = join(dir, '.git/config')
    const kept = readFileSync(config, 'utf8')
    writeFileSync(config, `${kept}[filter "planted"]\n\tclean = touch planted\n`)
    try {
      const { id, events } = await submit(server, 'intro', chat('#append .gitattributes * filter=planted\n#append notes.md 过滤驱动之下的一行'))
      try {
        const review = await next(events, 'review')
        expect(review.changes.map((c: { path: string }) => c.path)).toEqual(['intro/.gitattributes', 'intro/notes.md'])
        expect(review.steps.length).toBeGreaterThan(1)
        expect(existsSync(join(dir, 'planted'))).toBe(false)
        expect((await call(server, 'intro', `tasks/${id}/review`, { accept: false })).status).toBe(204)
        expect(await next(events, 'done')).toEqual({ type: 'done' })
        expect(existsSync(join(dir, 'intro/.gitattributes'))).toBe(false)
        expect(existsSync(join(dir, 'planted'))).toBe(false)
      } finally {
        events.close()
      }
    } finally {
      writeFileSync(config, kept)
    }
  })

  test('a second change task of a document is refused while the first waits for its review; a transcript task through the tasks route is committed', async () => {
    const first = await submit(server, 'intro', chat('#append lecture.md 第一个任务的一行'))
    try {
      await next(first.events, 'review')
      const second = await call(server, 'intro', 'tasks', chat('#append lecture.md 第二个任务的一行'))
      expect(second.status).toBe(409)
      expect(second.json.error).toBe('这份文档已有一个进行中或等待审阅的修改任务，请先完成它')
      expect((await call(server, 'intro', 'tasks', { kind: 'question', prompt: '合并的是哪一对？', context: { document: '' } })).status).toBe(400)
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
      expect(agentLog(dir).some(e => e.event === 'session/prompt' && e.question === '按章节把整理后的逐字稿写成讲解')).toBe(true)
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

  test('a write through a link in the document to a directory outside it is the owner\'s to allow (its real path): refused, nothing is written', async () => {
    mkdirSync(join(dir, 'shared-notes'))
    symlinkSync('../shared-notes', join(dir, 'intro/linked'))
    const window = await eventStream(`${server.url}/__presmium/presmium.server/control?window=linked&document=intro`)
    try {
      const { id, events } = await submit(server, 'intro', chat('#append linked/glossary.md 经链接写到文档之外'))
      try {
        const asked = await window.next('approval', 60_000) as { id: string, request: Record<string, unknown> }
        expect(asked.request).toMatchObject({ kind: 'write', scope: 'workspace', from: `agent:${id}` })
        expect(String(asked.request.title)).toContain(join(realpathSync(dir), 'shared-notes/glossary.md'))
        await fetch(`${server.url}/__presmium/presmium.server/control`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ window: 'linked', type: 'answer', id: asked.id, allow: false }) })
        expect(await next(events, 'done')).toEqual({ type: 'done' })
        expect(existsSync(join(dir, 'shared-notes/glossary.md'))).toBe(false)
      } finally {
        events.close()
      }
    } finally {
      window.close()
      rmSync(join(dir, 'intro/linked'))
      rmSync(join(dir, 'shared-notes'), { recursive: true })
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

  test('the agent\'s build through MCP is no change of the document: the review lists only the source it wrote (F-51)', async () => {
    const window = await eventStream(`${server.url}/__presmium/presmium.server/control?window=build&document=intro`)
    const { id, events } = await submit(server, 'intro', chat('#append notes.md 构建之前写的一行\n#build notebook'))
    try {
      const asked = await window.next('approval', 60_000) as { id: string, request: Record<string, unknown> }
      expect(asked.request).toMatchObject({ kind: 'operate', from: 'presmium.mcp' })
      await fetch(`${server.url}/__presmium/presmium.server/control`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ window: 'build', type: 'answer', id: asked.id, allow: true }) })
      const review = await next(events, 'review')
      expect(review.changes.map((c: { path: string }) => c.path)).toEqual(['intro/notes.md'])
      const built = agentLog(dir).filter(e => e.event === 'build').at(-1)!
      expect(built.isError, built.result).toBe(false)
      expect((JSON.parse(built.result as string) as { outputs: { renderer: string }[] }).outputs.map(output => output.renderer)).toEqual(['notebook'])
      expect(existsSync(join(dir, 'intro/dist'))).toBe(false)
      expect((await call(server, 'intro', `tasks/${id}/review`, { accept: false })).status).toBe(204)
      await next(events, 'done')
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

test.describe('the review kept by the server: a reload, a step undone, no page, a crash, an undo meanwhile', () => {
  const UNATTENDED_MS = 3000
  let dir: string
  let server: Serve
  const start = () => serve(dir)

  test.beforeAll(async () => {
    test.setTimeout(300_000)
    dir = workspace('kept', '  presmium.deltabox:\n    review: false\n')
    server = await start()
  })
  test.afterAll(async () => {
    await server?.stop()
    for (const path of [dir, `${dir}.state`, `${dir}.cache`, `${dir}.agent.log`]) if (path) rmSync(path, { recursive: true, force: true })
  })

  const lecture = () => readFileSync(join(dir, 'intro/lecture.md'), 'utf8')

  async function editPanel(page: Page) {
    await openDevPage(page, `${server.url}/intro/`, page.locator('[data-section]').first())
    await page.locator('.pm-workspace-edit').filter({ visible: true }).click()
    const panel = page.getByRole('region', { name: '批注与对话' })
    await expect(panel).toBeVisible()
    return panel
  }

  async function sendChat(panel: Locator, message: string) {
    const chatPanel = panel.getByRole('region', { name: '对话' })
    await chatPanel.getByLabel('消息').fill(message)
    await chatPanel.getByRole('button', { name: '发送' }).click()
    const task = panel.getByRole('region', { name: '修改任务' }).first()
    await expect(task).toHaveAttribute('data-state', 'review', { timeout: 60_000 })
    return task
  }

  test('a page reloaded during the review takes it up again from the server, and accepting it commits', async ({ page }) => {
    const before = commits(dir).length
    await sendChat(await editPanel(page), '#append notes.md 刷新之前写的笔记')
    const panel = await editPanel(page)
    const task = panel.getByRole('region', { name: '修改任务' }).first()
    await expect(task).toHaveAttribute('data-state', 'review', { timeout: 30_000 })
    await expect(task.locator('.pm-assistant-edit__label')).toHaveText('#append notes.md 刷新之前写的笔记')
    await expect(task.locator('.pm-assistant-change[data-path="intro/notes.md"]')).toContainText('新建 +1')
    await task.getByRole('button', { name: '全部接受' }).click()
    await expect(task.locator('.pm-assistant-edit__outcome')).toContainText('已提交')
    expect(commits(dir)).toHaveLength(before + 1)
    expect(filesOf(dir, commits(dir)[0]!.id)).toEqual(['intro/notes.md'])
    expect(readFileSync(join(dir, 'intro/notes.md'), 'utf8')).toBe('刷新之前写的笔记\n')
  })

  test('back to before a step (P-115): that step\'s change is gone from the document and the review, the rest is committed', async ({ page }) => {
    const found = lecture()
    const before = commits(dir).length
    const task = await sendChat(await editPanel(page), '#append glossary.md 第一步的术语\n#sleep 2000\n#append lecture.md 第二步的一行')
    await task.locator('.pm-assistant-edit__steps summary').click()
    const steps = task.locator('.pm-assistant-edit__steps li')
    await expect(steps).toHaveCount(2)
    await expect(steps.nth(0)).toContainText('intro/glossary.md')
    await expect(steps.nth(1)).toContainText('intro/lecture.md')
    expect(lecture()).toContain('第二步的一行')

    await steps.nth(1).getByRole('button', { name: '回到「edit lecture.md」之前' }).click()
    await expect(task.locator('.pm-assistant-change')).toHaveCount(1)
    await expect(task.locator('.pm-assistant-change[data-path="intro/glossary.md"]')).toBeVisible()
    await expect(task.locator('.pm-assistant-edit__steps summary')).toHaveText('已记录 1 步')
    expect(lecture()).toBe(found)
    await expect(page.locator('[data-section]').getByText('第二步的一行')).toHaveCount(0, { timeout: 30_000 })
    await task.getByRole('button', { name: '全部接受' }).click()
    await expect(task.locator('.pm-assistant-edit__outcome')).toContainText('已提交')
    expect(commits(dir)).toHaveLength(before + 1)
    expect(filesOf(dir, commits(dir)[0]!.id)).toEqual(['intro/glossary.md'])
  })

  test('undoing a commit is refused while the document has a change task waiting for its review, and done after it', async () => {
    const committed = await submit(server, 'intro', chat('#append undo.md 要撤销的一行'))
    try {
      await next(committed.events, 'review')
      expect((await call(server, 'intro', `tasks/${committed.id}/review`, { accept: true })).status).toBe(204)
      await next(committed.events, 'done')
    } finally {
      committed.events.close()
    }
    const pending = await submit(server, 'intro', chat('#append lecture.md 等待审阅的一行'))
    try {
      await next(pending.events, 'review')
      const refused = await call(server, 'intro', 'revert', { task: committed.id })
      expect(refused.status).toBe(409)
      expect(refused.json.error).toBe('这份文档已有一个进行中或等待审阅的修改任务，请先完成它')
      expect(existsSync(join(dir, 'intro/undo.md'))).toBe(true)
      expect((await call(server, 'intro', `tasks/${pending.id}/review`, { accept: false })).status).toBe(204)
      await next(pending.events, 'done')
    } finally {
      pending.events.close()
    }
    const undone = await call(server, 'intro', 'revert', { task: committed.id })
    expect(undone.status, JSON.stringify(undone.json)).toBe(200)
    expect(existsSync(join(dir, 'intro/undo.md'))).toBe(false)
  })

  test('while a change task waits for its review, the document\'s rename, copy and delete and the history\'s undo get 409, the panel saying so in the page\'s language; the review then rejects and accepts cleanly (F-09)', async ({ page }) => {
    const workspaceRoute = (document: string, path: string, json: unknown) => fetch(`${server.url}/__presmium/presmium.workspace/${path}`, {
      method: 'POST',
      headers: { 'Presmium-Document': encodeURIComponent(document), 'Content-Type': 'application/json' },
      body: JSON.stringify(json),
    })
    const committed = await submit(server, 'intro', chat('#append held.md 之后要撤销的一行'))
    let revision: string
    try {
      await next(committed.events, 'review')
      expect((await call(server, 'intro', `tasks/${committed.id}/review`, { accept: true })).status).toBe(204)
      revision = (await next(committed.events, 'done')).revision as string
    } finally {
      committed.events.close()
    }

    for (const accept of [false, true]) {
      const found = lecture()
      const before = commits(dir).length
      const pending = await submit(server, 'intro', chat(`#append lecture.md 等待审阅时的一行 ${accept}`))
      try {
        await next(pending.events, 'review')
        for (const operation of [{ op: 'rename', dir: 'intro', to: 'intro-moved' }, { op: 'copy', dir: 'intro', to: 'intro-copied' }, { op: 'delete', dir: 'intro' }]) {
          const refused = await workspaceRoute('', 'documents', operation)
          expect(refused.status, operation.op).toBe(409)
          expect(await refused.json()).toEqual({ error: expect.stringContaining(`agent:${pending.id}`), locked: { document: 'intro', holder: `agent:${pending.id}` } })
        }
        if (accept) {
          expect((await workspaceRoute('intro', 'revisions/revert', { id: revision })).status).toBe(409)
        } else {
          await openDevPage(page, `${server.url}/intro/`, page.locator('[data-section]').first())
          await page.locator('.pm-workspace-history__toggle').filter({ visible: true }).click()
          const history = page.getByRole('dialog', { name: '修改历史' })
          await history.locator(`.pm-workspace-revision[data-revision="${revision}"] .pm-workspace-revision__revert`).click()
          await expect(history.locator('.pm-workspace-history__message')).toHaveText('文档 intro 现在不能修改：agent 的修改任务正在进行或等待审阅，完成后再试。')
        }
        for (const made of ['intro-moved', 'intro-copied']) expect(existsSync(join(dir, made))).toBe(false)
        expect(existsSync(join(dir, 'intro/held.md'))).toBe(true)
        expect(commits(dir)).toHaveLength(before)

        expect((await call(server, 'intro', `tasks/${pending.id}/review`, { accept })).status).toBe(204)
        const done = await next(pending.events, 'done')
        if (accept) {
          expect(filesOf(dir, done.revision)).toEqual(['intro/lecture.md'])
          expect(commits(dir)).toHaveLength(before + 1)
        } else {
          expect(lecture()).toBe(found)
          expect(commits(dir)).toHaveLength(before)
        }
        expect(git(dir, ['status', '--porcelain', '--', 'intro'])).toBe('')
      } finally {
        pending.events.close()
      }
    }
    const undone = await workspaceRoute('intro', 'revisions/revert', { id: revision })
    expect(undone.status, await undone.clone().text()).toBe(200)
    expect(existsSync(join(dir, 'intro/held.md'))).toBe(false)
  })

  test('a review no page follows is rolled back after the operator\'s time, and the document takes a change task again', async () => {
    await server.stop()
    writeFileSync(join(dir, 'presmium.workspace.yaml'), `${readFileSync(join(dir, 'presmium.workspace.yaml'), 'utf8')}  presmium.assistant:\n    reviewTimeoutMs: ${UNATTENDED_MS}\n`)
    server = await start()
    const found = lecture()
    const { id, events } = await submit(server, 'intro', chat('#append lecture.md 没有人审阅的一行\n#append left.md 没有人审阅的文件'))
    await next(events, 'review')
    expect((await call(server, 'intro', 'tasks')).json.change).toMatchObject({ id, kind: 'chat', prompt: '#append lecture.md 没有人审阅的一行\n#append left.md 没有人审阅的文件' })
    events.close()
    expect(lecture()).toContain('没有人审阅的一行')
    await expect.poll(() => lecture(), { timeout: UNATTENDED_MS + 20_000 }).toBe(found)
    expect(existsSync(join(dir, 'intro/left.md'))).toBe(false)
    await expect.poll(async () => (await call(server, 'intro', 'tasks')).json).toEqual({})
    expect(server.output()).toContain(`task ${id}: no page followed its review for ${UNATTENDED_MS / 1000} s: rolled back`)
    const again = await submit(server, 'intro', chat('#append later.md 之后的任务'))
    try {
      await next(again.events, 'review')
      expect((await call(server, 'intro', `tasks/${again.id}/review`, { accept: false })).status).toBe(204)
      await next(again.events, 'done')
    } finally {
      again.events.close()
    }
  })

  test('a review a crashed server left is rolled back when the document is served again', async () => {
    const found = lecture()
    const { events } = await submit(server, 'intro', chat('#append lecture.md 崩溃时还在审阅\n#append crash.md 崩溃时的文件'))
    await next(events, 'review')
    events.close()
    const exited = new Promise(done => server.child.once('exit', done))
    server.child.kill('SIGKILL')
    await exited
    expect(lecture()).toContain('崩溃时还在审阅')
    expect(existsSync(join(dir, 'intro/crash.md'))).toBe(true)

    server = await start()
    expect((await call(server, 'intro', 'info')).status).toBe(200)
    await expect.poll(() => lecture(), { timeout: 30_000 }).toBe(found)
    expect(existsSync(join(dir, 'intro/crash.md'))).toBe(false)
    expect(server.output()).toMatch(/task \S+ was waiting for its review when the server ended: rolled back \(intro\/crash\.md, intro\/lecture\.md\)/)
  })
})

test.describe('a single-deck repository: the workspace configuration in the review needs the owner', () => {
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
    server = await serve(dir)
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

  test('the agent\'s .git/commondir naming a common directory with a filter driver is put back, whichever the review: the driver never runs', async () => {
    const engine = await plantCommonDirectory(server, dir)
    if (engine === 'git') expect(server.output()).toMatch(/the agent changed the git directory, put back: .*\.git\/commondir/)
  })
})

test.describe('a single-deck repository with the git review: the git directory as the task found it', () => {
  let dir: string
  let server: Serve

  test.beforeAll(async () => {
    test.setTimeout(300_000)
    dir = workspace('single-git', '', {
      'presmium.workspace.yaml': `title: 单份文稿\nsettings:\n  presmium.workspace:\n    plugins: ['@presmium/slidev-addon-assistant']\n  presmium.deltabox:\n    review: false\n`,
      'lecture.md': '---\ntitle: 单份文稿\n---\n\n# 引言\n\n## 第一节\n\n开始时的内容。\n',
    })
    server = await serve(dir)
  })
  test.afterAll(async () => {
    await server?.stop()
    for (const path of [dir, `${dir}.state`, `${dir}.cache`, `${dir}.agent.log`]) if (path) rmSync(path, { recursive: true, force: true })
  })

  test('a common directory the agent planted through .git/commondir is put back before the review runs git (its git directories are fixed besides): the driver never runs', async () => {
    expect(await plantCommonDirectory(server, dir)).toBe('git')
    expect(server.output()).toMatch(/the agent changed the git directory, put back: .*\.git\/commondir/)
  })
})

test.describe('the bundled DeepSeek Harness with the default settings, in a single-deck repository', () => {
  let dir: string
  let server: Serve
  let model: FakeModel

  test.beforeAll(async () => {
    test.setTimeout(300_000)
    dir = workspace('dsh', '', {
      'presmium.workspace.yaml': `title: 单份文稿\nsettings:\n  presmium.workspace:\n    plugins: ['@presmium/slidev-addon-assistant']\n`,
      'lecture.md': '---\ntitle: 单份文稿\n---\n\n# 引言\n\n## 第一节\n\n开始时的内容。\n',
    })
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
    server = await serve(dir, { PRESMIUM_MODEL_URL: model.url, PRESMIUM_MODEL_KEY: 'model-key-81e', PRESMIUM_MODEL_PROVIDER: 'Test Provider' }, 'bundled')
  })
  test.afterAll(async () => {
    await server?.stop()
    await model?.close()
    for (const path of [dir, `${dir}.state`, `${dir}.cache`]) if (path) rmSync(path, { recursive: true, force: true })
  })

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
    expect(git(dir, ['status', '--porcelain', '--untracked-files=all'])).toBe('')
    if (deltabox.ok) expect(server.output()).toContain('change tasks use the assistant\'s git review, not deltabox\'s')
  })

  test('what it writes in the repository\'s git directory is put back before the review runs git: no hook, no filter driver', async () => {
    const config = readFileSync(join(dir, '.git/config'), 'utf8')
    const { paths, revision } = await accepted('写备注', ['.gitattributes'])
    expect(paths).toEqual(['.gitattributes', 'remarks.md'])
    expect(filesOf(dir, revision)).toEqual(['remarks.md'])
    expect(existsSync(join(dir, '.git/hooks/post-checkout'))).toBe(false)
    expect(readFileSync(join(dir, '.git/config'), 'utf8')).toBe(config)
    expect(existsSync(join(dir, 'planted'))).toBe(false)
    expect(server.output()).toMatch(/the agent changed the git directory, put back: .*\.git\/hooks\/post-checkout/)
    expect(server.output()).toMatch(/the agent changed the git directory, put back: .*\.git\/config/)
  })
})

test.describe('the model settings in the page: the bundled DeepSeek Harness with what was filled in there (P-111)', () => {
  let dir: string
  let server: Serve
  let model: FakeModel

  test.beforeAll(async () => {
    test.setTimeout(300_000)
    dir = workspace('settings')
    model = await fakeModel([
      { tool: 'write', input: { file_path: 'notes.md', content: '页面设置的模型写的笔记\n' } },
      { text: '完毕：写了笔记。' },
    ])
    server = await serve(dir, {}, 'bundled')
  })
  test.afterAll(async () => {
    await server?.stop()
    await model?.close()
    for (const path of [dir, `${dir}.state`, `${dir}.cache`, `${dir}.config`]) if (path) rmSync(path, { recursive: true, force: true })
  })

  test('"AI changes" on the home page says what to set; the settings saved there apply at once: a document\'s chat completes a change, and the model receives the page\'s key and model', async ({ page }) => {
    await openDevPage(page, `${server.url}/`, page.locator('.pm-site-home__document[data-document="intro"]'))
    await page.locator('.pm-assistant-edit-toolbar').filter({ visible: true }).getByRole('button', { name: 'AI 修改' }).click()
    const status = page.getByRole('dialog', { name: 'AI 修改' })
    await expect(status).toContainText('AI 修改不可用：没有配置模型。')
    await expect(status).toContainText('DEEPSEEK_API_KEY')
    await expect(status).toContainText('进入编辑模式后点选内容写批注')
    await status.getByRole('button', { name: '模型设置' }).click()
    const settings = page.getByRole('dialog', { name: '模型设置' })
    await expect(settings).toContainText('当前生效：没有配置')
    await settings.locator('select[name="service"]').selectOption('custom')
    await settings.locator('input[name="provider"]').fill('Page Provider')
    await settings.locator('input[name="url"]').fill(model.url)
    await settings.locator('input[name="key"]').fill('page-key-92b')
    await settings.locator('input[name="model"]').fill('page-model')
    await settings.getByRole('button', { name: '保存' }).click()
    await expect(settings.locator('.pm-assistant-model__saved')).toHaveText('已保存')
    await expect(settings).toContainText('当前生效：这里的设置（Page Provider）')
    await expect(settings).toContainText('密钥（已设置，留空则不变）')
    await expect(settings.locator('input[name="key"]')).toHaveValue('')
    expect(await page.content()).not.toContain('page-key-92b')
    expect(statSync(join(`${dir}.config`, 'presmium/assistant.json')).mode & 0o777).toBe(0o600)
    expect(git(dir, ['status', '--porcelain', '--untracked-files=all'])).toBe('')
    await settings.getByRole('button', { name: '关闭' }).click()
    await page.locator('.pm-assistant-edit-toolbar').filter({ visible: true }).getByRole('button', { name: 'AI 修改' }).click()
    await expect(status).toContainText('AI 修改由 Page Provider 的模型完成（来自模型设置）')

    await openDevPage(page, `${server.url}/intro/`, page.locator('[data-section]').first())
    await page.locator('.pm-assistant-edit-toolbar').filter({ visible: true }).getByRole('button', { name: 'AI 修改' }).click()
    const panel = page.getByRole('region', { name: '批注与对话' })
    const chatPanel = panel.getByRole('region', { name: '对话' })
    await expect(chatPanel.locator('.pm-assistant-edit__provider')).toHaveText('修改由 Page Provider 的模型完成')
    await chatPanel.getByLabel('消息').fill('写一份笔记')
    await chatPanel.getByRole('button', { name: '发送' }).click()
    const task = panel.getByRole('region', { name: '修改任务' }).first()
    await expect(task).toHaveAttribute('data-state', 'review', { timeout: 90_000 })
    await expect(task.locator('.pm-assistant-change[data-path="intro/notes.md"]')).toBeVisible()
    await task.getByRole('button', { name: '全部接受' }).click()
    await expect(task.locator('.pm-assistant-edit__outcome')).toContainText('已提交')
    expect(readFileSync(join(dir, 'intro/notes.md'), 'utf8')).toBe('页面设置的模型写的笔记\n')
    const asked = model.received.filter(r => r.path.endsWith('/v1/messages'))
    expect(asked.length).toBeGreaterThanOrEqual(2)
    for (const received of asked) {
      expect(received.headers['x-api-key']).toBe('page-key-92b')
      expect(received.body.model).toBe('page-model')
    }
  })
})
