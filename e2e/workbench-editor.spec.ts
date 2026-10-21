import { copyFileSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { fakeModel } from '../packages/cli/src/testing.ts'
import type { FakeModel } from '../packages/cli/src/testing.ts'
import { startStudio } from './fixtures/workbench/studio.ts'
import { selectPreview } from './fixtures/workbench/ui.ts'
import type { Studio } from './fixtures/workbench/studio.ts'

test.describe.configure({ mode: 'serial', timeout: 180_000 })
test.use({ locale: 'zh-CN', actionTimeout: 30_000 })

const editor = (page: Page) => page.locator('.pmw-source__editor .cm-content')

async function openScript(page: Page, path: string): Promise<void> {
  const folder = page.locator('.pmw-tree__file[data-node="directory:scripts"]')
  if (await folder.getAttribute('data-open') !== 'true') await folder.click()
  await page.locator(`.pmw-tree__file[data-path="${path}"]`).click()
  await expect(page.locator('.pmw-source__editor')).toHaveAttribute('data-path', path)
}

test.describe('teaching Python in the workbench editor', () => {
  let studio: Studio
  let model: FakeModel
  test.beforeAll(async () => {
    test.setTimeout(300_000)
    model = await fakeModel([{ text: '已看到工作区代码。' }, { text: '选区已清除。' }, { text: '现在是第二讲。' }])
    studio = await startStudio({ port: 5707 + Number(process.env.PRESMIUM_E2E_STUDIO_PORT_OFFSET ?? 0), prefix: 'python-editor', model })
    copyFileSync(fileURLToPath(new URL('./fixtures/workbench/python/database.py', import.meta.url)), join(studio.workspace.dir, 'scripts/database.py'))
    writeFileSync(join(studio.workspace.dir, 'scripts/context.py'), readFileSync(fileURLToPath(new URL('./fixtures/workbench/python/context.py', import.meta.url)), 'utf8').trimEnd())
    writeFileSync(join(studio.workspace.dir, 'scripts/database-notes.md'), '# Database\n\n```python\nclass Database:\n```\n')
  })
  test.afterAll(async () => { await studio?.close(); await model?.close() })

  test('classroom typing indents Python, saves, and keeps drafts and accessible file names across tabs', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await studio.open(page)
    await page.locator('.pmw-home__card').filter({ hasText: '分词入门' }).locator('.pmw-home__open').click()
    await page.locator('[data-activity="files"]').click()
    await openScript(page, 'scripts/database.py')
    await editor(page).click()
    await page.keyboard.press('Control+End')
    await page.keyboard.type('class Database:')
    await page.keyboard.press('Enter')
    await page.keyboard.type('def __init__(self):')
    await page.keyboard.press('Enter')
    await page.keyboard.type('self.rows = {}')
    await expect(editor(page).locator('.cm-line').nth(3)).toHaveText(/^ {4}def __init__\(self\):$/)
    await expect(editor(page).locator('.cm-line').nth(4)).toHaveText(/^ {8}self.rows = \{\}$/)
    await expect(editor(page).getByText('class', { exact: true })).toBeVisible()
    await expect(editor(page)).toHaveAttribute('aria-label', '源码：scripts/database.py')
    await page.keyboard.press('Tab')
    await expect(editor(page)).toBeFocused()
    await expect(editor(page).locator('.cm-line').nth(4)).toHaveText(/^ {12}self.rows = \{\}$/)
    await page.keyboard.press('Shift+Tab')
    await expect(editor(page).locator('.cm-line').nth(4)).toHaveText(/^ {8}self.rows = \{\}$/)
    await page.keyboard.press('Control+s')
    await expect(page.locator('.pmw-editor-group__tab:visible .pmw-source__dot')).toBeHidden()
    expect(readFileSync(join(studio.workspace.dir, 'scripts/database.py'), 'utf8')).toContain('class Database:\n    def __init__(self):\n        self.rows = {}')

    await editor(page).click()
    await page.keyboard.press('Control+End')
    await page.keyboard.type(' # keep this draft')
    await openScript(page, 'scripts/database-notes.md')
    await expect(editor(page)).toHaveAttribute('aria-label', '源码：scripts/database-notes.md')
    await editor(page).locator('.cm-line').filter({ hasText: 'class Database:' }).click()
    await page.keyboard.press('End')
    await page.keyboard.press('Enter')
    await page.keyboard.type('pass')
    await expect(editor(page).locator('.cm-line').nth(4)).toHaveText(/^ {2}pass$/)
    await page.getByRole('tab', { name: /^database\.py/ }).click()
    await expect(editor(page)).toHaveAttribute('aria-label', '源码：scripts/database.py')
    await expect(editor(page)).toContainText('keep this draft')
    await editor(page).click()
    await page.keyboard.press('Escape')
    await page.keyboard.press('Tab')
    await expect(editor(page)).not.toBeFocused()
    await page.screenshot({ path: test.info().outputPath('python-classroom-editor.png'), animations: 'disabled' })
  })

  test('a teacher creates a file in a new directory, types and saves it while keeping the lecture and another draft', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 900 })
    await studio.open(page)
    await page.locator('.pmw-home__card').filter({ hasText: '分词入门' }).locator('.pmw-home__open').click()
    await page.locator('[data-activity="files"]').click()
    await openScript(page, 'scripts/database.py')
    await editor(page).click()
    await page.keyboard.press('Control+End')
    await page.keyboard.type(' # draft from the previous file')
    await page.locator('[data-activity="files"]').click()
    await page.getByRole('button', { name: '新建文件', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: '新建文件', exact: true })
    await dialog.getByRole('textbox', { name: '工作区相对路径' }).fill('src/classroom/database.py')
    await dialog.getByRole('button', { name: '新建', exact: true }).click()
    await expect(dialog).toBeHidden()
    await expect(page.locator('.pmw-source__editor')).toHaveAttribute('data-path', 'src/classroom/database.py')
    await expect(editor(page)).toBeFocused()
    await page.keyboard.type('class Database:')
    await page.keyboard.press('Enter')
    await page.keyboard.type('pass')
    await page.keyboard.press('Control+s')
    await expect(page.locator('.pmw-editor-group__tab:visible:has([role="tab"][title])[data-active] .pmw-source__dot')).toBeHidden()
    const saved = readFileSync(join(studio.workspace.dir, 'src/classroom/database.py'), 'utf8')
    expect(saved).toBe('class Database:\n    pass')
    await page.locator('[data-activity="preview"]').click()
    await selectPreview(page)
    await expect(page.locator('.pmw-preview__frame')).toHaveAttribute('title', '分词入门 的预览')
    await page.getByRole('tab', { name: /^database\.py/ }).first().click()
    await expect(editor(page)).toContainText('draft from the previous file')
    await page.locator('[data-activity="files"]').click()
    await page.getByRole('button', { name: '新建文件', exact: true }).click()
    await dialog.getByRole('textbox', { name: '工作区相对路径' }).fill('src/classroom/database.py')
    await dialog.getByRole('button', { name: '新建', exact: true }).click()
    await expect(dialog.getByRole('alert')).toContainText('文件已存在')
    expect(readFileSync(join(studio.workspace.dir, 'src/classroom/database.py'), 'utf8')).toBe(saved)
    await page.screenshot({ path: test.info().outputPath('new-python-file.png'), animations: 'disabled' })
    await dialog.getByRole('button', { name: '取消', exact: true }).click()
  })

  test('selected workspace code and unsaved text reach the agent, then clearing and switching lectures remove the old context', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await studio.open(page)
    await page.locator('.pmw-home__card').filter({ hasText: '分词入门' }).locator('.pmw-home__open').click()
    await page.locator('[data-activity="files"]').click()
    await openScript(page, 'scripts/context.py')
    await expect(editor(page)).toBeVisible()
    await editor(page).click()
    await page.keyboard.press('Control+End')
    await page.keyboard.type(' # unsaved workspace selection')
    const beforeSelection = (await editor(page).boundingBox())!
    await editor(page).locator('.cm-line').filter({ hasText: 'self.rows = {}' }).click({ clickCount: 3 })
    await expect(page.locator('.pmw-focus:not([data-pending])')).toContainText('unsaved workspace selection')
    expect((await editor(page).boundingBox())!.y).toBe(beforeSelection.y)
    const focus = await (await page.request.get(`${studio.web.url}/api/presmium/focus?document=lectures%2Fintro`)).json()
    expect(focus).toMatchObject({ document: 'lectures/intro', focus: [{ scope: 'workspace', source: { file: 'scripts/context.py', startLine: 5, endLine: 5 }, quote: expect.stringContaining('unsaved workspace selection') }] })
    expect(focus.focus[0].excerpt).not.toContain('unsaved workspace selection')
    const texts = (value: unknown): string[] => typeof value === 'string' ? [value] : value && typeof value === 'object' ? Object.values(value).flatMap(texts) : []
    const context = (after: number) => model.received.slice(after).filter(request => Array.isArray(request.body.tools)).flatMap(request => texts(request.body.messages)).findLast(text => text.includes('<presmium-document>')) ?? ''
    const chat = page.locator('[data-pmw-slot="main:conversation"]')
    const send = async (text: string) => {
      if (!await chat.isVisible()) await page.locator('[data-activity="sessions"]').click()
      await chat.locator('[contenteditable="true"]').first().fill(text)
      await page.keyboard.press('Enter')
    }
    let before = model.received.length
    await send('解释选中的工作区代码')
    await expect.poll(() => context(before), { timeout: 60_000 }).toContain('"scope":"workspace"')
    expect(context(before)).toContain('"file":"scripts/context.py"')
    expect(context(before)).toContain('unsaved workspace selection')
    await expect(chat).toContainText('已看到工作区代码。')
    await page.getByRole('button', { name: '清除关注内容', exact: true }).click()
    await expect(page.locator('.pmw-focus')).toBeHidden()
    expect((await editor(page).boundingBox())!.y).toBe(beforeSelection.y)
    before = model.received.length
    await send('现在还有选区吗')
    await expect.poll(() => context(before), { timeout: 60_000 }).toContain('the author points at nothing')
    expect(context(before)).not.toContain('unsaved workspace selection')
    await expect(chat).toContainText('选区已清除。')
    await editor(page).click()
    await page.keyboard.press('Control+End')
    await page.keyboard.press('Shift+Home')
    await expect(page.locator('.pmw-focus:not([data-pending])')).toContainText('unsaved workspace selection')
    await page.getByRole('button', { name: '回到文档', exact: true }).click()
    await page.getByRole('dialog', { name: '保存未完成的修改？' }).getByRole('button', { name: '不保存', exact: true }).click()
    await page.locator('.pmw-home__card').filter({ hasText: 'Second lecture' }).locator('.pmw-home__open').click()
    await expect(page.locator('.pmw-focus')).toBeHidden()
    before = model.received.length
    await send('现在是哪份讲义')
    await expect.poll(() => context(before), { timeout: 60_000 }).toContain('Document "lectures/second"')
    expect(context(before)).not.toContain('unsaved workspace selection')
    await expect(chat).toContainText('现在是第二讲。')
  })
})
