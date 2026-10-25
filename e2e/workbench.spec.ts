import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import type { FrameLocator, Page } from '@playwright/test'
import { fakeCollector } from '../packages/dsh/src/node/fake-collector.ts'
import { fakeModel } from '../packages/dsh/src/node/fake-model.ts'
import type { FakeModel } from '../packages/dsh/src/node/fake-model.ts'
import { BRAND_SLOTS, EXPERIMENTAL_GROUP, LAYOUT_MEMBERS, ONBOARDING, ROOT_CHILDREN, SHELL_MODULES, UI_LAYOUT } from '../packages/dsh/src/client/contract.ts'
import { DSH_THEME_TOKENS } from '../packages/dsh/src/client/theme.ts'
import { lowContrast } from './fixtures/contrast.ts'
import { aliasTokens, clientOf, layoutMembersUsed, rendersSlot, rootChildren, shellModules } from './fixtures/workbench/audit.ts'
import { startStudio } from './fixtures/workbench/studio.ts'
import type { Studio } from './fixtures/workbench/studio.ts'

test.describe.configure({ mode: 'serial', timeout: 300_000 })
test.use({ locale: 'zh-CN', actionTimeout: 30_000 })

const studioPortOffset = Number(process.env.PRESMIUM_E2E_STUDIO_PORT_OFFSET ?? 0)

const preview = (page: Page): FrameLocator => page.frameLocator('.pmw-preview__frame')
const conversation = (page: Page) => page.locator('[data-pmw-slot="main:conversation"]')
const activity = (page: Page) => page.getByRole('navigation', { name: '应用栏' })
const tools = (page: Page) => page.getByRole('toolbar', { name: '对所选内容的操作' })

async function showConversation(page: Page): Promise<void> {
  if (!await conversation(page).isVisible()) await page.locator('[data-activity="assistant"]').click()
  await expect(conversation(page)).toBeVisible()
}

async function showHistory(page: Page): Promise<void> {
  await showConversation(page)
  await conversation(page).getByRole('button', { name: '对话记录', exact: true }).click()
  await expect(page.locator('[data-pmw-slot="sidebar"]')).toBeVisible()
}

async function openDocument(page: Page, title: string): Promise<void> {
  await page.locator('.pmw-home__card').filter({ hasText: title }).locator('.pmw-home__open').click()
  await expect(page.locator('.pmw-preview__frame')).toHaveAttribute('title', title)
}

async function send(page: Page, message: string): Promise<void> {
  await conversation(page).locator('[contenteditable="true"]').first().click()
  await page.keyboard.type(message)
  await page.keyboard.press('Enter')
}

/** Drags across the text in the preview, selecting it. */
async function select(page: Page, text: string): Promise<void> {
  const box = (await preview(page).getByText(text).boundingBox())!
  await page.mouse.move(box.x + 1, box.y + box.height / 2)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width - 1, box.y + box.height / 2, { steps: 6 })
  await page.mouse.up()
}

const texts = (value: unknown): string[] => typeof value === 'string' ? [value] : value && typeof value === 'object' ? Object.values(value).flatMap(texts) : []

