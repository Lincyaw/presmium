import { execFileSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { fakeModel } from '../packages/dsh/src/node/fake-model.ts'
import type { FakeModel } from '../packages/dsh/src/node/fake-model.ts'
import { BRAND_SLOTS, EXPERIMENTAL_GROUP, LAYOUT_MEMBERS, ONBOARDING, ROOT_CHILDREN, SHELL_MODULES, UI_LAYOUT } from '../packages/dsh/src/client/contract.ts'
import { DSH_THEME_TOKENS } from '../packages/dsh/src/client/theme.ts'
import { lowContrast } from './fixtures/contrast.ts'
import { aliasTokens, clientOf, layoutMembersUsed, rendersSlot, rootChildren, shellModules } from './fixtures/workbench/audit.ts'
import { startStudio } from './fixtures/workbench/studio.ts'
import type { Studio } from './fixtures/workbench/studio.ts'
import { selectPreview, splitPreview } from './fixtures/workbench/ui.ts'

test.describe.configure({ mode: 'serial', timeout: 300_000 })
test.use({ locale: 'zh-CN', actionTimeout: 30_000 })

const studioPortOffset = Number(process.env.PRESMIUM_E2E_STUDIO_PORT_OFFSET ?? 0)

const preview = (page: Page) => page.frameLocator('.pmw-preview__frame')
const editor = (page: Page) => page.locator('.pmw-source__editor .cm-content')
const conversation = (page: Page) => page.locator('[data-pmw-slot="main:conversation"]')

async function showConversation(page: Page): Promise<void> {
  if (!await conversation(page).isVisible()) await page.locator('[data-activity="sessions"]').click()
  await expect(conversation(page)).toBeVisible()
}

async function showHistory(page: Page): Promise<void> {
  if (!await conversation(page).isVisible()) await showConversation(page)
  await conversation(page).getByRole('button', { name: '历史对话', exact: true }).click()
  await expect(page.locator('[data-pmw-slot="sidebar"]')).toBeVisible()
}

async function openDocument(page: Page, title: string): Promise<void> {
  await page.locator('.pmw-home__card').filter({ hasText: title }).locator('.pmw-home__open').click()
  await expect(page.locator('.pmw-preview__frame')).toHaveAttribute('title', `${title} 的预览`)
}

async function revealFile(page: Page, path: string): Promise<void> {
  const parts = path.split('/')
  for (let i = 1; i < parts.length; i++) {
    const folder = page.locator(`.pmw-tree__file[data-node="directory:${parts.slice(0, i).join('/')}"]:visible`)
    await expect(folder).toBeVisible()
    if (await folder.getAttribute('data-open') !== 'true') await folder.click()
    await expect(folder).toHaveAttribute('data-open', 'true')
  }
}

async function openFile(page: Page, name: string, text: string): Promise<void> {
  const path = name.includes('/') ? name : `lectures/intro/${name === 'more.md' ? 'pages/' : ''}${name}`
  if (await page.locator(`.pmw-tree__file[data-path="${path}"]:visible`).count() === 0 && await page.locator('.pmw-frame').count()) {
    if (!await page.locator('.pmw-frame__side-files').isVisible()) await page.locator('[data-activity="files"]').click()
  }
  await revealFile(page, path)
  await page.locator(`.pmw-tree__file[data-path="${path}"]:visible`).click()
  await expect(editor(page)).toContainText(text)
}

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
      { tool: 'write', input: { file_path: 'summary.md', content: '# 小结\n' } },
      { tool: 'write', input: { file_path: 'extra.md', content: '多出来的\n' } },
      { text: '改好了。' },
    ])
    studio = await startStudio({ port: 5643 + studioPortOffset, model })
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
    const mapped = Object.keys(DSH_THEME_TOKENS).filter(name => name.startsWith('--dsw-alias-'))
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
    expect(boot).toContain('@lincyaw/dsh')
    for (const off of [UI_LAYOUT, '@deepseek-ai/dsh-client-ui-sidebar', '@deepseek-ai/dsh-client-ui-brand-official', '@deepseek-ai/dsh-client-ui-settings-account']) expect(boot).not.toContain(off)
    await expect(page.locator('[data-pmw-slot="sidebar"] button').first()).toBeAttached()
    await expect(conversation(page).locator('[contenteditable="true"]')).toBeVisible()
    await expect(conversation(page).locator('svg.pmw-logo')).toBeVisible()
    await expect(page.locator('.pmw-home__card')).toHaveCount(2)
    await expect(page.locator('.pmw-frame__side-files')).toBeHidden()
    await page.locator('[data-activity="files"]').click()
    await expect(page.locator('.pmw-frame__side-files')).toBeVisible()
    await page.locator('[data-activity="files"]').click()
    await expect(page.locator('.pmw-frame__side-files')).toBeHidden()
    for (let attempt = 0; attempt < 3; attempt++) {
      await page.reload()
      await expect(page.locator('.pmw-frame')).toBeVisible()
      await expect(conversation(page).locator('[contenteditable="true"]')).toBeVisible()
    }
    expect(errors).toEqual([])
  })

  test('command search and the file tree open a document and its nested source with the keyboard', async ({ page }) => {
    await studio.open(page)
    await expect(page.locator('.pmw-home__card')).toHaveCount(2)
    const search = page.getByRole('combobox', { name: '搜索文档与命令' })
    await expect(conversation(page).locator('[contenteditable="true"]')).toBeFocused()
    await page.keyboard.press('Control+k')
    await expect(search).toBeFocused()
    await page.keyboard.type('分词入门')
    await expect(search).toHaveValue('分词入门')
    await search.press('ArrowDown')
    await search.press('Enter')
    await expect(page.locator('.pmw-preview__frame')).toHaveAttribute('title', '分词入门 的预览')
    await page.locator('[data-activity="files"]').click()
    await expect(page.locator('.pmw-files__title')).toHaveText('工作台用例')
    const more = page.locator('.pmw-tree__file', { hasText: 'more.md' })
    await expect(more).toHaveCount(0)
    const lectures = page.locator('.pmw-tree__file[data-node="directory:lectures"]')
    await expect(lectures).toHaveAttribute('data-open', 'false')
    await lectures.click()
    await page.locator('.pmw-tree__file[data-node="directory:lectures/intro"]').click()
    const folder = page.locator('.pmw-tree__file[data-node="directory:lectures/intro/pages"]')
    await expect(folder).toHaveAttribute('data-open', 'false')
    await expect(more).toHaveCount(0)
    await folder.click()
    await expect(folder).toHaveAttribute('data-open', 'true')
    await expect(more).toBeVisible()
    await page.keyboard.press('ArrowLeft')
    await expect(more).toHaveCount(0)
    await page.keyboard.press('ArrowRight')
    await expect(more).toBeVisible()
    await page.keyboard.press('ArrowDown')
    await page.keyboard.press('Space')
    await expect(editor(page)).toContainText('延伸一节')
    await page.reload()
    await openDocument(page, '分词入门')
    await page.locator('[data-activity="files"]').click()
    for (const id of ['lectures', 'lectures/intro', 'lectures/intro/pages']) {
      await expect(page.locator(`.pmw-tree__file[data-node="directory:${id}"]`)).toHaveAttribute('data-open', 'true')
    }
  })

  test('switching documents keeps the same workspace session', async ({ page }) => {
    await studio.open(page)
    const selected: { session: string, document: string | null }[] = []
    page.on('response', response => {
      if (response.url().endsWith('/api/presmium/context') && response.ok()) selected.push(response.request().postDataJSON())
    })
    await openDocument(page, '分词入门')
    await expect.poll(() => selected.at(-1)?.document).toBe('lectures/intro')
    const session = selected.at(-1)!.session
    await page.locator('[data-activity="documents"]').click()
    await openDocument(page, 'Second lecture')
    await expect.poll(() => selected.at(-1)?.document).toBe('lectures/second')
    expect(selected.at(-1)!.session).toBe(session)
    await page.locator('[data-activity="documents"]').click()
    await expect.poll(() => selected.at(-1)?.document).toBe(null)
    expect(selected.at(-1)!.session).toBe(session)
  })

  test('navigation has one brand and settings entry, one conversation header, and history never covers the document', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await studio.open(page)
    await openDocument(page, '分词入门')
    await openFile(page, 'lecture.md', '一份讲分词的讲义')
    await splitPreview(page)
    const activity = page.getByRole('navigation', { name: '活动栏' })
    const sidebar = page.locator('[data-pmw-slot="sidebar"]')
    for (const width of [1440, 900, 390]) {
      await page.setViewportSize({ width, height: 900 })
      if (!await conversation(page).isVisible()) await showConversation(page)
      await expect(conversation(page).getByRole('button', { name: '新建对话', exact: true })).toBeVisible()
      await expect(conversation(page).getByRole('button', { name: /^(Open right sidebar|打开右侧边栏)$/ })).toHaveCount(0)
      await expect(conversation(page).locator('.pmw-frame__conversation-bar')).toHaveCount(0)
      await expect(conversation(page).locator('header').filter({ has: page.locator('.pmw-chat-actions') })).toHaveCount(1)
      await conversation(page).getByRole('button', { name: '历史对话', exact: true }).click()
      await expect(sidebar.getByRole('heading', { name: '历史对话' })).toBeVisible()
      await expect(activity.locator('svg.pmw-logo')).toHaveCount(1)
      await expect(sidebar.locator('svg.pmw-logo')).toHaveCount(0)
      await expect(sidebar.getByRole('button', { name: /新建会话|新建对话/ })).toHaveCount(0)
      await expect(page.getByRole('button', { name: '设置', exact: true })).toHaveCount(1)
      await expect(activity.getByRole('button', { name: '插件', exact: true })).toBeVisible()
      await expect(activity.getByRole('button', { name: '自动化任务', exact: true })).toBeVisible()
      await expect(sidebar.getByRole('button', { name: /^(插件|自动化任务)$/ })).toHaveCount(0)
      if (width >= 768) {
        const side = (await sidebar.boundingBox())!
        const centre = (await page.locator('.pmw-frame__centre').boundingBox())!
        expect(side.x + side.width).toBeLessThanOrEqual(centre.x + 1)
      }
      if (width === 1440) {
        await expect(preview(page).locator('[data-section="words"]')).toBeVisible({ timeout: 120_000 })
        await page.screenshot({ path: test.info().outputPath('one-navigation.png'), animations: 'disabled' })
      }
      await sidebar.getByRole('button', { name: '收起历史对话', exact: true }).click()
      await expect(sidebar).toBeHidden()
    }
  })

  test('global plugins and automations open from the activity bar and preserve the document draft at desktop and phone widths', async ({ page }) => {
    await studio.open(page)
    await openDocument(page, '分词入门')
    await openFile(page, 'lecture.md', '一份讲分词的讲义')
    await editor(page).getByText('一份讲分词的讲义').click()
    await page.keyboard.press('End')
    await page.keyboard.type('（全局工具切换保留草稿）')
    const activity = page.getByRole('navigation', { name: '活动栏' })
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 900 })
      for (const label of ['插件', '自动化任务']) {
        const button = activity.getByRole('button', { name: label, exact: true })
        await button.click()
        await expect(button).toHaveAttribute('aria-pressed', 'true')
        const panel = page.locator('.pmw-frame__panel')
        await expect(panel).toBeVisible()
        await expect(panel.getByText(label, { exact: true }).first()).toBeVisible()
        await expect(page.getByRole('dialog', { name: '保存未完成的修改？' })).toHaveCount(0)
      }
      if (width === 390) {
        await expect(activity.locator('[aria-pressed="true"]')).toHaveCount(1)
        await showConversation(page)
        await expect(page.locator('.pmw-frame__panel')).toHaveCount(0)
        await expect(conversation(page)).toBeVisible()
        await activity.getByRole('button', { name: '自动化任务', exact: true }).click()
        await expect(page.locator('.pmw-frame__panel')).toBeVisible()
      }
      await activity.getByRole('button', { name: '自动化任务', exact: true }).click()
      await expect(page.locator('.pmw-frame__panel')).toHaveCount(0)
      if (width === 390) await activity.getByRole('button', { name: '编辑区', exact: true }).click()
      await expect(editor(page)).toContainText('（全局工具切换保留草稿）')
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
    }
  })

  test('the side panel: its handle resizes it; the shortcut of ui-layout (Mod+Alt+B on the web, here Windows) closes and opens it', async ({ page }) => {
    await page.addInitScript(() => Object.defineProperty(Navigator.prototype, 'platform', { get: () => 'Win32' }))
    await page.setViewportSize({ width: 1440, height: 900 })
    await studio.open(page)
    const side = page.locator('.pmw-frame__side')
    await expect(side).toBeHidden()
    await page.locator('[data-activity="files"]').click()
    await expect(side).toBeVisible()
    const width = (await side.boundingBox())!.width
    const handle = (await page.locator('.pmw-frame__handle[data-side="side"]').boundingBox())!
    await page.mouse.move(handle.x + 4, handle.y + 200)
    await page.mouse.down()
    await page.mouse.move(handle.x + 84, handle.y + 200, { steps: 8 })
    await page.mouse.up()
    await expect.poll(async () => (await side.boundingBox())!.width).toBeGreaterThan(width + 60)
    const keyboardWidth = (await side.boundingBox())!.width
    await page.locator('.pmw-frame__handle[data-side="side"]').focus()
    await page.keyboard.press('ArrowRight')
    await expect.poll(async () => (await side.boundingBox())!.width).toBeGreaterThan(keyboardWidth)
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
    await splitPreview(page)
    await expect(preview(page).locator('[data-section="words"]')).toContainText('alpha', { timeout: 120_000 })
    await preview(page).locator('body').evaluate(() => (window as unknown as { kept: number }).kept = 1)
    await editor(page).getByText('这一段要改的词是 alpha').click()
    await page.keyboard.press('End')
    await page.keyboard.press('Backspace')
    await page.keyboard.type(' beta。')
    await expect(page.locator('.pmw-editor-group__tab:visible:has([role="tab"][title])[data-active] .pmw-source__dot')).toBeVisible()
    await page.keyboard.press('Control+s')
    await expect(page.locator('.pmw-editor-group__tab:visible:has([role="tab"][title])[data-active] .pmw-source__dot')).toBeHidden()
    await expect(preview(page).locator('[data-section="words"]')).toContainText('alpha beta', { timeout: 60_000 })
    expect(await preview(page).locator('body').evaluate(() => (window as unknown as { kept?: number }).kept)).toBe(1)
    expect(readFileSync(join(studio.workspace.dir, 'lectures/intro/lecture.md'), 'utf8')).toContain('alpha beta。')
  })

  test('compile errors are visible in preview and lead to their source; a picked block opens its lines and the cursor frames its block', async ({ page }) => {
    await studio.open(page)
    await openDocument(page, '分词入门')
    await expect(page.locator('.pmw-doc__source')).toBeHidden()
    const problems = page.getByRole('region', { name: '问题' })
    await expect(problems.getByRole('alert')).toContainText('nosuch')
    await problems.getByRole('button', { name: '查看问题', exact: true }).click()
    const problem = problems.locator('.pmw-problem').filter({ hasText: 'nosuch' })
    await expect(problem).toContainText('lectures/intro/pages/more.md:8')
    await problem.click()
    await expect(editor(page)).toBeVisible()
    await expect(page.locator('.pmw-editor-group__tab:visible:has([role="tab"][title])[data-active]')).toContainText('more.md')
    await expect(page.locator('[data-status="line"]')).toHaveText('第 8 行')
    await splitPreview(page)
    await preview(page).getByRole('link', { name: /上一章/ }).click()
    await expect(preview(page).locator('[data-section="merge"]')).toBeVisible({ timeout: 120_000 })
    await page.getByRole('button', { name: '点选' }).click()
    await expect(page.getByRole('button', { name: '点选' })).toHaveAttribute('aria-pressed', 'true')
    await preview(page).getByText('最常相邻的一对合并成一个新词元。').click()
    await expect(page.locator('.pmw-editor-group__tab:visible:has([role="tab"][title])[data-active]')).toContainText('lecture.md')
    await expect(page.locator('.cm-line.pm-cm-picked')).toContainText('最常相邻的一对合并成一个新词元。')
    await page.getByRole('button', { name: '点选' }).click()
    await openFile(page, 'more.md', '延伸一节的第一段 quokka')
    await editor(page).getByText('延伸一节的第一段 quokka').click()
    await expect(preview(page).locator('[data-preview-highlight]')).toContainText('quokka')
    await expect(problem).toContainText('lectures/intro/pages/more.md:8')
    await page.locator('.pmw-editor-group__tab:visible:has([role="tab"][title])', { hasText: 'lecture.md' }).getByRole('tab').click()
    if (!await page.locator('.pmw-frame__side-files').isVisible()) await page.locator('[data-activity="files"]').click()
    for (const id of ['directory:lectures/intro/pages', 'directory:lectures/intro', 'directory:lectures']) {
      await page.locator(`.pmw-tree__file[data-node="${id}"]`).click()
      await expect(page.locator(`.pmw-tree__file[data-node="${id}"]`)).toHaveAttribute('data-open', 'false')
    }
    const more = page.locator('.pmw-tree__file[data-path="lectures/intro/pages/more.md"]')
    await expect(more).toHaveCount(0)
    await problem.click()
    await expect(page.locator('.pmw-editor-group__tab:visible:has([role="tab"][title])[data-active]')).toContainText('more.md')
    await expect(page.locator('.pmw-tree__file[data-node="directory:lectures/intro/pages"]')).toHaveAttribute('data-open', 'true')
    await expect(more).toHaveAttribute('data-active', 'true')
    await expect(page.locator('[data-status="line"]')).toHaveText('第 8 行')
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
      await splitPreview(page)
      await showHistory(page)
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

    await card('第三讲').getByRole('button', { name: '第三讲 的操作' }).focus()
    await page.keyboard.press('ArrowDown')
    await page.keyboard.press('End')
    await expect(page.getByRole('menuitem', { name: '删除' })).toBeFocused()
    await page.keyboard.press('Home')
    await expect(page.getByRole('menuitem', { name: '改名', exact: true })).toBeFocused()
    await page.keyboard.press('Enter')
    const renameDialog = page.getByRole('dialog')
    for (let n = 0; n < 6; n++) await page.keyboard.press('Tab')
    expect(await renameDialog.evaluate(element => element.contains(document.activeElement))).toBe(true)
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

test.describe('reading and conversation context', () => {
  let studio: Studio
  let model: FakeModel

  test.beforeAll(async () => {
    test.setTimeout(400_000)
    model = await fakeModel([{ text: '已看到预览中选中的内容。' }, { text: '已看到源码中选中的内容。' }, { text: '现在是第二份讲义。' }])
    studio = await startStudio({ port: 5661 + studioPortOffset, model, prefix: 'focus' })
  })
  test.afterAll(async () => {
    await studio?.close()
    await model?.close()
  })

  test('opens in preview, uses file tabs and a side preview without losing edits, and hides and restores the conversation without losing its draft', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await studio.open(page)
    await openDocument(page, '分词入门')
    await expect(page.locator('.pmw-doc__source')).toBeHidden()
    await expect(preview(page).locator('[data-section="merge"]')).toBeVisible({ timeout: 120_000 })
    await expect.poll(async () => (await page.locator('.pmw-preview__frame').boundingBox())!.height).toBeGreaterThan(500)
    await expect(preview(page).locator('.pm-section h1')).toBeInViewport()
    await page.screenshot({ path: test.info().outputPath('preview-open.png') })
    await openFile(page, 'lecture.md', '一份讲分词的讲义')
    await editor(page).getByText('一份讲分词的讲义').click()
    await page.keyboard.press('End')
    await page.keyboard.type('保留的草稿')
    await selectPreview(page)
    await expect(page.locator('.pmw-doc__source')).toBeHidden()
    await page.getByRole('tab', { name: /^lecture\.md/ }).click()
    await expect(editor(page)).toContainText('保留的草稿')
    await expect(page.locator('.pmw-doc__preview')).toBeHidden()
    await splitPreview(page)
    await expect(editor(page)).toBeVisible()
    await expect(page.locator('.pmw-doc__preview')).toBeVisible()
    const draft = conversation(page).locator('[contenteditable="true"]').first()
    await draft.fill('尚未发送的问题')
    const width = (await page.locator('.pmw-document').boundingBox())!.width
    await page.getByRole('button', { name: '收起对话', exact: true }).click()
    await expect(conversation(page)).toBeHidden()
    await expect.poll(async () => (await page.locator('.pmw-document').boundingBox())!.width).toBeGreaterThan(width + 200)
    await page.screenshot({ path: test.info().outputPath('conversation-hidden.png') })
    await showConversation(page)
    await expect(draft).toBeVisible()
    await expect(draft).toContainText('尚未发送的问题')
    await expect(editor(page)).toContainText('保留的草稿')
  })

  for (const width of [1440, 390]) test(`${width}px: a new chat starts from the conversation header and history stays reachable without losing the document draft`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 })
    await studio.open(page)
    const selected: { session: string, document: string | null }[] = []
    page.on('response', response => {
      if (response.url().endsWith('/api/presmium/context') && response.ok()) selected.push(response.request().postDataJSON())
    })
    await openDocument(page, '分词入门')
    const activity = page.getByRole('navigation', { name: '活动栏' })
    if (width === 390) await activity.getByRole('button', { name: '文件', exact: true }).click()
    await openFile(page, 'lecture.md', '一份讲分词的讲义')
    await editor(page).getByText('一份讲分词的讲义').click()
    await page.keyboard.press('End')
    await page.keyboard.type('（新对话保留文稿）')
    if (width === 390) await showConversation(page)
    else await activity.getByRole('button', { name: '文件', exact: true }).click()
    await expect(page.locator('[data-pmw-slot="sidebar"]')).toBeHidden()
    const composer = conversation(page).locator('[contenteditable="true"]').first()
    await composer.fill('前一个对话尚未发送的内容')
    await expect.poll(() => selected.at(-1)?.document).toBe('lectures/intro')
    const previous = selected.at(-1)!.session
    await conversation(page).getByRole('button', { name: '新建对话', exact: true }).click()
    await expect.poll(() => selected.at(-1)?.session).not.toBe(previous)
    expect(selected.at(-1)?.document).toBe('lectures/intro')
    await expect(composer).toBeEmpty()
    await expect(page.locator('[data-pmw-slot="sidebar"]')).toBeHidden()
    await conversation(page).getByRole('button', { name: '历史对话', exact: true }).click()
    await expect(page.locator('[data-pmw-slot="sidebar"]')).toBeVisible()
    if (width === 390) await activity.getByRole('button', { name: '编辑区', exact: true }).click()
    await expect(editor(page)).toContainText('（新对话保留文稿）')
    await expect(page.locator('.pmw-editor-group__tab:visible:has([role="tab"][title])')).toHaveCount(1)
    if (width === 1440) await page.screenshot({ path: test.info().outputPath('chat-toolbar.png') })
  })

  test('preview and source selections reach the model with their document and source range, survive focusing the composer, and can be cleared', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await studio.open(page)
    await openDocument(page, '分词入门')
    const quote = '最常相邻的一对合并成一个新词元。'
    await expect(preview(page).getByText(quote)).toBeVisible({ timeout: 120_000 })
    await preview(page).getByText(quote).scrollIntoViewIfNeeded()
    const selected = (await preview(page).getByText(quote).boundingBox())!
    await page.mouse.move(selected.x + 1, selected.y + selected.height / 2)
    await page.mouse.down()
    await page.mouse.move(selected.x + selected.width - 1, selected.y + selected.height / 2, { steps: 6 })
    await page.mouse.up()
    await expect(page.locator('.pmw-focus:not([data-pending])')).toContainText(quote)
    await expect(page.locator('.pmw-doc__source')).toBeHidden()
    const texts = (value: unknown): string[] => typeof value === 'string' ? [value] : value && typeof value === 'object' ? Object.values(value).flatMap(texts) : []
    await page.screenshot({ path: test.info().outputPath('preview-focus.png') })
    const context = (after: number) => model.received.slice(after).filter(request => Array.isArray(request.body.tools)).flatMap(request => texts(request.body.messages)).findLast(text => text.includes('<presmium-document>')) ?? ''
    let before = model.received.length
    await send(page, '解释我选中的内容')
    await expect.poll(() => context(before), { timeout: 60_000 }).toContain(quote)
    expect(context(before)).toContain('"from":"web"')
    expect(context(before)).toContain('"file":"lecture.md"')
    expect(context(before)).not.toContain('the author points at nothing')
    await expect(conversation(page)).toContainText('已看到预览中选中的内容。')

    await openFile(page, 'lecture.md', '一份讲分词的讲义')
    await page.getByRole('tab', { name: /^lecture\.md/ }).click()
    await editor(page).locator('.cm-line').filter({ hasText: '一份讲分词的讲义' }).click({ clickCount: 3 })
    await expect(page.locator('.pmw-focus:not([data-pending])')).toContainText('一份讲分词的讲义')
    before = model.received.length
    await send(page, '这段讲解可以怎样改')
    await expect.poll(() => context(before), { timeout: 60_000 }).toContain('"from":"source"')
    expect(context(before)).toContain('一份讲分词的讲义')
    expect(context(before)).toContain('"file":"lecture.md"')
    await expect(conversation(page)).toContainText('已看到源码中选中的内容。')
    await page.getByRole('button', { name: '清除关注内容' }).click()
    await expect(page.locator('.pmw-focus')).toBeHidden()
    await expect.poll(async () => (await (await page.request.get(`${studio.web.url}/api/presmium/focus?document=lectures/intro`)).json()).focus).toEqual([])
    await page.getByRole('button', { name: '回到文档', exact: true }).click()
    await openDocument(page, 'Second lecture')
    before = model.received.length
    await send(page, '现在讲的是哪份文档')
    await expect.poll(() => context(before), { timeout: 60_000 }).toContain('Document "lectures/second"')
    expect(context(before)).not.toContain(quote)
    await expect(conversation(page)).toContainText('现在是第二份讲义。')
  })

  test('unsaved changes can be kept, saved before closing, or discarded before leaving; refreshing warns too', async ({ page }) => {
    await studio.open(page)
    await openDocument(page, '分词入门')
    await openFile(page, 'lecture.md', '一份讲分词的讲义')
    await editor(page).getByText('一份讲分词的讲义').click()
    await page.keyboard.press('End')
    await page.keyboard.type('（保存保护）')
    const closing = page.getByRole('button', { name: '关闭 lecture.md', exact: true })
    const dialog = page.getByRole('dialog', { name: '保存未完成的修改？' })
    await closing.click()
    await expect(dialog).toContainText('lectures/intro/lecture.md')
    await dialog.getByRole('button', { name: '取消', exact: true }).click()
    await expect(editor(page)).toContainText('（保存保护）')
    const unloaded = page.waitForEvent('dialog')
    void page.reload().catch(() => {})
    const warning = await unloaded
    expect(warning.type()).toBe('beforeunload')
    await warning.dismiss()
    await expect(editor(page)).toContainText('（保存保护）')
    await closing.click()
    await dialog.getByRole('button', { name: '保存', exact: true }).click()
    await expect(closing).toBeHidden()
    expect(readFileSync(join(studio.workspace.dir, 'lectures/intro/lecture.md'), 'utf8')).toContain('（保存保护）')
    await openFile(page, 'lecture.md', '（保存保护）')
    await editor(page).getByText('一份讲分词的讲义').click()
    await page.keyboard.press('End')
    await page.keyboard.type('（关闭放弃）')
    await closing.click()
    await dialog.getByRole('button', { name: '不保存', exact: true }).click()
    await expect(closing).toBeHidden()
    await openFile(page, 'lecture.md', '（保存保护）')
    await expect(editor(page)).not.toContainText('（关闭放弃）')
    await editor(page).getByText('一份讲分词的讲义').click()
    await page.keyboard.press('End')
    await page.keyboard.type('（放弃保护）')
    const path = join(studio.workspace.dir, 'lectures/intro/lecture.md')
    writeFileSync(path, `${readFileSync(path, 'utf8')}\n外部新增的内容。\n`)
    await page.getByRole('button', { name: '回到文档', exact: true }).click()
    await expect(dialog).toBeVisible()
    await dialog.getByRole('button', { name: '保存', exact: true }).click()
    await expect(dialog).toContainText('修改未能全部保存')
    await dialog.getByRole('button', { name: '取消', exact: true }).click()
    await expect(editor(page)).toContainText('（放弃保护）')
    await page.getByRole('button', { name: '回到文档', exact: true }).click()
    await dialog.getByRole('button', { name: '不保存', exact: true }).click()
    await expect(page.locator('.pmw-home__card')).toHaveCount(2)
    await openDocument(page, '分词入门')
    await openFile(page, 'lecture.md', '（保存保护）')
    await expect(editor(page)).not.toContainText('（放弃保护）')
  })
})

