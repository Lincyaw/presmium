import { execFileSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { fakeModel } from '../packages/cli/src/testing.ts'
import type { FakeModel } from '../packages/cli/src/testing.ts'
import { BRAND_SLOTS, EXPERIMENTAL_GROUP, LAYOUT_MEMBERS, ONBOARDING, ROOT_CHILDREN, SHELL_MODULES, UI_LAYOUT } from '../packages/dsh/src/client/contract.ts'
import { TOKENS } from '../packages/dsh/src/client/theme.ts'
import { lowContrast } from './fixtures/contrast.ts'
import { aliasTokens, clientOf, layoutMembersUsed, rendersSlot, rootChildren, shellModules } from './fixtures/workbench/audit.ts'
import { FALLBACK_PATCH, startStudio } from './fixtures/workbench/studio.ts'
import type { Studio } from './fixtures/workbench/studio.ts'

test.describe.configure({ mode: 'serial', timeout: 300_000 })
test.use({ locale: 'zh-CN', actionTimeout: 30_000 })

const preview = (page: Page) => page.frameLocator('.pmw-preview__frame')
const editor = (page: Page) => page.locator('.pmw-source__editor .cm-content')
const conversation = (page: Page) => page.locator('[data-pmw-slot="main:conversation"]')

async function openDocument(page: Page, title: string): Promise<void> {
  await page.locator('.pmw-home__card').filter({ hasText: title }).locator('.pmw-home__open').click()
  await expect(page.locator('.pmw-files__title')).toHaveText(title)
}

async function openFile(page: Page, name: string, text: string): Promise<void> {
  await page.locator('.pmw-tree__file', { hasText: name }).click()
  await expect(editor(page)).toContainText(text)
}

async function send(page: Page, message: string): Promise<void> {
  await conversation(page).locator('[contenteditable="true"]').first().click()
  await page.keyboard.type(message)
  await page.keyboard.press('Enter')
}

async function openWritten(page: Page, name: RegExp): Promise<void> {
  await expect(async () => {
    await conversation(page).getByRole('button', { name }).filter({ visible: true }).last().click({ timeout: 2000 })
  }).toPass({ timeout: 30_000 })
}

function git(dir: string, args: string[]): string {
  return execFileSync('git', ['-c', 'core.hooksPath=/dev/null', ...args], { cwd: dir, encoding: 'utf8' })
}

test.describe('the root layout', () => {
  let studio: Studio
  let model: FakeModel

  test.beforeAll(async () => {
    test.setTimeout(400_000)
    model = await fakeModel([
      { tool: 'write', input: { file_path: 'notes.md', content: '# 笔记\n\n第一条。\n' } },
      { text: '写好了。' },
      { tool: 'write', input: { file_path: 'notes-2.md', content: '# 笔记二\n' } },
      { text: '又写好了。' },
      { tool: 'write', input: { file_path: 'summary.md', content: '# 小结\n' } },
      { tool: 'write', input: { file_path: 'extra.md', content: '多出来的\n' } },
      { text: '改好了。' },
    ])
    studio = await startStudio({ port: 5643, model })
  })

  test.afterAll(async () => {
    await studio?.close()
    await model?.close()
  })

  test('the start audit: what the client part relies on is in the pinned DeepSeek Harness, and the page starts with no error @gate', async ({ page }) => {
    expect(rootChildren()).toEqual(ROOT_CHILDREN)
    expect(LAYOUT_MEMBERS).toEqual(expect.arrayContaining(layoutMembersUsed()))
    for (const slot of BRAND_SLOTS) expect(rendersSlot(slot), slot).toBe(true)
    const models = clientOf('@deepseek-ai/dsh-client-ui-settings-models')
    for (const step of ONBOARDING.steps) expect(models, step).toContain(`name: "${ONBOARDING.slot}",\n\t\t\t\tid: "${step}"`)
    const { defined, used } = aliasTokens()
    const mapped = Object.keys(TOKENS).filter(name => name.startsWith('--dsw-alias-'))
    expect([...used].filter(name => defined.has(name) && !mapped.includes(name))).toEqual([])
    expect(mapped.filter(name => !defined.has(name))).toEqual([])
    expect(shellModules()).toEqual([...SHELL_MODULES].sort())
    const plugins = clientOf('@deepseek-ai/dsh-client-ui-plugin-manager')
    expect(EXPERIMENTAL_GROUP).toBe('[data-plugin-group="extensions"]')
    expect(plugins).toContain('"data-plugin-group": id')
    expect(plugins).toContain('renderGroup("extensions"')

    const errors: string[] = []
    page.on('pageerror', error => errors.push(error.message))
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text())
    })
    await studio.open(page)
    await expect(page.locator('.pmw-frame')).toBeVisible()
    const boot = await page.evaluate(() => (window as unknown as { __DSH_BOOT__: { entries: { id: string }[] } }).__DSH_BOOT__.entries.map(entry => entry.id))
    expect(boot).toContain('@presmium/dsh')
    for (const off of [UI_LAYOUT, '@deepseek-ai/dsh-client-ui-brand-official', '@deepseek-ai/dsh-client-ui-settings-account']) expect(boot).not.toContain(off)
    await expect(page.locator('[data-pmw-slot="sidebar"] button').first()).toBeAttached()
    await expect(conversation(page).locator('[contenteditable="true"]')).toBeVisible()
    await expect(conversation(page).locator('svg.pmw-logo')).toBeVisible()
    await expect(page.locator('.pmw-home__card')).toHaveCount(2)
    expect(errors).toEqual([])
  })

  test('at 1440 and 390 px the activity bar, the files, the editor, the problems, the preview, the conversation, the sessions, the settings, Review and the files of the dock are reached and used', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await studio.open(page)
    const activity = page.getByRole('navigation', { name: '活动栏' })
    await expect(activity).toBeVisible()
    await openDocument(page, '分词入门')
    await openFile(page, 'lecture.md', '分词入门')
    await expect(page.getByRole('region', { name: '问题' })).toBeVisible()
    await expect(preview(page).locator('[data-section="words"]')).toBeVisible({ timeout: 120_000 })
    await send(page, '写一份笔记')
    await expect(conversation(page)).toContainText('写好了。', { timeout: 60_000 })
    await openWritten(page, /notes\.md/)
    const dock = page.locator('[data-pmw-slot="rightbar"]')
    await expect(dock).toContainText('第一条。')
    await dock.getByRole('button', { name: /^(New tab|新标签页)$/ }).first().click()
    await dock.getByText(/^(Workspace files|工作区文件)$/).first().click()
    await expect(dock.getByText('notes.md').first()).toBeVisible()
    await dock.getByRole('button', { name: /^(Collapse right sidebar|收起右侧边栏)$/ }).first().click()
    await activity.getByRole('button', { name: '会话' }).click()
    await expect(page.locator('[data-pmw-slot="sidebar"]')).toBeVisible()
    await expect(page.locator('[data-pmw-slot="sidebar"]').getByRole('button', { name: /^(New session|新建会话)$/i }).first()).toBeVisible()
    await activity.getByRole('button', { name: '设置' }).click()
    const settings = page.getByRole('dialog').filter({ hasText: /^(Settings|设置)/ })
    await expect(settings).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(settings).toBeHidden()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)

    await page.setViewportSize({ width: 390, height: 844 })
    await expect(page.locator('.pmw-frame[data-narrow]')).toBeVisible()
    await activity.getByRole('button', { name: '文件' }).click()
    await openFile(page, 'more.md', '延伸一节')
    await expect(editor(page)).toBeVisible()
    await expect(page.getByRole('region', { name: '问题' })).toBeVisible()
    await activity.getByRole('button', { name: '预览' }).click()
    await expect(page.locator('.pmw-preview__frame')).toBeVisible()
    await expect(preview(page).locator('[data-section="words"]')).toBeAttached()
    await activity.getByRole('button', { name: '会话' }).click()
    await expect(page.locator('[data-pmw-slot="sidebar"]').getByRole('button', { name: /^(New session|新建会话)$/i }).first()).toBeVisible()
    await activity.getByRole('button', { name: '对话' }).click()
    await expect(conversation(page)).toBeVisible()
    await send(page, '再写一份')
    await expect(conversation(page)).toContainText('又写好了。', { timeout: 60_000 })
    await openWritten(page, /notes-2\.md/)
    await expect(dock.getByText('笔记二').first()).toBeVisible()
    await dock.getByRole('button', { name: /^(New tab|新标签页)$/ }).first().click()
    await dock.getByText(/^(Workspace files|工作区文件)$/).first().click()
    await expect(dock.getByText('notes-2.md').first()).toBeVisible()
    await dock.getByRole('button', { name: /^(Collapse right sidebar|收起右侧边栏)$/ }).first().click()
    await activity.getByRole('button', { name: '设置' }).click()
    await expect(settings).toBeVisible()
    await page.keyboard.press('Escape')
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  })

  test('the side panel: its handle resizes it; the shortcut of ui-layout (Mod+Alt+B on the web, here Windows) closes and opens it', async ({ page }) => {
    await page.addInitScript(() => Object.defineProperty(Navigator.prototype, 'platform', { get: () => 'Win32' }))
    await page.setViewportSize({ width: 1440, height: 900 })
    await studio.open(page)
    const side = page.locator('.pmw-frame__side')
    await expect(side).toBeVisible()
    const width = (await side.boundingBox())!.width
    const handle = (await page.locator('.pmw-frame__handle[data-side="side"]').boundingBox())!
    await page.mouse.move(handle.x + 4, handle.y + 200)
    await page.mouse.down()
    await page.mouse.move(handle.x + 84, handle.y + 200, { steps: 8 })
    await page.mouse.up()
    await expect.poll(async () => (await side.boundingBox())!.width).toBeGreaterThan(width + 60)
    await page.locator('.pmw-home__heading').first().click()
    await page.keyboard.press('Control+Alt+KeyB')
    await expect(side).toBeHidden()
    await page.keyboard.press('Control+Alt+KeyB')
    await expect(side).toBeVisible()
  })

  test('a word changed and saved in the editor shows in the preview without a reload', async ({ page }) => {
    await studio.open(page)
    await openDocument(page, '分词入门')
    await openFile(page, 'lecture.md', '这一段要改的词是 alpha')
    await expect(preview(page).locator('[data-section="words"]')).toContainText('alpha', { timeout: 120_000 })
    await preview(page).locator('body').evaluate(() => (window as unknown as { kept: number }).kept = 1)
    await editor(page).getByText('这一段要改的词是 alpha').click()
    await page.keyboard.press('End')
    await page.keyboard.press('Backspace')
    await page.keyboard.type(' beta。')
    await expect(page.locator('.pmw-source__tab[data-active] .pmw-source__dot')).toBeVisible()
    await page.keyboard.press('Control+s')
    await expect(page.locator('.pmw-source__tab[data-active] .pmw-source__dot')).toBeHidden()
    await expect(preview(page).locator('[data-section="words"]')).toContainText('alpha beta', { timeout: 60_000 })
    expect(await preview(page).locator('body').evaluate(() => (window as unknown as { kept?: number }).kept)).toBe(1)
    expect(readFileSync(join(studio.workspace.dir, 'lectures/intro/lecture.md'), 'utf8')).toContain('alpha beta。')
  })

  test('a block picked in the preview opens its lines; the cursor frames its block in the preview; a problem leads to its line', async ({ page }) => {
    await studio.open(page)
    await openDocument(page, '分词入门')
    await expect(preview(page).locator('[data-section="merge"]')).toBeVisible({ timeout: 120_000 })
    await page.getByRole('button', { name: '点选' }).click()
    await expect(page.getByRole('button', { name: '点选' })).toHaveAttribute('aria-pressed', 'true')
    await preview(page).getByText('最常相邻的一对合并成一个新词元。').click()
    await expect(page.locator('.pmw-source__tab[data-active]')).toContainText('lecture.md')
    await expect(page.locator('.cm-line.pm-cm-picked')).toContainText('最常相邻的一对合并成一个新词元。')
    await page.getByRole('button', { name: '点选' }).click()
    await openFile(page, 'more.md', '延伸一节的第一段 quokka')
    await editor(page).getByText('延伸一节的第一段 quokka').click()
    await expect(preview(page).locator('[data-preview-highlight]')).toContainText('quokka')
    const problems = page.getByRole('region', { name: '问题' })
    const problem = problems.locator('.pmw-problem').filter({ hasText: 'nosuch' })
    await expect(problem).toContainText('lectures/intro/pages/more.md:8')
    await page.locator('.pmw-source__tab', { hasText: 'lecture.md' }).getByRole('tab').click()
    await problem.click()
    await expect(page.locator('.pmw-source__tab[data-active]')).toContainText('more.md')
    await expect(page.locator('[data-status="line"]')).toHaveText('第 8 行')
  })

  test('a file changed on disk: unchanged in the editor it follows; changed there too, the editor offers to merge or reload, and merges', async ({ page }) => {
    await studio.open(page)
    await openDocument(page, '分词入门')
    await openFile(page, 'lecture.md', '最常相邻的一对')
    const file = join(studio.workspace.dir, 'lectures/intro/lecture.md')
    writeFileSync(file, readFileSync(file, 'utf8').replace('最常相邻的一对', '最常出现的相邻一对'))
    await expect(editor(page)).toContainText('最常出现的相邻一对', { timeout: 60_000 })
    await editor(page).getByText('一份讲分词的讲义').click()
    await page.keyboard.press('End')
    await page.keyboard.type('（编辑器）')
    writeFileSync(file, readFileSync(file, 'utf8').replace('最常出现的相邻一对', '最常出现的相邻两个词元'))
    await page.keyboard.press('Control+s')
    const notice = page.locator('.pmw-source').getByRole('status').filter({ hasText: '被别处改过' })
    await expect(notice).toBeVisible({ timeout: 60_000 })
    await expect(notice.getByRole('button', { name: '重新载入' })).toBeVisible()
    await notice.getByRole('button', { name: '合并' }).click()
    await expect(page.locator('.pmw-source').getByRole('status')).toContainText('已合并')
    await page.keyboard.press('Control+s')
    await expect(page.locator('.pmw-source__tab[data-active] .pmw-source__dot')).toBeHidden()
    const text = readFileSync(file, 'utf8')
    expect(text).toContain('一份讲分词的讲义，工作台的用例在浏览器中编辑它。（编辑器）')
    expect(text).toContain('最常出现的相邻两个词元')
  })

  test('the text of the workbench\'s panels and DeepSeek Harness\'s mapped ones reaches WCAG AA, light and dark', async ({ page }) => {
    for (const scheme of ['light', 'dark'] as const) {
      await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' })
      await studio.open(page)
      await expect(page.locator('html')).toHaveClass(scheme === 'dark' ? /\bdark\b/ : /^(?!.*\bdark\b)/)
      await expect(page.locator('.pmw-home__card').first()).toBeVisible()
      await expect.poll(() => lowContrast(page, '.pmw-frame'), { message: `${scheme}: the launcher` }).toEqual([])
      await openDocument(page, '分词入门')
      await openFile(page, 'more.md', '延伸')
      await page.getByRole('navigation', { name: '活动栏' }).getByRole('button', { name: '会话' }).click()
      await expect(page.locator('[data-pmw-slot="sidebar"]')).toBeVisible()
      await expect.poll(() => lowContrast(page, '.pmw-frame', '.pmw-preview__frame'), { message: `${scheme}: the document` }).toEqual([])
    }
  })

  test('the documents: made from a template, renamed, copied and deleted, each one commit, the cards following', async ({ page }) => {
    await studio.open(page)
    const dir = studio.workspace.dir
    const commits = () => Number(git(dir, ['rev-list', '--count', 'HEAD']).trim())
    const before = commits()
    const card = (text: string) => page.locator('.pmw-home__card').filter({ hasText: text })
    await page.getByRole('button', { name: '新建文档' }).click()
    const dialog = page.getByRole('dialog', { name: '新建文档' })
    await dialog.getByLabel('目录').fill('lectures/third')
    await dialog.getByLabel('标题').fill('第三讲')
    await dialog.getByRole('button', { name: '新建' }).click()
    await expect(card('第三讲')).toBeVisible()
    await expect(page.getByRole('status').filter({ hasText: '已新建 lectures/third' })).toBeVisible()
    expect(commits()).toBe(before + 1)

    await card('第三讲').getByRole('button', { name: '第三讲 的操作' }).click()
    await page.getByRole('menuitem', { name: '改名' }).click()
    await page.getByRole('dialog').getByLabel('新的目录').fill('lectures/fourth')
    await page.getByRole('dialog').getByRole('button', { name: '改名' }).click()
    await expect(card('lectures/fourth')).toBeVisible()
    await expect(card('lectures/third')).toHaveCount(0)
    expect(commits()).toBe(before + 2)

    await card('lectures/fourth').getByRole('button', { name: '第三讲 的操作' }).click()
    await page.getByRole('menuitem', { name: '复制' }).click()
    await page.getByRole('dialog').getByRole('button', { name: '复制' }).click()
    await expect(card('lectures/fourth-2')).toBeVisible()
    expect(commits()).toBe(before + 3)

    await card('lectures/fourth-2').getByRole('button', { name: /的操作$/ }).click()
    await page.getByRole('menuitem', { name: '删除' }).click()
    await page.getByRole('dialog').getByRole('button', { name: '删除' }).click()
    await expect(card('lectures/fourth-2')).toHaveCount(0)
    await expect(page.locator('.pmw-home__card')).toHaveCount(3)
    expect(commits()).toBe(before + 4)
    expect(git(dir, ['log', '-4', '--format=%(trailers:key=Presmium-Origin,valueonly)']).split('\n').filter(Boolean)).toEqual([
      'document delete lectures/fourth-2',
      'document copy lectures/fourth lectures/fourth-2',
      'document rename lectures/third lectures/fourth',
      'document create lectures/third',
    ])
  })

  test('the changes: the AI\'s change waits for review, one file taken back and the rest one commit; the author\'s own change committed; a commit undone from the history', async ({ page }) => {
    const dir = studio.workspace.dir
    const intro = join(dir, 'lectures/intro')
    const api = await studio.web.api()
    const { sessionId } = await api.call<{ sessionId: string }>('session/create', { request: { cwd: intro } })
    await api.call('session/prompt', { request: { requestId: randomUUID(), sessionId, mode: 'queue', content: [{ type: 'text', text: '写一份小结。' }] } })
    await studio.open(page)
    await openDocument(page, '分词入门')
    await page.getByRole('navigation', { name: '活动栏' }).getByRole('button', { name: '修改' }).click()
    const review = page.getByRole('region', { name: 'AI 的修改' })
    await expect(review).toContainText('2 个文件等待审阅', { timeout: 60_000 })
    await review.getByRole('button', { name: '撤回 extra.md' }).click()
    await expect(review).toContainText('1 个文件等待审阅')
    expect(existsSync(join(intro, 'extra.md'))).toBe(false)
    await review.getByRole('textbox', { name: '提交说明（可选）' }).fill('Add a summary')
    await review.getByRole('button', { name: '接受' }).click()
    await expect(review).toBeHidden()
    const history = page.getByRole('region', { name: '修改历史' })
    await expect(history.locator('.pmw-changes__subject').first()).toHaveText('Add a summary')
    expect(git(dir, ['log', '-1', '--format=%(trailers:key=Presmium-Session,valueonly)']).trim()).toBe(sessionId)

    const more = join(intro, 'pages/more.md')
    writeFileSync(more, `${readFileSync(more, 'utf8')}\n作者手写的一行。\n`)
    const uncommitted = page.getByRole('region', { name: '未提交的修改' })
    await expect(uncommitted).toContainText('pages/more.md', { timeout: 60_000 })
    await uncommitted.getByRole('textbox', { name: '提交说明', exact: true }).fill('Edit by hand')
    await uncommitted.getByRole('button', { name: '提交' }).click()
    await expect(uncommitted).toContainText('没有未提交的修改。')
    await expect(history.locator('.pmw-changes__subject').first()).toHaveText('Edit by hand')

    const summary = history.locator('.pmw-changes__revision').filter({ has: page.locator('.pmw-changes__subject', { hasText: /^Add a summary$/ }) })
    await summary.getByRole('button', { name: '撤销' }).click()
    await expect(summary).toContainText('已撤销')
    await expect(history.locator('.pmw-changes__subject').first()).toHaveText('Revert "Add a summary"')
    expect(existsSync(join(intro, 'summary.md'))).toBe(false)
  })
})