/** What the author's latest message to the model in the turns since `after` says: its first text, before the runtime context the host adds. */
function asked(model: FakeModel, after: number): string {
  const turns = model.received.slice(after).filter(request => Array.isArray(request.body.tools))
  const messages = turns.at(-1)?.body.messages as { role: string, content: unknown }[] | undefined
  // The author's messages begin with text; the agent's tool results come back as user messages too.
  const content = messages?.filter(message => message.role === 'user' && (!Array.isArray(message.content) || (message.content[0] as { type?: string } | undefined)?.type === 'text')).at(-1)?.content
  return Array.isArray(content) ? texts(content[0]).join('\n') : texts(content).join('\n')
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
      { text: '收到批注。' },
      { tool: 'read', input: { file_path: 'lectures/intro/lecture.md' } },
      { tool: 'edit', input: { file_path: 'lectures/intro/lecture.md', old_string: '最常相邻的一对合并成一个新词元。', new_string: '最常相邻的一对合并成一个新词元，例如 a 与 b 合成 ab。' } },
      { text: '改好了。' },
      { text: '已修复。' },
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
    // The documents by their titles only: no directories, files, branches or addresses.
    await expect(page.locator('.pmw-home__card')).toHaveCount(2)
    await expect(page.locator('.pmw-frame__centre')).not.toContainText(/lectures\/|MCP|master|presmium\.workspace/)
    await expect(activity(page).locator('[data-activity]')).toHaveCount(5)
    for (const name of ['文稿', 'AI 助手', '更多', '设置', '帮助']) await expect(activity(page).getByRole('button', { name, exact: true })).toBeVisible()
    // One workspace: the conversation offers no other, nor another agent preset.
    await expect(conversation(page).getByRole('button', { name: '选择工作区' })).toBeHidden()
    await expect(conversation(page).locator('[data-slot="conversation.hero.agentPreset"]')).toBeHidden()
    for (let attempt = 0; attempt < 3; attempt++) {
      await page.reload()
      await expect(page.locator('.pmw-frame')).toBeVisible()
      await expect(conversation(page).locator('[contenteditable="true"]')).toBeVisible()
    }
    expect(errors).toEqual([])
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

  test('one brand, one settings entry and one conversation header; the chat history lists sessions only and never covers the document', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await studio.open(page)
    await openDocument(page, '分词入门')
    const sidebar = page.locator('[data-pmw-slot="sidebar"]')
    for (const width of [1440, 900, 390]) {
      await page.setViewportSize({ width, height: 900 })
      await showConversation(page)
      await expect(conversation(page).getByRole('button', { name: '新建对话', exact: true })).toBeVisible()
      await expect(conversation(page).getByRole('button', { name: /^(Open right sidebar|打开右侧边栏)$/ })).toHaveCount(0)
      await expect(conversation(page).locator('header').filter({ has: page.locator('.pmw-chat-actions') })).toHaveCount(1)
      await conversation(page).getByRole('button', { name: '对话记录', exact: true }).click()
      await expect(sidebar.getByRole('heading', { name: '对话记录' })).toBeVisible()
      await expect(sidebar.locator('[data-row-key^="session:"]').first()).toBeVisible()
      await expect(sidebar.locator('[data-row-key^="workspace:"]')).toBeHidden()
      await expect(activity(page).locator('svg.pmw-logo')).toHaveCount(1)
      await expect(sidebar.locator('svg.pmw-logo')).toHaveCount(0)
      await expect(page.getByRole('button', { name: '设置', exact: true })).toHaveCount(1)
      if (width >= 768) {
        const side = (await sidebar.boundingBox())!
        const centre = (await page.locator('.pmw-frame__centre').boundingBox())!
        expect(side.x + side.width).toBeLessThanOrEqual(centre.x + 1)
      }
      if (width === 1440) {
        await expect(preview(page).locator('[data-section="words"]')).toBeVisible({ timeout: 120_000 })
        await page.screenshot({ path: test.info().outputPath('one-navigation.png'), animations: 'disabled' })
      }
      await sidebar.getByRole('button', { name: '收起对话记录', exact: true }).click()
      await expect(sidebar).toBeHidden()
    }
  })

  test('plugins and automation tasks open from More and give the document back, at desktop and phone widths', async ({ page }) => {
    await studio.open(page)
    await openDocument(page, '分词入门')
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 900 })
      for (const label of ['插件', '自动化任务']) {
        await activity(page).getByRole('button', { name: '更多', exact: true }).click()
        await page.getByRole('menuitem', { name: label, exact: true }).click()
        const panel = page.locator('.pmw-frame__panel')
        await expect(panel).toBeVisible()
        await expect(panel.getByText(label, { exact: true }).first()).toBeVisible()
      }
      await activity(page).locator('[data-activity="document"]').click()
      await expect(page.locator('.pmw-frame__panel')).toHaveCount(0)
      await expect(page.locator('.pmw-appbar__title')).toHaveText('分词入门')
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
    }
  })

  test('the document lies as one page on the canvas, without the site\'s navigation; the navigation pane goes to a section and the status bar follows', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await studio.open(page)
    await openDocument(page, '分词入门')
    await expect(preview(page).locator('.pm-sheet [data-section="words"]')).toBeVisible({ timeout: 120_000 })
    // None of the reader's site: no menus, search, sidebar or outline of the page.
    await expect(preview(page).getByRole('navigation')).toHaveCount(0)
    await expect(preview(page).getByRole('button', { name: /搜索|Search/ })).toHaveCount(0)
    const pane = page.getByRole('navigation', { name: '导航' })
    await expect(pane.locator('.pmw-navigation__item')).toHaveText(['分词入门', '词元', '合并', '延伸', '问题'])
    await pane.getByRole('button', { name: '延伸', exact: true }).click()
    await expect(preview(page).locator('[data-section="extend"]')).toBeInViewport()
    await expect(pane.getByRole('button', { name: '延伸', exact: true })).toHaveAttribute('aria-current', 'location')
    await expect(page.locator('.pmw-statusbar')).toContainText('第 4 节，共 5 节')
    await page.screenshot({ path: test.info().outputPath('page-on-canvas.png'), animations: 'disabled' })
  })

  test('Present shows the same page as its presentation, at the place the author is, and Document goes back at once; the navigation pane lists the slides', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await studio.open(page)
    await openDocument(page, '分词入门')
    await expect(preview(page).locator('.pm-sheet [data-section="words"]')).toBeVisible({ timeout: 120_000 })
    const frame = page.locator('.pmw-preview__frame:visible')
    const page_ = await frame.getAttribute('src')
    const pane = page.getByRole('navigation', { name: '导航' })
    const views = page.getByRole('group', { name: '视图' })
    await pane.getByRole('button', { name: '合并', exact: true }).click()
    await views.getByRole('button', { name: '放映', exact: true }).click()
    await expect(preview(page).locator('.pm-present[data-section="merge"]')).toBeVisible()
    // The workbench has its own controls: none of presenting's own.
    await expect(preview(page).locator('.pm-present__bar')).toBeHidden()
    await expect(page.locator('.pmw-statusbar')).toContainText('幻灯片 3 / 5')
    await expect(pane.locator('.pmw-navigation__number')).toHaveText(['1', '2', '3', '4', '5'])
    await pane.locator('.pmw-navigation__item').filter({ hasText: '延伸' }).click()
    await expect(preview(page).locator('.pm-present[data-section="extend"]')).toBeVisible()
    await views.getByRole('button', { name: '文档', exact: true }).click()
    await expect(preview(page).locator('.pm-present')).toHaveCount(0)
    await expect(preview(page).locator('[data-section="extend"]')).toBeInViewport()
    // One page throughout: switching never loaded it again.
    await expect(frame).toHaveAttribute('src', page_!)
  })

  test('a double-clicked paragraph is edited in place; each edit is a version that undo and redo walk; formatted text goes to the AI instead', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await studio.open(page)
    await openDocument(page, '分词入门')
    const file = join(studio.workspace.dir, 'lectures/intro/lecture.md')
    const paragraph = preview(page).getByText('这一段要改的词是 alpha')
    await expect(paragraph).toBeVisible({ timeout: 120_000 })
    await paragraph.dblclick()
    const editing = preview(page).locator('[data-preview-editing]')
    await expect(editing).toBeVisible()
    await expect(tools(page)).toBeHidden()
    await page.keyboard.press('End')
    await page.keyboard.press('Backspace')
    await page.keyboard.type(' beta。')
    await page.keyboard.press('Enter')
    await expect(editing).toHaveCount(0)
    await expect.poll(() => readFileSync(file, 'utf8')).toContain('这一段要改的词是 alpha beta。')
    await expect(page.locator('.pmw-toolbar__status')).toContainText('已保存')
    expect(git(studio.workspace.dir, ['log', '-1', '--format=%s']).trim()).toBe('编辑“词元”')
    await expect(preview(page).locator('[data-section="words"]')).toContainText('alpha beta', { timeout: 60_000 })

    await page.getByRole('button', { name: '撤消：编辑“词元”（Ctrl+Z）' }).click()
    await expect.poll(() => readFileSync(file, 'utf8')).toContain('这一段要改的词是 alpha。')
    await expect(preview(page).locator('[data-section="words"]')).not.toContainText('beta', { timeout: 60_000 })
    await page.locator('.pmw-appbar__title').click()
    await page.keyboard.press('Control+y')
    await expect.poll(() => readFileSync(file, 'utf8')).toContain('这一段要改的词是 alpha beta。')
    await page.getByRole('button', { name: '版本历史', exact: true }).click()
    const versions = page.getByRole('region', { name: '版本历史' }).locator('.pmw-version')
    await expect(versions.first()).toContainText('编辑“词元”')
    await expect(versions.first()).toContainText('你')
    await expect(versions.first()).not.toContainText('已撤消')
    await versions.first().getByRole('button', { name: '撤消此更改' }).click()
    await expect(versions.first()).toContainText('已撤消')
    await expect.poll(() => readFileSync(file, 'utf8')).toContain('这一段要改的词是 alpha。')
    await page.screenshot({ path: test.info().outputPath('version-history.png'), animations: 'disabled' })

    // Typing over the link of the first paragraph would drop it: the edit is offered to the AI and the file stays.
    const before = readFileSync(file, 'utf8')
    await preview(page).getByText('一份讲分词的讲义').dblclick()
    await expect(editing).toBeVisible()
    await page.keyboard.press('Control+a')
    await page.keyboard.type('一段全新的开场白。')
    await page.keyboard.press('Enter')
    await expect(page.locator('.pmw-notices')).toContainText('不能直接改文字')
    await page.locator('.pmw-notices').getByRole('button', { name: '取消', exact: true }).click()
    await expect(page.locator('.pmw-notices')).not.toContainText('不能直接改文字')
    expect(readFileSync(file, 'utf8')).toBe(before)
    await expect(preview(page).getByText('转到第二讲')).toBeVisible({ timeout: 60_000 })
  })

  test('a click or a selection opens the toolbar beside it; comments are numbered on their blocks, listed, and sent to the AI together', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await studio.open(page)
    await openDocument(page, '分词入门')
    const block = preview(page).getByText('最常相邻的一对合并成一个新词元。')
    await expect(block).toBeVisible({ timeout: 120_000 })
    await block.click()
    await expect(tools(page)).toBeVisible()
    const at = (await block.boundingBox())!
    const popover = (await page.locator('.pmw-pointer').boundingBox())!
    expect(Math.abs(popover.y - (at.y + at.height))).toBeLessThan(60)
    await expect(preview(page).locator('[data-preview-highlight]')).toContainText('最常相邻的一对')
    await expect(tools(page).getByRole('button')).toHaveCount(1)
    await expect(tools(page).getByRole('button', { name: '新建批注' })).toHaveText('')
    await tools(page).getByRole('button', { name: '新建批注' }).click()
    await page.getByRole('textbox', { name: '新建批注' }).fill('这里加一个例子')
    await page.getByRole('button', { name: '发布', exact: true }).click()
    await expect(tools(page)).toBeHidden()
    await expect(preview(page).locator('.pm-preview-pin')).toHaveText('1')
    const send = page.locator('.pmw-toolbar').getByRole('button', { name: '发送 1 条批注给 AI' })
    await expect(send).toBeVisible()

    await select(page, '这一段要改的词是')
    await expect(tools(page)).toBeVisible()
    await page.screenshot({ path: test.info().outputPath('pointer-toolbar.png'), animations: 'disabled' })
    await page.keyboard.press('Escape')

    await page.locator('.pmw-toolbar').getByRole('button', { name: /^批注/ }).click()
    const comments = page.getByRole('region', { name: '批注' })
    await expect(comments.locator('.pmw-comment')).toHaveCount(1)
    await expect(comments.locator('.pmw-comment')).toContainText('这里加一个例子')
    await expect(comments.locator('.pmw-comment')).toContainText('位于“合并”')
    await expect(comments).toContainText('1 条批注等待发送')
    const before = model.received.length
    await send.click()
    await expect.poll(() => asked(model, before), { timeout: 60_000 }).toContain('这里加一个例子')
    // The author's own words with the place as readers see it; the source range is in the context's focus, not the message.
    const message = asked(model, before)
    expect(message).toContain('合并')
    expect(message).not.toMatch(/lecture\.md|:\d+-\d+/)
    const focus = model.received.slice(before).flatMap(request => texts(request.body.messages)).findLast(text => text.includes('<presmium-document>')) ?? ''
    expect(focus).toContain('"id":"comment-1"')
    expect(focus).toContain('"file":"lectures/intro/lecture.md"')
    await expect(conversation(page)).toContainText('收到批注。', { timeout: 60_000 })
    // Sent, the comments wait no more: no button, no number on the page.
    await expect(send).toBeHidden()
    await expect(preview(page).locator('.pm-preview-pin')).toHaveCount(0)
    await expect(comments.locator('.pmw-comment')).toContainText('已发送给 AI')
    await comments.getByRole('button', { name: '解决' }).click()
    await expect(comments.locator('.pmw-comment')).toHaveCount(0)
    await page.reload()
    await openDocument(page, '分词入门')
    await page.locator('.pmw-toolbar').getByRole('button', { name: /^批注/ }).click()
    await comments.getByLabel('显示已解决的批注').check()
    await expect(comments.locator('.pmw-comment')).toContainText('已解决')
  })

  test('selected focus from chat reaches the AI; the changed block blinks on the document; the change is one version, undone from the history', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await studio.open(page)
    await openDocument(page, '分词入门')
    await showConversation(page)
    await expect(preview(page).getByText('最常相邻的一对合并成一个新词元。')).toBeVisible({ timeout: 120_000 })
    await select(page, '最常相邻的一对合并成一个新词元。')
    await expect(tools(page)).toBeVisible()
    const before = model.received.length
    await send(page, '举个例子')
    await expect.poll(() => asked(model, before), { timeout: 60_000 }).toContain('举个例子')
    // The source range is the context's focus; the author's message names no file.
    expect(asked(model, before)).not.toContain('lecture.md')
    const focus = model.received.slice(before).flatMap(request => texts(request.body.messages)).findLast(text => text.includes('<presmium-document>')) ?? ''
    expect(focus).toContain('最常相邻的一对')
    expect(focus).toContain('"file":"lectures/intro/lecture.md"')
    const lecture = join(studio.workspace.dir, 'lectures/intro/lecture.md')
    await expect.poll(() => readFileSync(lecture, 'utf8'), { timeout: 60_000 }).toContain('例如 a 与 b 合成 ab。')
    // When the turn's change stands, the block it changed blinks where the author reads; the others do not.
    const flashing = preview(page).locator('[data-preview-flash]')
    await expect(flashing).toContainText('例如 a 与 b 合成 ab。', { timeout: 60_000 })
    expect(await flashing.count()).toBe(1)
    await expect(conversation(page)).toContainText('改好了。', { timeout: 60_000 })
    // With nobody asked to review, the turn's change is committed when it ends.
    await expect.poll(() => git(studio.workspace.dir, ['log', '-1', '--format=%(trailers:key=Presmium-Origin,valueonly)']).trim(), { timeout: 60_000 }).toBe('agent')
    await page.getByRole('button', { name: '版本历史', exact: true }).click()
    const latest = page.getByRole('region', { name: '版本历史' }).locator('.pmw-version').first()
    await expect(latest).toContainText('AI')
    await latest.getByRole('button', { name: '撤消此更改' }).click()
    await expect(latest).toContainText('已撤消')
    expect(readFileSync(lecture, 'utf8')).not.toContain('例如 a 与 b')
  })

  test('content that does not display is said plainly; the details tell what; the AI is asked to fix it', async ({ page }) => {
    await studio.open(page)
    await openDocument(page, '分词入门')
    const notices = page.locator('.pmw-notices')
    await expect(notices).toContainText('有 1 处内容没能正确显示。')
    await expect(notices.getByText(/nosuch/)).toBeHidden()
    await notices.getByText('详细信息').click()
    await expect(notices.getByText(/nosuch/)).toBeVisible()
    const before = model.received.length
    await notices.getByRole('button', { name: '让 AI 修复' }).click()
    await expect.poll(() => asked(model, before), { timeout: 60_000 }).toContain('nosuch')
    await expect(conversation(page)).toContainText('已修复。', { timeout: 60_000 })
  })

  test('the text of the workbench\'s panels and DeepSeek Harness\'s mapped ones reaches WCAG AA, light and dark', async ({ page }) => {
    for (const scheme of ['light', 'dark'] as const) {
      await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' })
      await studio.open(page)
      await expect(page.locator('html')).toHaveClass(scheme === 'dark' ? /\bdark\b/ : /^(?!.*\bdark\b)/)
      await expect(page.locator('.pmw-home__card').first()).toBeVisible()
      await expect.poll(() => lowContrast(page, '.pmw-frame'), { message: `${scheme}: the documents` }).toEqual([])
      await openDocument(page, '分词入门')
      await page.getByRole('button', { name: '版本历史', exact: true }).click()
      await showHistory(page)
      await expect.poll(() => lowContrast(page, '.pmw-frame', '.pmw-preview__frame'), { message: `${scheme}: the document and its history` }).toEqual([])
      await page.locator('.pmw-toolbar').getByRole('button', { name: /^批注/ }).click()
      await expect.poll(() => lowContrast(page, '.pmw-frame', '.pmw-preview__frame'), { message: `${scheme}: the comments` }).toEqual([])
    }
  })

  test('the documents: one made from its title, renamed, copied and deleted, each a version, the cards following', async ({ page }) => {
    await studio.open(page)
    const dir = studio.workspace.dir
    const commits = () => Number(git(dir, ['rev-list', '--count', 'HEAD']).trim())
    const before = commits()
    const card = (text: string) => page.locator('.pmw-home__card').filter({ hasText: text })
    await page.getByRole('button', { name: '新建文稿' }).click()
    const dialog = page.getByRole('dialog', { name: '新建文稿' })
    await dialog.getByLabel('标题').fill('第三讲')
    await dialog.getByRole('button', { name: '创建' }).click()
    await expect(page.locator('.pmw-appbar__title')).toHaveText('第三讲')
    expect(commits()).toBe(before + 1)
    await page.locator('[data-activity="documents"]').click()
    await expect(card('第三讲')).toBeVisible()

    await card('第三讲').getByRole('button', { name: '“第三讲”的更多操作' }).click()
    await page.getByRole('menuitem', { name: '重命名', exact: true }).click()
    await page.getByRole('dialog', { name: '重命名' }).getByLabel('标题').fill('第四讲')
    await page.getByRole('dialog', { name: '重命名' }).getByRole('button', { name: '保存' }).click()
    await expect(card('第四讲')).toBeVisible()
    await expect(card('第三讲')).toHaveCount(0)
    expect(commits()).toBe(before + 2)

    await card('第四讲').getByRole('button', { name: '“第四讲”的更多操作' }).click()
    await page.getByRole('menuitem', { name: '创建副本' }).click()
    await expect(card('第四讲（副本）')).toBeVisible()
    expect(commits()).toBe(before + 4)

    await card('第四讲（副本）').getByRole('button', { name: /的更多操作$/ }).click()
    await page.getByRole('menuitem', { name: '删除' }).click()
    await page.getByRole('dialog', { name: '删除' }).getByRole('button', { name: '删除' }).click()
    await expect(card('第四讲（副本）')).toHaveCount(0)
    await expect(page.locator('.pmw-home__card')).toHaveCount(3)
    expect(commits()).toBe(before + 5)
    expect(git(dir, ['log', '-5', '--format=%(trailers:key=Presmium-Origin,valueonly)']).split('\n').filter(Boolean)).toEqual([
      'document delete lectures/document-copy',
      'editor',
      'document copy lectures/document lectures/document-copy',
      'editor',
      'document create lectures/document',
    ])
  })
})