test.describe('one source editor', () => {
  let studio: Studio
  let model: FakeModel
  test.beforeAll(async () => {
    test.setTimeout(400_000)
    model = await fakeModel([
      { tool: 'read', input: { file_path: 'lectures/intro/lecture.md', offset: 13, limit: 2 } },
      { text: '已读到指定的代码行。' },
      { tool: 'read', input: { file_path: 'notes %.md' } },
      { text: '已读到工作区笔记。' },
    ])
    studio = await startStudio({ port: 5683 + studioPortOffset, model, prefix: 'single-editor' })
    writeFileSync(join(studio.workspace.dir, 'notes %.md'), '# 工作区笔记\n')
    writeFileSync(join(studio.workspace.dir, 'diagram.svg'), '<svg xmlns="http://www.w3.org/2000/svg" width="80" height="40"><rect width="80" height="40" fill="teal"/></svg>')
  })
  test.afterAll(async () => { await studio?.close(); await model?.close() })

  test('390px: chat line references and file links share one editor, keep drafts, and root files can be saved', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 900 })
    await studio.open(page)
    await openDocument(page, '分词入门')
    const activity = page.getByRole('navigation', { name: '活动栏' })
    await activity.getByRole('button', { name: '文件', exact: true }).click()
    await openFile(page, 'lecture.md', '一份讲分词的讲义')
    await showConversation(page)
    await send(page, '读取第十三行')
    await expect(conversation(page)).toContainText('已读到指定的代码行。', { timeout: 60_000 })
    await conversation(page).getByText(/已完成.*用时/).last().click()
    await conversation(page).getByRole('button', { name: '已读取文件', exact: true }).last().click()
    const reference = conversation(page).getByRole('button', { name: 'lectures/intro/lecture.md', exact: true })
    await reference.click()
    await expect(editor(page)).toBeVisible()
    await expect(page.locator('[data-status="line"]')).toHaveText('第 13 行')
    await expect(page.locator('.pmw-editor-group__tab:visible:has([role="tab"][title])')).toHaveCount(1)
    await expect(page.locator('[data-pmw-slot="rightbar"]')).toBeHidden()
    await expect(conversation(page).getByRole('button', { name: /^(Open right sidebar|打开右侧边栏)$/ })).toHaveCount(0)
    await page.keyboard.press('End')
    await page.keyboard.type('（保留草稿390）')
    await showConversation(page)
    await reference.click()
    await expect(editor(page)).toContainText('（保留草稿390）')
    await expect(page.locator('.pmw-editor-group__tab:visible:has([role="tab"][title])')).toHaveCount(1)
    await page.screenshot({ path: test.info().outputPath('shared-editor.png'), animations: 'disabled' })

    await showConversation(page)
    await send(page, '读取工作区的笔记')
    await expect(conversation(page)).toContainText('已读到工作区笔记。', { timeout: 60_000 })
    await expect(conversation(page).getByText(/已完成.*用时/)).toHaveCount(2)
    await conversation(page).getByText(/已完成.*用时/).last().click()
    await conversation(page).getByRole('button', { name: '已读取文件', exact: true }).last().click()
    const notes = conversation(page).getByRole('button', { name: 'notes %.md', exact: true })
    await notes.click()
    await expect(page.getByRole('dialog', { name: '保存未完成的修改？' })).toHaveCount(0)
    await expect(editor(page)).toContainText('工作区笔记')
    await expect(page.locator('.pmw-editor-group__tab:visible:has([role="tab"][title])')).toHaveCount(2)
    await page.getByRole('tab', { name: /^lecture\.md/ }).click()
    await expect(editor(page)).toContainText('（保留草稿390）')
    await page.getByRole('tab', { name: 'notes %.md', exact: true }).click()
    await editor(page).click()
    await page.keyboard.press('Control+End')
    await page.keyboard.type('已保存390\n')
    await page.keyboard.press('Control+s')
    await expect(page.locator('.pmw-editor-group__tab:visible:has([role="tab"][title])[data-active] .pmw-source__dot')).toBeHidden()
    expect(readFileSync(join(studio.workspace.dir, 'notes %.md'), 'utf8')).toContain('已保存390')
  })
})