test.describe('the brand', () => {
  let studio: Studio

  test.beforeAll(async () => {
    test.setTimeout(400_000)
    studio = await startStudio({ port: 5645, prefix: 'brand' })
  })

  test.afterAll(async () => {
    await studio?.close()
  })

  for (const { locale, headline, welcome, start } of [
    { locale: 'en-US', headline: 'Write your lecture', welcome: 'Welcome to Presmium', start: 'Start' },
    { locale: 'zh-CN', headline: '写讲义，从这里开始', welcome: '欢迎使用 Presmium', start: '开始使用' },
  ]) {
    test(`${locale}: Presmium's title, icon, brand and first-use notice; nothing of DeepSeek's in the launcher, the conversation, the sessions and the settings`, async ({ browser }) => {
      const context = await browser.newContext({ locale })
      const page = await context.newPage()
      await studio.open(page, { welcome: true })
      const notice = page.locator('[data-pmw-welcome]')
      await expect(notice).toContainText(welcome)
      await notice.getByRole('button', { name: start }).click()
      await expect(notice).toBeHidden()
      await page.reload()
      await expect(page.locator('.pmw-frame')).toBeVisible()
      await expect(notice).toBeHidden()
      await expect(page).toHaveTitle('Presmium')
      const icons = await page.locator('link[rel="icon"]').evaluateAll(links => links.map(link => (link as HTMLLinkElement).href))
      expect(icons).toHaveLength(1)
      expect(decodeURIComponent(icons[0]!)).toContain('#0F5F5C')
      await expect(page.locator('link[rel="manifest"]')).toHaveCount(0)
      await expect(conversation(page).locator('svg.pmw-logo')).toBeVisible()
      await expect(conversation(page)).toContainText(headline)
      const activity = page.getByRole('navigation').first()
      await activity.locator('[data-activity="sessions"]').click()
      const sidebar = page.locator('[data-pmw-slot="sidebar"]')
      await expect(sidebar.locator('svg.pmw-logo').first()).toBeVisible()
      await expect(sidebar.locator('.pmw-brand-name')).toHaveText('Presmium')
      const words = async (selector: string) => (await page.locator(selector).innerText()).replace(/DeepSeek-V[\w.-]+/g, '')
      for (const part of ['.pmw-frame__centre', '[data-pmw-slot="main:conversation"]', '[data-pmw-slot="sidebar"]']) expect(await words(part), part).not.toMatch(/deepseek/i)
      await activity.locator('[data-activity="settings"]').click()
      const settings = page.getByRole('dialog').filter({ hasText: /^(Settings|设置)/ })
      await expect(settings).toBeVisible()
      const sections = await settings.getByRole('button').allInnerTexts()
      expect(sections.join(' ')).not.toMatch(/account|账号|web search|网页搜索/i)
      expect((await settings.innerText()).replace(/DeepSeek-V[\w.-]+/g, '')).not.toMatch(/deepseek/i)
      for (const section of sections.filter(text => /^(Built-in plugins|内置插件)$/.test(text.trim()))) {
        await settings.getByRole('button', { name: section.trim() }).click()
        expect(await settings.innerText()).not.toMatch(/search provider|搜索提供方|deepseek/i)
      }
      await page.keyboard.press('Escape')
      await sidebar.getByRole('button', { name: /^(Plugins|插件)$/ }).click()
      const plugins = page.locator('.pmw-frame__panel')
      await expect(plugins).toBeVisible()
      await expect(plugins.locator('[data-plugin-group]').first()).toBeAttached({ timeout: 30_000 })
      await expect(plugins.locator('[data-plugin-group="extensions"]')).toBeHidden()
      expect(await plugins.innerText()).not.toMatch(/experimental|实验|market|市场|discover|发现/i)
      await context.close()
    })
  }
})