test.describe('the conversation', () => {
  let studio: Studio
  let model: FakeModel

  test.beforeAll(async () => {
    test.setTimeout(400_000)
    model = await fakeModel([
      { text: '已看到选中的内容。' },
      { text: '现在是第二份讲义。' },
      { tool: 'read', input: { file_path: 'lectures/intro/lecture.md', offset: 14, limit: 1 } },
      { text: '已读到那一段。' },
    ])
    studio = await startStudio({ port: 5661 + studioPortOffset, model, prefix: 'conversation' })
  })
  test.afterAll(async () => {
    await studio?.close()
    await model?.close()
  })

  for (const width of [1440, 390]) test(`${width}px: a new chat starts from the conversation header, the history stays reachable and the document stays open`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 })
    await studio.open(page)
    const selected: { session: string, document: string | null }[] = []
    page.on('response', response => {
      if (response.url().endsWith('/api/presmium/context') && response.ok()) selected.push(response.request().postDataJSON())
    })
    await openDocument(page, '分词入门')
    await showConversation(page)
    const composer = conversation(page).locator('[contenteditable="true"]').first()
    await composer.fill('前一个对话尚未发送的内容')
    await expect.poll(() => selected.at(-1)?.document).toBe('lectures/intro')
    const previous = selected.at(-1)!.session
    await conversation(page).getByRole('button', { name: '新建对话', exact: true }).click()
    await expect.poll(() => selected.at(-1)?.session).not.toBe(previous)
    expect(selected.at(-1)?.document).toBe('lectures/intro')
    await expect(composer).toBeEmpty()
    await conversation(page).getByRole('button', { name: '对话记录', exact: true }).click()
    await expect(page.locator('[data-pmw-slot="sidebar"]')).toBeVisible()
    if (width === 390) await activity(page).locator('[data-activity="document"]').click()
    await expect(page.locator('.pmw-appbar__title')).toHaveText('分词入门')
    await expect(page.locator('.pmw-preview__frame')).toBeVisible()
    if (width === 1440) await page.screenshot({ path: test.info().outputPath('chat-toolbar.png') })
  })

  test('what the author points at reaches the model with its document and source range, and goes on Escape or when the document changes', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await studio.open(page)
    await openDocument(page, '分词入门')
    const quote = '最常相邻的一对合并成一个新词元。'
    await expect(preview(page).getByText(quote)).toBeVisible({ timeout: 120_000 })
    await select(page, quote)
    await expect(tools(page)).toBeVisible()
    const context = (after: number) => model.received.slice(after).filter(request => Array.isArray(request.body.tools)).flatMap(request => texts(request.body.messages)).findLast(text => text.includes('<presmium-document>')) ?? ''
    let before = model.received.length
    await send(page, '解释我选中的内容')
    await expect.poll(() => context(before), { timeout: 60_000 }).toContain(quote)
    expect(context(before)).toContain('"from":"web"')
    expect(context(before)).toContain('"file":"lectures/intro/lecture.md"')
    await expect(conversation(page)).toContainText('已看到选中的内容。')
    await select(page, quote)
    await page.keyboard.press('Escape')
    await expect(tools(page)).toBeHidden()
    await expect.poll(async () => (await (await page.request.get(`${studio.web.url}/api/presmium/focus?document=lectures/intro`)).json()).focus).toEqual([])
    await page.locator('[data-activity="documents"]').click()
    await openDocument(page, 'Second lecture')
    before = model.received.length
    await send(page, '现在讲的是哪份文档')
    await expect.poll(() => context(before), { timeout: 60_000 }).toContain('Document "lectures/second"')
    expect(context(before)).not.toContain(quote)
    await expect(conversation(page)).toContainText('现在是第二份讲义。')
  })

  test('390px: a link to the document\'s source in the chat shows that place in the document', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 900 })
    await studio.open(page)
    await openDocument(page, '分词入门')
    await showConversation(page)
    await send(page, '读取第十四行')
    await expect(conversation(page)).toContainText('已读到那一段。', { timeout: 60_000 })
    await conversation(page).getByText(/已完成.*用时/).last().click()
    await conversation(page).getByRole('button', { name: '已读取文件', exact: true }).last().click()
    await conversation(page).getByRole('button', { name: 'lectures/intro/lecture.md', exact: true }).click()
    await expect(page.locator('.pmw-preview__frame')).toBeVisible()
    await expect(preview(page).locator('[data-preview-highlight]')).toContainText('alpha', { timeout: 60_000 })
    await expect(page.locator('[data-pmw-slot="rightbar"]')).toBeHidden()
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

  for (const width of [1440, 390]) test(`${width}px: a history row restores its chat with its draft, whether the chat was hidden or another one shown`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 })
    let selected: string | undefined
    page.on('response', response => {
      if (response.url().endsWith('/api/presmium/context') && response.ok()) selected = response.request().postDataJSON().session
    })
    await studio.open(page)
    await openDocument(page, '分词入门')
    await showConversation(page)
    await send(page, '保存一个历史会话')
    await expect(conversation(page)).toContainText('这是一段可恢复的对话。', { timeout: 60_000 })
    await expect.poll(() => selected).toBeTruthy()
    const previous = selected!
    const draft = conversation(page).locator('[contenteditable="true"]').first()
    await draft.fill('还没有发送的草稿')
    await showHistory(page)
    if (width === 1440) await conversation(page).getByRole('button', { name: '收起 AI 助手', exact: true }).click()
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
    await page.screenshot({ path: test.info().outputPath('unified-conversations.png'), animations: 'disabled' })
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

  for (const { locale, headline, welcome, start, history, more, plugins } of [
    { locale: 'en-US', headline: 'Tell me what to change', welcome: 'Welcome to Presmium', start: 'Get started', history: 'Chat history', more: 'More', plugins: /^(Plugins|插件)$/ },
    { locale: 'zh-CN', headline: '有什么想改的，告诉我', welcome: '欢迎使用 Presmium', start: '开始使用', history: '对话记录', more: '更多', plugins: /^(Plugins|插件)$/ },
  ]) {
    test(`${locale}: Presmium's title, icon, brand and first-use notice; nothing of DeepSeek's in the documents, the conversation, the sessions and the settings`, async ({ browser }) => {
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
      await conversation(page).getByRole('button', { name: history, exact: true }).click()
      const nav = page.getByRole('navigation').first()
      const sidebar = page.locator('[data-pmw-slot="sidebar"]')
      await expect(sidebar.locator('svg.pmw-logo')).toHaveCount(0)
      await expect(nav.locator('svg.pmw-logo')).toHaveCount(1)
      const words = async (selector: string) => (await page.locator(selector).innerText()).replace(/DeepSeek-V[\w.-]+/g, '')
      for (const part of ['.pmw-frame__centre', '[data-pmw-slot="main:conversation"]', '[data-pmw-slot="sidebar"]']) expect(await words(part), part).not.toMatch(/deepseek/i)
      await nav.locator('[data-activity="settings"]').click()
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
      await nav.getByRole('button', { name: more, exact: true }).click()
      await page.getByRole('menuitem', { name: plugins }).click()
      const pluginPage = page.locator('.pmw-frame__panel')
      await expect(pluginPage).toBeVisible()
      await expect(pluginPage.locator('[data-plugin-group]').first()).toBeAttached({ timeout: 30_000 })
      await expect(pluginPage.locator('[data-plugin-group="extensions"]')).toBeHidden()
      expect(await pluginPage.innerText()).not.toMatch(/experimental|实验|market|市场|discover|发现/i)
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

  test('turned off in the Plugins page, the workbench stays and says how to turn Presmium on again', async ({ page }) => {
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

test.describe('the operator\'s collector', () => {
  let studio: Studio
  let model: FakeModel
  let otlp: Awaited<ReturnType<typeof fakeCollector>>

  test.beforeAll(async () => {
    test.setTimeout(400_000)
    otlp = await fakeCollector()
    model = await fakeModel([{ text: '收到批注。' }])
    studio = await startStudio({ port: 5671 + studioPortOffset, model, prefix: 'telemetry', env: { PRESMIUM_TELEMETRY_URL: `${otlp.url}/v1/logs` } })
  })

  test.afterAll(async () => {
    await studio?.close()
    await model?.close()
    await otlp?.close()
  })

  test('the author\'s operations reach the collector in order, and a comment sent to the AI leads to the turn it started', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await studio.open(page)
    await openDocument(page, '分词入门')
    const quote = '最常相邻的一对合并成一个新词元。'
    await expect(preview(page).getByText(quote)).toBeVisible({ timeout: 120_000 })
    await select(page, quote)
    await tools(page).getByRole('button', { name: '新建批注' }).click()
    await page.getByRole('textbox', { name: '新建批注' }).fill('这里是什么意思')
    await page.getByRole('button', { name: '发布', exact: true }).click()
    await page.locator('.pmw-toolbar').getByRole('button', { name: '发送 1 条批注给 AI' }).click()
    await expect(conversation(page)).toContainText('收到批注。', { timeout: 60_000 })

    const operations = () => otlp.logged.filter(record => typeof record.attributes['presmium.operation'] === 'string')
    const named = (name: string) => operations().find(record => record.attributes['presmium.operation'] === name)
    await expect.poll(() => ['document.open', 'point', 'comment.add', 'agent.ask', 'ui.click'].filter(name => !named(name)), { timeout: 30_000 }).toEqual([])
    const client = named('document.open')!.attributes['presmium.client.id']
    expect(operations().every(record => record.attributes['presmium.client.id'] === client)).toBe(true)
    const order = ['document.open', 'point', 'comment.add', 'agent.ask'].map(name => named(name)!.attributes['presmium.seq'] as number)
    expect([...order].sort((a, b) => a - b)).toEqual(order)
    expect(named('comment.add')!.attributes).toMatchObject({ 'presmium.document': 'lectures/intro', 'presmium.text': '这里是什么意思', 'presmium.quote': quote })
    const ask = named('agent.ask')!.attributes
    expect(ask).toMatchObject({ 'presmium.ask.kind': 'comments', 'presmium.outcome': 'sent' })
    expect(String(ask['presmium.ask.text'])).toContain('这里是什么意思')
    // The request's id leads to the session's user message, and its turn to everything the model and its tools did.
    const message = () => otlp.logged.find(record => record.attributes.sessionId === ask['dsh.session.id'] && JSON.parse(String(record.attributes.content)).data?.source?.rpcId === ask['dsh.request.id'])
    await expect.poll(() => Boolean(message()), { timeout: 30_000 }).toBe(true)
    const turn = message()!.attributes['presmium.turn']
    await expect.poll(() => otlp.logged.some(record => record.attributes.sessionId === ask['dsh.session.id'] && record.attributes['presmium.turn'] === turn && JSON.parse(String(record.attributes.content)).type === 'assistant/message'), { timeout: 30_000 }).toBe(true)
    expect(message()!.attributes['presmium.document']).toBe('lectures/intro')
  })
})
