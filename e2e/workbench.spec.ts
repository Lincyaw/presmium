// The workbench's shell (P-124, P-125, N-10; docs/design-dsh.md section 7, WP-96d) in DeepSeek Harness's web client with
// Presmium's bundle, started as presmium studio starts it (e2e/fixtures/workbench/studio.ts) on the workspace of
// e2e/fixtures/workbench/workspace, with the scripted fake model:
// - the start audit (the upgrade gate's third group, @gate): what the client part relies on of the pinned DeepSeek
//   Harness (root's child slots, the members of ctx.layout its plugins call, the brand and first-use slots, the tokens,
//   the shell's module table, the Plugins page's experimental group), and a page that starts with no error;
// - at 1440 and 390 px, the activity bar, the file tree, the editor, the problems, the preview, and DeepSeek Harness's
//   conversation, sessions, settings, Review and files can be reached and used; the side panel's handle resizes it and
//   ui-layout's shortcut closes and opens it;
// - a word changed and saved shows in the preview without a reload; a block picked in the preview opens its lines,
//   the cursor frames its block in the preview, a problem leads to its line;
// - a file changed on disk: unchanged in the editor it follows, changed there too the editor offers to merge or reload;
// - the text of the panels, Presmium's and DeepSeek Harness's, reaches WCAG AA, light and dark;
// - Presmium's brand in en-US and zh-CN (title, icon, brand slots, first-use notice, the conversation's opening),
//   nothing of DeepSeek's in the launcher, the conversation, the sessions or the settings, and no account, DeepSeek
//   search, plugin market or experimental plugins;
// - the documents made from a template, renamed, copied and deleted, each one commit, the cards following;
// - @presmium/dsh turned off in the Plugins page: the workbench stays and says how to turn it on again (17, item 6);
// - with DeepSeek Harness's own layout on again, the same panels in it (the fallback, @gate).
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
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

/** Opens the document `title` from the launcher. */
async function openDocument(page: Page, title: string): Promise<void> {
  await page.locator('.pmw-home__card').filter({ hasText: title }).locator('.pmw-home__open').click()
  await expect(page.locator('.pmw-files__title')).toHaveText(title)
}

/** Opens a file of the document open from the file tree, its text in the editor. */
async function openFile(page: Page, name: string, text: string): Promise<void> {
  await page.locator('.pmw-tree__file', { hasText: name }).click()
  await expect(editor(page)).toContainText(text)
}