test.describe('unified conversations', () => {
  let studio: Studio
  let model: FakeModel
  test.beforeAll(async () => {
    test.setTimeout(400_000)
    model = await fakeModel([1440, 390].map(() => ({ text: '这是一段可恢复的对话。' })))
    studio = await startStudio({ port: 5695 + studioPortOffset, model, prefix: 'unified-conversations' })
  })
  test.afterAll(async () => { await studio?.close(); await model?.close() })

  for (const width of [1440, 390]) test(`${width}px: one conversation entry restores chat from current and previous history rows, keeping both drafts`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 })
    let selected: string | undefined
    page.on('response', response => {
      if (response.url().endsWith('/api/presmium/context') && response.ok()) selected = response.request().postDataJSON().session
    })
    await studio.open(page)
    await openDocument(page, '分词入门')
    const activity = page.getByRole('navigation', { name: '活动栏' })
    await expect(activity.getByRole('button', { name: '历史对话', exact: true })).toHaveCount(1)
    await expect(activity.locator('[data-activity="conversation"]')).toHaveCount(0)
    if (width === 390) await activity.getByRole('button', { name: '文件', exact: true }).click()
    await openFile(page, 'lecture.md', '一份讲分词的讲义')
    await editor(page).getByText('一份讲分词的讲义').click()
    await page.keyboard.press('End')
    await page.keyboard.type('（对话导航保留草稿）')
    await showConversation(page)
    await send(page, '保存一个历史会话')
    await expect(conversation(page)).toContainText('这是一段可恢复的对话。', { timeout: 60_000 })
    await expect.poll(() => selected).toBeTruthy()
    const previous = selected!
    const draft = conversation(page).locator('[contenteditable="true"]').first()
    await draft.fill('还没有发送的草稿')
    await showHistory(page)
    if (width === 1440) await conversation(page).getByRole('button', { name: '收起对话', exact: true }).click()
    await expect(conversation(page)).toBeHidden()
    const row = page.locator(`[data-pmw-slot="sidebar"] [data-row-key="session:${previous}"]`)
    await row.click()
    await expect(conversation(page)).toBeVisible()
    await expect(draft).toContainText('还没有发送的草稿')
    await conversation(page).getByRole('button', { name: '新建对话', exact: true }).click()
    await expect.poll(() => selected).not.toBe(previous)
    if (width === 1440) await page.setViewportSize({ width: 900, height: 900 })
    await showHistory(page)
    await row.click()
    await expect(conversation(page)).toBeVisible()
    await expect(conversation(page)).toContainText('这是一段可恢复的对话。')
    await expect(draft).toContainText('还没有发送的草稿')
    if (width === 1440) await page.setViewportSize({ width, height: 900 })
    else await activity.getByRole('button', { name: '编辑区', exact: true }).click()
    await expect(editor(page)).toContainText('（对话导航保留草稿）')
    await page.screenshot({ path: test.info().outputPath('unified-conversations.png'), animations: 'disabled' })
  })
})

