// Editing the source in the browser (P-124, WP-95c; docs/architecture.md 5.11): `presmium serve` of a workspace
// copied from e2e/fixtures/editing, a git repository of its own, with the assistant installed at its root and the
// scripted test agent as its runtime. In edit mode a paragraph picked in the preview opens its lines in the source
// editor; a word changed there and saved (Ctrl+S) shows in the page without a reload; a section added in the source
// shows in the table of contents; the compilation's problems are listed under the editor and marked on their lines.
// The uncommitted changes head the history: committed with a line of explanation, the commit is there and undone
// there; discarded, the content is back as committed. A save while an agent's change task waits for its review is
// refused with a notice and the author's text stays; once the review is done, the merge keeps both sides' changes.
// On the home page the file tree opens a document's file on its page in edit mode, and the workspace's
// configuration in the home page's own editor.
import { execFileSync, spawn } from 'node:child_process'
import type { ChildProcess } from 'node:child_process'
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { eventStream } from '../packages/addon-assistant/test/helpers.ts'
import { openDevPage } from './fixtures/deck.ts'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const FIXTURE = join(ROOT, 'e2e/fixtures/editing')
const PRESMIUM = join(ROOT, 'packages/cli/bin/presmium.mjs')
const AGENT = join(ROOT, 'packages/addon-assistant/test/fixtures/scripted-agent.mjs')

/** The test's environment without Vitest's or Presmium's variables or credentials, then `extra`. */
function clean(extra: Record<string, string>): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env }
  delete env.NODE_ENV
  for (const name of Object.keys(env)) {
    if (name.startsWith('PRESMIUM_') || name.startsWith('DEEPSEEK_') || /(?:_KEY|_TOKEN|_SECRET|_PASSWORD|_APPID)$/i.test(name)) delete env[name]
  }
  return { ...env, ...extra }
}

function git(dir: string, args: string[]): string {
  return execFileSync('git', ['-c', 'core.hooksPath=/dev/null', '-c', 'user.name=Test', '-c', 'user.email=test@example.com', '-c', 'commit.gpgSign=false', ...args], { cwd: dir, encoding: 'utf8' })
}