/** Sends a message in DeepSeek Harness's conversation. */
async function send(page: Page, message: string): Promise<void> {
  await conversation(page).locator('[contenteditable="true"]').first().click()
  await page.keyboard.type(message)
  await page.keyboard.press('Enter')
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
    ])
    studio = await startStudio({ port: 5643, model })
  })

  test.afterAll(async () => {
    await studio?.close()
    await model?.close()
  })

  test('the start audit: what the client part relies on is in the pinned DeepSeek Harness, and the page starts with no error @gate', async ({ page }) => {
    // The child slots of root are ui-layout's, so DeepSeek Harness's plugins sit in them unchanged.
    expect(rootChildren()).toEqual(ROOT_CHILDREN)
    // Every member of ctx.layout its plugins call, the root layout provides.
    expect(LAYOUT_MEMBERS).toEqual(expect.arrayContaining(layoutMembersUsed()))
    // The brand's slots are rendered, and the first-use steps Presmium takes are there.
    for (const slot of BRAND_SLOTS) expect(rendersSlot(slot), slot).toBe(true)
    const models = clientOf('@deepseek-ai/dsh-client-ui-settings-models')
    for (const step of ONBOARDING.steps) expect(models, step).toContain(`name: "${ONBOARDING.slot}",\n\t\t\t\tid: "${step}"`)
    // Every alias token the client plugins use and ui-theme defines is mapped, and every one mapped is defined.
    const { defined, used } = aliasTokens()
    const mapped = Object.keys(TOKENS).filter(name => name.startsWith('--dsw-alias-'))
    expect([...used].filter(name => defined.has(name) && !mapped.includes(name))).toEqual([])
    expect(mapped.filter(name => !defined.has(name))).toEqual([])
    // The bundle's externals are the shell's module table.
    expect(shellModules()).toEqual([...SHELL_MODULES].sort())
    // The Plugins page's group of experimental bundles, which the workbench hides, is still that one.
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
    // DeepSeek Harness's own plugins in root's child slots: its sidebar, the conversation (with Presmium's mark).
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
    // The conversation: a message, the model's answer, the file it wrote, its review in the dock.
    await send(page, '写一份笔记')
    await expect(conversation(page)).toContainText('写好了。', { timeout: 60_000 })
    await conversation(page).getByRole('button', { name: /notes\.md/ }).last().click()
    const dock = page.locator('[data-pmw-slot="rightbar"]')
    await expect(dock).toContainText('第一条。')
    // The dock's files, from its guide.
    await dock.getByRole('button', { name: /^(New tab|新标签页)$/ }).first().click()
    await dock.getByText(/^(Workspace files|工作区文件)$/).first().click()
    await expect(dock.getByText('notes.md').first()).toBeVisible()
    await dock.getByRole('button', { name: /^(Collapse right sidebar|收起右侧边栏)$/ }).first().click()
    // The sessions: DeepSeek Harness's sidebar in the side panel.
    await activity.getByRole('button', { name: '会话' }).click()
    await expect(page.locator('[data-pmw-slot="sidebar"]')).toBeVisible()
    await expect(page.locator('[data-pmw-slot="sidebar"]').getByRole('button', { name: /^(New session|新建会话)$/i }).first()).toBeVisible()
    // The settings, from the activity bar.
    await activity.getByRole('button', { name: '设置' }).click()
    const settings = page.getByRole('dialog').filter({ hasText: /^(Settings|设置)/ })
    await expect(settings).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(settings).toBeHidden()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)

    // 390 px: the activity bar along the top, one view at a time.
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
    await conversation(page).getByRole('button', { name: /notes-2\.md/ }).last().click()
    // The dock covers the screen.
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
    // DeepSeek Harness binds the web's shortcuts on macOS and Windows only.
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
    // Pick mode: a click on a block opens its file at its lines, marked.
    await page.getByRole('button', { name: '点选' }).click()
    await expect(page.getByRole('button', { name: '点选' })).toHaveAttribute('aria-pressed', 'true')
    await preview(page).getByText('最常相邻的一对合并成一个新词元。').click()
    await expect(page.locator('.pmw-source__tab[data-active]')).toContainText('lecture.md')
    await expect(page.locator('.cm-line.pm-cm-picked')).toContainText('最常相邻的一对合并成一个新词元。')
    await page.getByRole('button', { name: '点选' }).click()
    // The cursor in a block of the included page: the preview frames that block.
    await openFile(page, 'more.md', '延伸一节的第一段 quokka')
    await editor(page).getByText('延伸一节的第一段 quokka').click()
    await expect(preview(page).locator('[data-preview-highlight]')).toContainText('quokka')
    // The problems: the unknown directive with its place; a click opens its file at its line.
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
    // Changed in the editor, then on disk on another line.
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
      // Without motion: the text is measured once DeepSeek Harness's sidebar has faded in.
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
      // The first-use notice is Presmium's; once read, it does not come back.
      const notice = page.locator('[data-pmw-welcome]')
      await expect(notice).toContainText(welcome)
      await notice.getByRole('button', { name: start }).click()
      await expect(notice).toBeHidden()
      await page.reload()
      await expect(page.locator('.pmw-frame')).toBeVisible()
      await expect(notice).toBeHidden()
      // The page's title and icon.
      await expect(page).toHaveTitle('Presmium')
      const icons = await page.locator('link[rel="icon"]').evaluateAll(links => links.map(link => (link as HTMLLinkElement).href))
      expect(icons).toHaveLength(1)
      expect(decodeURIComponent(icons[0]!)).toContain('#0F5F5C')
      await expect(page.locator('link[rel="manifest"]')).toHaveCount(0)
      // The conversation's opening: Presmium's mark and line.
      await expect(conversation(page).locator('svg.pmw-logo')).toBeVisible()
      await expect(conversation(page)).toContainText(headline)
      // The sidebar's brand.
      const activity = page.getByRole('navigation').first()
      await activity.locator('[data-activity="sessions"]').click()
      const sidebar = page.locator('[data-pmw-slot="sidebar"]')
      await expect(sidebar.locator('svg.pmw-logo').first()).toBeVisible()
      await expect(sidebar.locator('.pmw-brand-name')).toHaveText('Presmium')
      // No DeepSeek in the launcher, the conversation (the model's name aside) and the sessions.
      const words = async (selector: string) => (await page.locator(selector).innerText()).replace(/DeepSeek-V[\w.-]+/g, '')
      for (const part of ['.pmw-frame__centre', '[data-pmw-slot="main:conversation"]', '[data-pmw-slot="sidebar"]']) expect(await words(part), part).not.toMatch(/deepseek/i)
      // The settings: no account, no DeepSeek search, nothing of DeepSeek's but the models' providers.
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
      // The Plugins page: no experimental plugins, no plugin market.
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
    // The launcher's patches keep the workbench's rows and DeepSeek Harness's own layout off; its routes are gone.
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
    // The panel list of DeepSeek Harness's sidebar leads to the workbench.
    await page.getByRole('button', { name: 'Presmium' }).first().click()
    await expect(page.locator('.pmw-fallback .pmw-home__card')).toHaveCount(2)
    await openDocument(page, '分词入门')
    await openFile(page, 'lecture.md', '分词入门')
    await expect(page.getByRole('region', { name: '问题' })).toBeVisible()
    await expect(preview(page).locator('[data-section="words"]')).toBeVisible({ timeout: 120_000 })
    // Back in the conversation, the dock's guide offers Presmium's preview and source, the same panels on the same document.
    await page.getByRole('button', { name: /^(New session|新建会话)$/ }).first().click()
    await page.getByRole('button', { name: /^(Open right sidebar|打开右侧边栏)$/ }).click()
    const dock = page.locator('[data-rightbar-col]')
    // A dock opened anew shows its guide.
    await dock.getByText('Presmium · 源码').first().click()
    await expect(dock.locator('.pmw-source__tab[data-active]')).toContainText('lecture.md')
    await dock.getByRole('button', { name: /^(New tab|新标签页)$/ }).first().click()
    await dock.getByText('Presmium · 预览').first().click()
    await expect(dock.frameLocator('.pmw-preview__frame').locator('[data-section="words"]')).toBeVisible({ timeout: 120_000 })
    expect(errors).toEqual([])
  })
})