test.describe('workspace code files', () => {
  let studio: Studio
  let model: FakeModel
  const path = 'examples/sample-repo/src/bpe.py'
  test.beforeAll(async () => {
    test.setTimeout(400_000)
    model = await fakeModel([1440, 390].flatMap(() => [
      { tool: 'read', input: { file_path: path, offset: 3, limit: 2 } },
      { text: '已读取代码。' },
    ]))
    studio = await startStudio({ port: 5693 + studioPortOffset, model, prefix: 'workspace-code' })
  })
  test.afterAll(async () => { await studio?.close(); await model?.close() })

  for (const width of [1440, 390]) test(`${width}px: workspace Python and TypeScript files open from the tree and chat, save, and keep the lecture preview and drafts`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 })
    await studio.open(page)
    await openDocument(page, '分词入门')
    const activity = page.getByRole('navigation', { name: '活动栏' })
    if (width === 390) await activity.getByRole('button', { name: '文件', exact: true }).click()
    await openFile(page, path, 'def get_stats(tokens):')
    await editor(page).click()
    await page.keyboard.press('Control+End')
    await page.keyboard.type(`\n# 工作区代码草稿${width}\n`)
    if (width === 390) await activity.getByRole('button', { name: '文件', exact: true }).click()
    await page.getByRole('tree', { name: '文件', exact: true }).hover()
    await page.mouse.wheel(0, 600)
    await openFile(page, 'scripts/tokens.ts', 'export function tokens(text: string)')
    await page.getByRole('tab', { name: /^bpe\.py/ }).click()
    await expect(editor(page)).toContainText(`工作区代码草稿${width}`)
    await page.getByRole('button', { name: '保存', exact: true }).click()
    await expect(page.locator('.pmw-editor-group__tab:visible .pmw-source__dot')).toBeHidden()
    expect(readFileSync(join(studio.workspace.dir, path), 'utf8')).toContain(`工作区代码草稿${width}`)
    const frame = page.locator('.pmw-preview__frame')
    if (width === 1440) await splitPreview(page)
    else await selectPreview(page)
    await expect(frame).toHaveAttribute('title', '分词入门 的预览')
    if (width === 1440) await expect(preview(page).locator('[data-section="words"]')).toBeVisible({ timeout: 120_000 })
    if (width === 390) await showConversation(page)
    await send(page, '读取工作区代码的第三行')
    await expect(conversation(page)).toContainText('已读取代码。', { timeout: 60_000 })
    await conversation(page).getByText(/已完成.*用时/).last().click()
    await conversation(page).getByRole('button', { name: '已读取文件', exact: true }).last().click()
    await conversation(page).getByRole('button', { name: path, exact: true }).click()
    await expect(editor(page)).toContainText(`工作区代码草稿${width}`)
    await expect(page.locator('[data-status="line"]')).toHaveText('第 3 行')
    await expect(page.locator('.pmw-editor-group__tab:visible:has([role="tab"][title])')).toHaveCount(2)
    if (width === 390) await selectPreview(page)
    await expect(frame).toHaveAttribute('title', '分词入门 的预览')
    if (width === 390) await page.getByRole('tab', { name: /^bpe\.py/ }).click()
    await expect(page.locator('[data-pmw-slot="rightbar"]')).toBeHidden()
    await page.screenshot({ path: test.info().outputPath('workspace-code.png'), animations: 'disabled' })
  })
})