test.describe('the bundle turned off', () => {
  let studio: Studio

  test.beforeAll(async () => {
    test.setTimeout(400_000)
    studio = await startStudio({ port: 5647, prefix: 'off' })
  })

  test.afterAll(async () => {
    await studio?.close()
  })

  test('turned off in the Plugins page, the workbench stays and says how to turn Presmium on again (17, item 6)', async ({ page }) => {
    const api = await studio.web.api()
    expect(await api.call('pluginManager/setBundleEnabled', { name: '@presmium/dsh', enabled: false })).toMatchObject({ changed: true, application: 'applied' })
    await studio.open(page)
    await expect(page.locator('.pmw-frame')).toBeVisible()
    await expect(page.locator('.pmw-home').getByRole('alert')).toContainText('@presmium/dsh')
    expect(await api.call('pluginManager/setBundleEnabled', { name: '@presmium/dsh', enabled: true })).toMatchObject({ changed: true })
    await page.reload()
    await expect(page.locator('.pmw-home__card')).toHaveCount(2)
  })
})

test.describe('the fallback', () => {
  let studio: Studio

  test.beforeAll(async () => {
    test.setTimeout(400_000)
    studio = await startStudio({ port: 5646, prefix: 'fallback', patches: [FALLBACK_PATCH] })
  })

  test.afterAll(async () => {
    await studio?.close()
  })

  test('with DeepSeek Harness\'s own layout on, the same panels are in it: the workbench a global panel, the preview and the source tabs of its dock @gate', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', error => errors.push(error.message))
    await studio.open(page)
    const boot = await page.evaluate(() => (window as unknown as { __DSH_BOOT__: { entries: { id: string }[] } }).__DSH_BOOT__.entries.map(entry => entry.id))
    expect(boot).toEqual(expect.arrayContaining([UI_LAYOUT, '@presmium/dsh']))
    await expect(page.locator('.pmw-frame')).toHaveCount(0)
    await page.getByRole('button', { name: 'Presmium' }).first().click()
    await expect(page.locator('.pmw-fallback .pmw-home__card')).toHaveCount(2)
    await openDocument(page, '分词入门')
    await openFile(page, 'lecture.md', '分词入门')
    await expect(page.getByRole('region', { name: '问题' })).toBeVisible()
    await expect(preview(page).locator('[data-section="words"]')).toBeVisible({ timeout: 120_000 })
    await page.getByRole('button', { name: /^(New session|新建会话)$/ }).first().click()
    await page.getByRole('button', { name: /^(Open right sidebar|打开右侧边栏)$/ }).click()
    const dock = page.locator('[data-rightbar-col]')
    await dock.getByText('Presmium · 源码').first().click()
    await expect(dock.locator('.pmw-source__tab[data-active]')).toContainText('lecture.md')
    await dock.getByRole('button', { name: /^(New tab|新标签页)$/ }).first().click()
    await dock.getByText('Presmium · 预览').first().click()
    await expect(dock.frameLocator('.pmw-preview__frame').locator('[data-section="words"]')).toBeVisible({ timeout: 120_000 })
    expect(errors).toEqual([])
  })
})