/** The fixture as a workspace in examples/demo/.presmium (VitePress resolves from the demo's node_modules), served. */
async function serveWorkspace(): Promise<{ dir: string, url: string, child: ChildProcess }> {
  const work = join(ROOT, 'examples/demo/.presmium')
  mkdirSync(work, { recursive: true })
  const dir = mkdtempSync(join(work, 'e2e-editing-'))
  cpSync(FIXTURE, dir, { recursive: true })
  writeFileSync(join(dir, '.gitignore'), 'node_modules/\ndist/\n.presmium/\n')
  writeFileSync(join(dir, 'package.json'), `${JSON.stringify({ name: dir.split('/').at(-1)!.toLowerCase(), private: true, type: 'module' })}\n`)
  mkdirSync(join(dir, 'node_modules/@presmium'), { recursive: true })
  symlinkSync(join(ROOT, 'packages/addon-assistant'), join(dir, 'node_modules/@presmium/slidev-addon-assistant'), 'junction')
  git(dir, ['init', '-q', '-b', 'main'])
  git(dir, ['add', '-A'])
  git(dir, ['commit', '-q', '-m', 'Initial commit'])
  const child = spawn(process.execPath, [PRESMIUM, 'serve', '--port', '0'], {
    cwd: dir,
    env: clean({ PRESMIUM_AGENT_COMMAND: `${process.execPath} ${AGENT}`, PRESMIUM_AGENT_PROVIDER: 'Test Provider', XDG_STATE_HOME: `${dir}.state`, XDG_CACHE_HOME: `${dir}.cache`, XDG_CONFIG_HOME: `${dir}.config` }),
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  let output = ''
  const url = await new Promise<string>((resolve, reject) => {
    child.stdout!.on('data', (chunk: Buffer) => {
      output += chunk
      const found = /^serve {2}(http\S+)$/m.exec(output)
      if (found) resolve(found[1]!)
    })
    child.stderr!.on('data', (chunk: Buffer) => output += chunk)
    child.once('exit', code => reject(new Error(`presmium serve exited (${code}):\n${output}`)))
  })
  return { dir, url: `${url}/`, child }
}

test.describe('editing the source in the browser', () => {
  test.describe.configure({ mode: 'serial', timeout: 240_000 })
  let served: Awaited<ReturnType<typeof serveWorkspace>> | undefined
  const lecture = () => readFileSync(join(served!.dir, 'notes/lecture.md'), 'utf8')

  test.beforeAll(async () => {
    test.setTimeout(300_000)
    served = await serveWorkspace()
  })

  test.afterAll(async () => {
    const child = served?.child
    if (child && child.exitCode === null && child.signalCode === null) {
      const exited = new Promise(done => child.once('exit', done))
      child.kill('SIGTERM')
      await exited
    }
    for (const path of ['', '.state', '.cache', '.config']) if (served) rmSync(`${served.dir}${path}`, { recursive: true, force: true })
  })

  /** The document's page in edit mode, its entry open in the source editor; the window remembers it was not reloaded. */
  async function editMode(page: Page) {
    await openDevPage(page, `${served!.url}notes/`, page.locator('.pm-workspace-edit').filter({ visible: true }))
    await page.locator('.pm-workspace-edit').filter({ visible: true }).click()
    const editor = page.getByRole('region', { name: '源码' }).getByRole('textbox', { name: '源码' })
    await expect(editor).toContainText('这一段要改的词是')
    await page.evaluate(() => (window as unknown as { unreloaded: boolean }).unreloaded = true)
    return editor
  }

  const unreloaded = (page: Page) => page.evaluate(() => (window as unknown as { unreloaded?: boolean }).unreloaded === true)

  test('a paragraph picked in the preview opens its lines; a word changed and saved shows without a reload; the problems are listed', async ({ page }) => {
    const editor = await editMode(page)
    const tab = page.getByRole('tablist', { name: '打开的文件' }).getByRole('tab', { name: /^lecture\.md/ })
    await expect(tab).toHaveAttribute('aria-selected', 'true')

    // The block's source position (the IR's): its line, marked, the cursor on it.
    const paragraph = page.locator('.pm-section[data-section] .pm-block--markdown').filter({ hasText: '这一段要改的词是' })
    await paragraph.click()
    const line = lecture().split('\n').findIndex(text => text.includes('这一段要改的词是')) + 1
    await expect(page.getByRole('contentinfo', { name: '状态栏' }).locator('.pm-workspace-cursor')).toHaveText(`MyST · UTF-8 · 第 ${line} 行`)
    await expect(editor.locator('.cm-line.pm-cm-picked')).toHaveText('这一段要改的词是 alpha')
    expect(await paragraph.evaluate(el => getComputedStyle(el).outlineStyle)).toBe('solid')

    // One word changed: the tab says it is not saved until Ctrl+S; the page follows without a reload.
    await editor.focus()
    await page.keyboard.press('End')
    await page.keyboard.press('Shift+Control+ArrowLeft')
    await page.keyboard.type('omega')
    await expect(tab.locator('.pm-workspace-tab__dirty')).toHaveCount(1)
    await page.keyboard.press('Control+s')
    await expect(tab.locator('.pm-workspace-tab__dirty')).toHaveCount(0)
    await expect(page.locator('.pm-section[data-section] .pm-block--markdown').filter({ hasText: '这一段要改的词是 omega' })).toBeVisible()
    expect(lecture()).toContain('这一段要改的词是 omega\n')
    expect(await unreloaded(page)).toBe(true)

    // The compilation's problems: listed under the editor with their file and line, marked on the line once opened.
    const problems = page.getByRole('region', { name: /^问题 \d+$/ })
    const problem = problems.locator('.pm-source__problem').filter({ hasText: 'unknown directive' })
    const more = readFileSync(join(served!.dir, 'notes/pages/more.md'), 'utf8').split('\n').findIndex(text => text.startsWith(':::{nosuch}')) + 1
    await expect(problem.locator('.pm-source__problem-place')).toHaveText(`pages/more.md:${more}`)
    await problem.click()
    await expect(page.getByRole('tablist', { name: '打开的文件' }).getByRole('tab', { name: /^pages\/more\.md/ })).toHaveAttribute('aria-selected', 'true')
    await expect(page.locator('.pm-workspace-cursor')).toHaveText(`MyST · UTF-8 · 第 ${more} 行`)
    await expect(editor.locator('.cm-lintRange-error')).toHaveCount(1)
    // The preview follows the cursor to the included file's page; there the cursor put on a paragraph shows it, marked.
    await expect(page).toHaveURL(/\/notes\/more\.html/)
    await expect(page.locator('.pm-section[data-section="问题"]')).toBeVisible()
    await editor.locator('.cm-line').filter({ hasText: 'quokka' }).click()
    await expect(page.locator('.pm-workspace-cursor')).toHaveText('MyST · UTF-8 · 第 3 行')
    const quokka = page.locator('.pm-section[data-section] .pm-block--markdown').filter({ hasText: 'quokka' })
    await expect(quokka).toBeInViewport()
    await expect.poll(() => quokka.evaluate(el => getComputedStyle(el).outlineStyle)).toBe('solid')
    expect(await unreloaded(page)).toBe(true)
  })

  test('a section added in the source shows in the table of contents', async ({ page }) => {
    const editor = await editMode(page)
    await page.locator('.pm-section[data-section] .pm-block--markdown').filter({ hasText: '最常相邻的一对' }).click()
    await editor.focus()
    await page.keyboard.press('End')
    await page.keyboard.type('\n\n## 新加的一节\n\n新一节的内容。')
    await page.keyboard.press('Control+s')
    await expect(page.locator('.pm-section__title').filter({ hasText: '新加的一节' })).toBeVisible()
    expect(await unreloaded(page)).toBe(true)
    // Out of edit mode, the sidebar (the table of contents) has it.
    await page.locator('.pm-workspace-edit').filter({ visible: true }).click()
    await expect(page.locator('.VPSidebar').getByRole('link', { name: '新加的一节' })).toBeVisible()
    expect(await unreloaded(page)).toBe(true)
  })

  test('the uncommitted changes head the history; committed with a line of explanation, the commit is undone there', async ({ page }) => {
    await editMode(page)
    const before = git(served!.dir, ['rev-list', '--count', 'HEAD']).trim()
    await page.locator('.pm-workspace-history__toggle').filter({ visible: true }).click()
    const history = page.getByRole('dialog', { name: '修改历史' })
    const changes = history.getByRole('region', { name: '未提交的修改' })
    await expect(changes.locator('.pm-workspace-uncommitted__file')).toHaveAttribute('data-path', 'notes/lecture.md')
    await changes.getByRole('textbox', { name: '说明这次修改' }).fill('把 alpha 改成 omega，新加一节')
    await changes.getByRole('button', { name: '提交' }).click()
    const revision = history.locator('.pm-workspace-revision').first()
    await expect(revision.locator('.pm-workspace-revision__summary')).toHaveText('把 alpha 改成 omega，新加一节')
    await expect(revision.locator('.pm-workspace-revision__origin')).toHaveText('编辑')
    await expect(changes).toHaveCount(0)
    expect(Number(git(served!.dir, ['rev-list', '--count', 'HEAD']).trim())).toBe(Number(before) + 1)
    expect(git(served!.dir, ['log', '-1', '--format=%B'])).toContain('Presmium-Origin: editor')

    // Undone from the history: the file, the page and the editor are as before.
    await revision.getByRole('button', { name: '撤销' }).click()
    await expect(history.locator('.pm-workspace-revision').first()).toHaveAttribute('data-undo', 'undo')
    await expect.poll(lecture).toContain('这一段要改的词是 alpha\n')
    expect(lecture()).not.toContain('新加的一节')
    await expect(page.locator('.pm-section[data-section] .pm-block--markdown').filter({ hasText: '这一段要改的词是 alpha' })).toBeVisible()
    await expect(page.getByRole('region', { name: '源码' }).getByRole('textbox', { name: '源码' })).toContainText('这一段要改的词是 alpha')
    expect(await unreloaded(page)).toBe(true)
  })

  test('discarding the uncommitted changes brings the content back', async ({ page }) => {
    page.on('dialog', dialog => void dialog.accept())
    const editor = await editMode(page)
    await page.locator('.pm-section[data-section] .pm-block--markdown').filter({ hasText: '这一段要改的词是' }).click()
    await editor.focus()
    await page.keyboard.press('End')
    await page.keyboard.press('Shift+Control+ArrowLeft')
    await page.keyboard.type('beta')
    await page.keyboard.press('Control+s')
    await expect(page.locator('.pm-section[data-section] .pm-block--markdown').filter({ hasText: '这一段要改的词是 beta' })).toBeVisible()

    // "Commit 1 change" in the top bar: the changes, to commit or discard.
    const commit = page.getByRole('banner', { name: '编辑' }).getByRole('button', { name: '提交 1 处修改' })
    await commit.click()
    const panel = page.getByRole('dialog', { name: '提交 1 处修改' })
    await expect(panel.locator('.pm-workspace-uncommitted__file')).toContainText('lecture.md')
    await panel.getByRole('button', { name: '放弃' }).click()
    await expect.poll(lecture).toContain('这一段要改的词是 alpha\n')
    await expect(page.locator('.pm-section[data-section] .pm-block--markdown').filter({ hasText: '这一段要改的词是 alpha' })).toBeVisible()
    await expect(editor).toContainText('这一段要改的词是 alpha')
    await expect(commit).toHaveCount(0)
    expect(git(served!.dir, ['status', '--porcelain']).trim()).toBe('')
  })

  test('a save while an agent\'s change waits for its review is refused with a notice; after the review the merge keeps both sides', async ({ page }) => {
    const editor = await editMode(page)
    await page.locator('.pm-section[data-section] .pm-block--markdown').filter({ hasText: '这一段要改的词是' }).click()
    await editor.focus()
    await page.keyboard.press('End')
    await page.keyboard.press('Shift+Control+ArrowLeft')
    await page.keyboard.type('gamma')

    // The agent's change task appends a line to the file and waits for its review, holding the document.
    const assistant = (path: string, body?: unknown) => fetch(`${served!.url}__presmium/presmium.assistant/${path}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { 'Presmium-Document': 'notes', ...body === undefined ? {} : { 'Content-Type': 'application/json' } },
      ...body === undefined ? {} : { body: JSON.stringify(body) },
    })
    const submitted = await assistant('tasks', { kind: 'chat', prompt: '#append lecture.md AI 写的一行', context: { document: 'notes' } })
    expect(submitted.status).toBe(201)
    const { id } = await submitted.json() as { id: string }
    const events = await eventStream(`${served!.url}__presmium/presmium.assistant/tasks/${id}/events?document=notes`)
    try {
      for (;;) {
        const event = await events.next('message', 90_000)
        if (event.type === 'review') break
        if (event.type === 'error') throw new Error(`the task failed: ${event.message}`)
      }
      // The agent's line is in the file already (the git review shows the change in place).
      expect(lecture()).toContain('AI 写的一行')
      await page.keyboard.press('Control+s')
      const notice = page.locator('.pm-source__notice[data-kind="locked"]')
      await expect(notice).toContainText('AI 的修改任务正在进行或等待审阅，现在不能保存')
      await expect(page.getByRole('tab', { name: /^lecture\.md/ }).locator('.pm-workspace-tab__dirty')).toHaveCount(1)
      expect(lecture()).toContain('AI 写的一行')
      expect(lecture()).not.toContain('gamma')

      // The review accepted (one commit of the agent's): saving again finds the file changed; merged, both stay.
      expect((await assistant(`tasks/${id}/review`, { accept: true })).status).toBe(204)
      for (;;) {
        const event = await events.next('message', 90_000)
        if (event.type === 'done') break
        if (event.type === 'error') throw new Error(`the task failed: ${event.message}`)
      }
    } finally {
      events.close()
    }
    await page.locator('.pm-source__notice[data-kind="locked"]').getByRole('button', { name: '再次保存' }).click()
    const changed = page.locator('.pm-source__notice[data-kind="changed"]')
    await expect(changed).toContainText('lecture.md 在打开之后被修改了')
    await changed.getByRole('button', { name: '合并' }).click()
    await expect(page.locator('.pm-source__notice[data-kind="merged"]')).toContainText('已合并双方的修改')
    await expect(editor).toContainText('这一段要改的词是 gamma')
    await expect(editor).toContainText('AI 写的一行')
    await editor.focus()
    await page.keyboard.press('Control+s')
    await expect(page.getByRole('tab', { name: /^lecture\.md/ }).locator('.pm-workspace-tab__dirty')).toHaveCount(0)
    await expect.poll(lecture).toContain('这一段要改的词是 gamma\n')
    expect(lecture()).toContain('AI 写的一行')
  })

  test('the home page\'s file tree opens a document\'s file in edit mode, and the workspace\'s configuration in its own editor', async ({ page }) => {
    await openDevPage(page, served!.url, page.locator('.pm-site-home__document[data-document="notes"]'))
    const tree = page.getByRole('navigation', { name: '文件' })
    await tree.locator('.pm-workspace-tree__document[data-document="notes"]').click()
    await tree.getByRole('button', { name: 'pages/' }).click()
    await tree.locator('[data-path="notes/pages/more.md"]').click()
    await page.waitForURL(/\/notes\//)
    const tab = page.getByRole('tablist', { name: '打开的文件' }).getByRole('tab', { name: /^pages\/more\.md/ })
    await expect(tab).toHaveAttribute('aria-selected', 'true')
    await expect(page.getByRole('region', { name: '源码' }).getByRole('textbox', { name: '源码' })).toContainText('延伸一节的第一段 quokka')
    expect(new URL(page.url()).search).toBe('')

    await openDevPage(page, served!.url, page.locator('.pm-site-home__document[data-document="notes"]'))
    await page.getByRole('navigation', { name: '文件' }).locator('[data-path="presmium.workspace.yaml"]').click()
    const source = page.locator('.pm-workbench__source')
    await expect(source.getByRole('textbox', { name: '源码' })).toContainText('title: 编辑验收工作区')
    await expect(page.getByRole('contentinfo', { name: '状态栏' }).locator('.pm-workspace-cursor')).toHaveText(/^YAML · UTF-8 · 第 \d+ 行$/)
    // Back to the launcher by the activity bar's documents.
    await page.getByRole('navigation', { name: '活动' }).getByRole('button', { name: '文档' }).click()
    await expect(page.locator('.pm-site-home__document[data-document="notes"]')).toBeVisible()
  })
})