test.describe('the brand', () => {
  let studio: Studio

  test.beforeAll(async () => {
    test.setTimeout(400_000)
    studio = await startStudio({ port: 5645 + studioPortOffset, prefix: 'brand' })
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
      await expect(sidebar.locator('svg.pmw-logo')).toHaveCount(0)
      await expect(activity.locator('svg.pmw-logo')).toHaveCount(1)
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
      await activity.getByRole('button', { name: /^(Plugins|插件)$/ }).click()
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
    studio = await startStudio({ port: 5647 + studioPortOffset, prefix: 'off' })
  })

  test.afterAll(async () => {
    await studio?.close()
  })

  test('turned off in the Plugins page, the workbench stays and says how to turn Presmium on again (17, item 6)', async ({ page }) => {
    const api = await studio.web.api()
    expect(await api.call('pluginManager/setBundleEnabled', { name: '@lincyaw/dsh', enabled: false })).toMatchObject({ changed: true, application: 'applied' })
    await studio.open(page)
    await expect(page.locator('.pmw-frame')).toBeVisible()
    await expect(page.locator('.pmw-home').getByRole('alert')).toContainText('@lincyaw/dsh')
    expect(await api.call('pluginManager/setBundleEnabled', { name: '@lincyaw/dsh', enabled: true })).toMatchObject({ changed: true })
    await page.reload()
    await expect(page.locator('.pmw-home__card')).toHaveCount(2)
  })
})
