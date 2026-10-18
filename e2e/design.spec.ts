import { execFileSync, spawn } from 'node:child_process'
import type { ChildProcess } from 'node:child_process'
import { cpSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, test } from '@playwright/test'
import { lowContrast } from './fixtures/contrast.ts'
import { openDevPage } from './fixtures/deck.ts'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const FIXTURE = join(ROOT, 'e2e/fixtures/design')
const PRESMIUM = join(ROOT, 'packages/cli/bin/presmium.mjs')
const PLUGIN = 'presmium-fixture-design-panes'

function clean(dir: string): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env }
  delete env.NODE_ENV
  for (const name of Object.keys(env)) {
    if (name.startsWith('PRESMIUM_') || /(?:_KEY|_TOKEN|_SECRET|_PASSWORD|_APPID)$/i.test(name)) delete env[name]
  }
  return { ...env, XDG_STATE_HOME: `${dir}.state`, XDG_CACHE_HOME: `${dir}.cache` }
}

async function serveWorkspace(): Promise<{ dir: string, child: ChildProcess, url: string }> {
  const work = join(ROOT, 'examples/demo/.presmium')
  mkdirSync(work, { recursive: true })
  const dir = mkdtempSync(join(work, 'e2e-design-'))
  cpSync(FIXTURE, dir, { recursive: true })
  cpSync(join(FIXTURE, 'plugins', PLUGIN), join(dir, 'node_modules', PLUGIN), { recursive: true })
  mkdirSync(join(dir, 'node_modules/@presmium'))
  symlinkSync(join(ROOT, 'packages/host'), join(dir, 'node_modules/@presmium/host'), 'dir')
  rmSync(join(dir, 'plugins'), { recursive: true, force: true })
  writeFileSync(join(dir, '.gitignore'), 'node_modules/\ndist/\n.presmium/\n')
  writeFileSync(join(dir, 'package.json'), `${JSON.stringify({ name: dir.split('/').at(-1)!.toLowerCase(), private: true, type: 'module' })}\n`)
  const git = (args: string[]) => execFileSync('git', ['-c', 'core.hooksPath=/dev/null', '-c', 'user.name=Test', '-c', 'user.email=test@example.com', '-c', 'commit.gpgSign=false', ...args], { cwd: dir })
  git(['init', '-q', '-b', 'main'])
  git(['add', '-A'])
  git(['commit', '-q', '-m', 'Initial commit'])
  const child = spawn(process.execPath, [PRESMIUM, 'serve', '--port', '0'], { cwd: dir, env: clean(dir), stdio: ['ignore', 'pipe', 'pipe'] })
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
  return { dir, child, url: `${url}/` }
}

test.describe('the design system and the workbench', () => {
  test.describe.configure({ mode: 'serial', timeout: 180_000 })
  let served: Awaited<ReturnType<typeof serveWorkspace>> | undefined
  let home: string

  test.beforeAll(async () => {
    test.setTimeout(300_000)
    served = await serveWorkspace()
    home = served.url
  })

  test.afterAll(async () => {
    const child = served?.child
    if (child && child.exitCode === null && child.signalCode === null) {
      const exited = new Promise(done => child.once('exit', done))
      child.kill('SIGTERM')
      await exited
    }
    for (const path of ['', '.state', '.cache']) if (served) rmSync(`${served.dir}${path}`, { recursive: true, force: true })
  })

  test('the home page is the workbench of the design, with the fonts that come with Presmium, in light and dark', async ({ page }) => {
    const fonts: string[] = []
    page.on('request', (request) => {
      if (request.resourceType() === 'font' || /fonts\.(googleapis|gstatic)/.test(request.url())) fonts.push(request.url())
    })
    await openDevPage(page, home, page.locator('.pm-site-home__document[data-document="notes"]'))
    const activity = page.getByRole('navigation', { name: '活动' })
    await expect(activity.getByRole('button', { name: '文档' })).toHaveAttribute('aria-pressed', 'true')
    for (const name of ['搜索', '修改历史', '使用说明']) await expect(activity.getByRole('button', { name })).toBeVisible()
    await expect(page.getByRole('complementary', { name: '工作区文件' })).toContainText(/notes\/.*essay\/.*presmium\.workspace\.yaml|essay\/.*notes\/.*presmium\.workspace\.yaml/s)
    await expect(page.getByRole('contentinfo', { name: '状态栏' }).locator('.pm-workspace-git')).toHaveText(/^(git|main)\b/)
    await expect(page.locator('.fixture-pane[data-slot="status"]')).toBeVisible()
    await expect(page.locator('.pm-workspace-documents__new')).toHaveText('新建文档')

    const notes = page.locator('.pm-site-home__document[data-document="notes"]')
    expect(await notes.locator('.pm-site-home__link').evaluate(el => getComputedStyle(el).fontFamily)).toMatch(/^"Source Serif 4"/)
    await expect(notes).toContainText('notes/')
    await page.keyboard.press('Control+k')
    await expect(page.getByRole('combobox', { name: '搜索文档、章节与命令' })).toBeFocused()
    await page.keyboard.type('随笔')
    await expect(page.getByRole('listbox', { name: '搜索结果' }).getByRole('group', { name: '文档' }).getByRole('option')).toHaveText([/^课后随笔/])
    await expect(page.locator('.pm-site-home__document')).toHaveCount(2)
    await page.keyboard.press('Control+a')
    await page.keyboard.press('Backspace')

    expect(await page.evaluate(async () => {
      await document.fonts.ready
      return ['400 14px "IBM Plex Sans"', '600 20px "Source Serif 4"', '400 13px "IBM Plex Mono"'].map(font => document.fonts.check(font))
    })).toEqual([true, true, true])
    expect(fonts.length).toBeGreaterThan(0)
    expect(fonts.filter(url => !url.startsWith(new URL(home).origin))).toEqual([])

    const background = () => page.evaluate(() => getComputedStyle(document.body).backgroundColor)
    const light = await background()
    await page.getByRole('button', { name: '切换到深色模式' }).click()
    await expect(page.locator('html')).toHaveClass(/\bdark\b/)
    expect(await page.locator('.pm-workbench').evaluate(el => getComputedStyle(el).backgroundColor)).toBe('rgb(22, 22, 20)')
    expect(await background()).not.toBe(light)
    await page.reload()
    await expect(page.locator('html')).toHaveClass(/\bdark\b/)
    await page.getByRole('button', { name: '切换到浅色模式' }).click()
    await expect(page.locator('html')).not.toHaveClass(/\bdark\b/)
    expect(await page.locator('.pm-workbench').evaluate(el => getComputedStyle(el).backgroundColor)).toBe('rgb(247, 245, 240)')
  })

  test('the home page has one heading and a link past its bars; the launcher finds documents, their sections and commands', async ({ page }) => {
    await openDevPage(page, home, page.locator('.pm-site-home__document[data-document="notes"]'))
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('设计验收工作区')
    await page.keyboard.press('Tab')
    const skip = page.getByRole('link', { name: '跳到内容' })
    await expect(skip).toBeFocused()
    await expect(skip).toBeInViewport()
    await page.keyboard.press('Enter')
    await expect(page.locator('#pm-workbench-content')).toBeFocused()

    const search = page.getByRole('combobox', { name: '搜索文档、章节与命令' })
    const results = page.getByRole('listbox', { name: '搜索结果' })
    await search.fill('新建')
    await expect(results.getByRole('group', { name: '命令' }).getByRole('option')).toHaveText(['新建文档'])
    await search.press('Enter')
    const documents = page.getByRole('dialog', { name: '管理文档' })
    await expect(documents).toBeVisible()
    await documents.getByRole('button', { name: '关闭' }).click()
    await search.fill('明暗')
    await search.press('Enter')
    await expect(page.locator('html')).toHaveClass(/\bdark\b/)
    await search.fill('明暗')
    await search.press('Enter')
    await expect(page.locator('html')).not.toHaveClass(/\bdark\b/)

    await search.fill('随笔')
    await expect(results.getByRole('group', { name: '文档' }).getByRole('option')).toContainText(['课后随笔'])
    await search.fill('BPE 怎样')
    const section = results.getByRole('group', { name: '章节' }).getByRole('option')
    await expect(section).toContainText(['BPE 怎样得到词元'], { timeout: 60_000 })
    await expect(page.locator('.pm-site-home__document')).toHaveCount(2)
    await search.press('ArrowDown')
    await expect(section.first()).toHaveAttribute('aria-selected', 'true')
    await search.press('Enter')
    await page.waitForURL(/\/notes\/#bpe$/)
    await expect(page.locator('.pm-section[data-section="bpe"]')).toBeVisible()
  })

  test('with an assistant that may draft, the dashed card beside the documents opens the dialog at the request', async ({ page }) => {
    await openDevPage(page, home, page.locator('.pm-site-home__document[data-document="notes"]'))
    const card = page.locator('.pm-site-home__grid .pm-workspace-draft-card')
    await expect(card).toContainText('由 AI 起草一份文档')
    expect(await card.evaluate(el => getComputedStyle(el).borderTopStyle)).toBe('dashed')
    await card.click()
    const documents = page.getByRole('dialog', { name: '管理文档' })
    await expect(documents.locator('input[name="draft"]')).toBeChecked()
    await expect(documents.locator('.pm-workspace-create__draft')).toContainText('本地替身')
    await expect(documents.getByRole('textbox', { name: '起草的要求' })).toBeFocused()
    await documents.getByRole('button', { name: '关闭' }).click()
    await expect(documents).toHaveCount(0)
  })

  test('the history names an undo and its redo (F-55); the usage guide names its topics and the MCP address (P-120)', async ({ page }) => {
    page.on('dialog', dialog => void dialog.accept())
    await openDevPage(page, home, page.locator('.pm-site-home__document[data-document="notes"]'))
    await page.locator('.pm-workspace-documents__toggle').click()
    const documents = page.getByRole('dialog', { name: '管理文档' })
    const notes = documents.locator('.pm-workspace-document[data-document="notes"]')
    await notes.locator('input[name="to"]').fill('notes-copy')
    await notes.getByRole('button', { name: '复制' }).click()
    const copy = documents.locator('.pm-workspace-document[data-document="notes-copy"]')
    await copy.getByRole('button', { name: '删除' }).click()
    await expect(copy).toHaveCount(0)
    await documents.getByRole('button', { name: '关闭' }).click()
    await expect(documents).toHaveCount(0)

    await page.getByRole('navigation', { name: '活动' }).getByRole('button', { name: '修改历史' }).click()
    const history = page.getByRole('dialog', { name: '修改历史' })
    const revisions = history.locator('.pm-workspace-revision')
    await revisions.first().getByRole('button', { name: '撤销' }).click()
    await expect(revisions.first()).toHaveAttribute('data-undo', 'undo')
    await expect(page.locator('.pm-site-home__document[data-document="notes-copy"]')).toBeVisible()
    await revisions.first().getByRole('button', { name: '重做' }).click()
    await expect(revisions.locator('.pm-workspace-revision__summary')).toHaveText([
      '重做「删除文档 notes-copy」',
      '撤销「删除文档 notes-copy」',
      '删除文档 notes-copy',
      '复制文档 notes 为 notes-copy',
    ])
    await expect(revisions.nth(0).getByRole('button', { name: '撤销' })).toBeVisible()
    await expect(revisions.nth(1).locator('.pm-workspace-revision__reverted')).toHaveText('已重做')
    await expect(revisions.nth(2).locator('.pm-workspace-revision__reverted')).toHaveText('已撤销')
    await expect(revisions.nth(0).locator('.pm-workspace-revision__origin')).toHaveText('文档')
    await expect(page.locator('.pm-site-home__document[data-document="notes-copy"]')).toHaveCount(0)
    await expect(page.locator('.pm-workspace-recent li').first()).toContainText('重做「删除文档 notes-copy」')
    await page.keyboard.press('Escape')
    await expect(history).toHaveCount(0)

    await page.getByRole('navigation', { name: '活动' }).getByRole('button', { name: '使用说明' }).click()
    const guide = page.getByRole('dialog', { name: '使用说明' })
    await expect(guide.getByRole('heading', { level: 3 })).toHaveText(['管理文档', '编辑模式', 'AI 修改', '模型设置', '修改历史', '连接外部 agent（MCP）'])
    await expect(guide).toContainText(`${new URL(home).origin}/mcp`)
  })

  test('edit mode is an application filling the window: its top bar, the source editor, the preview, the dock and the status bar', async ({ page }) => {
    await openDevPage(page, `${home}notes/`, page.locator('.pm-workspace-edit').filter({ visible: true }))
    const edit = page.locator('.pm-workspace-edit').filter({ visible: true })
    await expect(page.locator('.pm-edit-status')).toHaveCount(0)
    await edit.click()
    await expect(edit).toHaveAttribute('aria-pressed', 'true')
    await expect(edit).toHaveText('退出编辑')
    expect(await page.evaluate(() => ['pm-editing', 'pm-edit-split', 'pm-edit-docked'].map(name => document.documentElement.classList.contains(name)))).toEqual([true, true, true])

    const bar = page.getByRole('banner', { name: '编辑' })
    const trail = bar.getByRole('navigation', { name: '位置' })
    await expect(trail.getByRole('link', { name: '设计验收工作区' })).toBeVisible()
    await expect(trail.locator('[aria-current="page"]')).toHaveText('分词笔记')
    await expect(page.locator('.VPNav')).toBeHidden()
    await expect(bar.getByRole('tablist', { name: '打开的文件' }).getByRole('tab', { name: /^lecture\.md/ })).toHaveAttribute('aria-selected', 'true')
    const views = bar.getByRole('group', { name: '预览视图' })
    await expect(views.getByRole('button', { name: '文档' })).toHaveAttribute('aria-pressed', 'true')
    await expect(bar.locator('.pm-workspace-history__toggle')).toBeVisible()
    await expect(page.getByRole('region', { name: '源码' }).getByRole('textbox', { name: '源码' })).toContainText('title: 分词笔记')
    await expect(page.getByRole('complementary', { name: '编辑面板' }).locator('.fixture-pane[data-slot="dock"]')).toBeVisible()
    const status = page.getByRole('contentinfo', { name: '状态栏' })
    await expect(status.locator('.pm-workspace-git')).toHaveText(/^(git|main)\b/)
    await expect(status.locator('.pm-workspace-cursor')).toHaveText(/^MyST · UTF-8 · 第 \d+ 行$/)
    await expect(status.locator('.fixture-pane[data-slot="status"]')).toBeVisible()
    const viewport = page.viewportSize()!
    const [top, source, content, dock, foot] = await Promise.all([bar, page.locator('.pm-edit-source'), page.locator('.VPDoc'), page.locator('.pm-edit-dock'), status].map(async pane => (await pane.boundingBox())!))
    expect([top!.x, top!.y, top!.width]).toEqual([0, 0, viewport.width])
    expect(foot!.y + foot!.height).toBeCloseTo(viewport.height, 0)
    expect(source!.y).toBeCloseTo(top!.height, 0)
    expect(source!.y + source!.height).toBeCloseTo(foot!.y, 0)
    expect(content!.x).toBeGreaterThanOrEqual(source!.x + source!.width)
    expect(content!.x + content!.width).toBeLessThanOrEqual(dock!.x + 1)
    await expect(page.locator('.VPDocFooter')).toBeHidden()
    await views.getByRole('button', { name: '放映' }).click()
    await expect(views.getByRole('button', { name: '放映' })).toHaveAttribute('aria-pressed', 'true')
    const present = (await page.locator('.pm-present').boundingBox())!
    expect(present.x).toBeCloseTo(source!.x + source!.width, 0)
    expect(present.x + present.width).toBeCloseTo(dock!.x, 0)
    await views.getByRole('button', { name: '文档' }).click()
    await expect(page.locator('.pm-present')).toHaveCount(0)

    const pane = page.getByRole('complementary', { name: '编辑面板' })
    const tabs = pane.getByRole('tablist', { name: 'AI 修改' })
    await tabs.getByRole('tab', { name: '对话' }).click()
    await page.keyboard.press('ArrowRight')
    const diff = tabs.getByRole('tab', { name: '差异' })
    await expect(diff).toBeFocused()
    await expect(diff).toHaveAttribute('aria-selected', 'true')
    const panel = page.getByRole('tabpanel', { name: '差异' })
    await expect(panel).toHaveText('fixture diff')
    expect(await diff.getAttribute('aria-controls')).toBe(await panel.getAttribute('id'))
    await page.keyboard.press('ArrowLeft')
    await page.keyboard.press('ArrowLeft')
    await expect(tabs.getByRole('tab', { name: '记录' })).toBeFocused()
    await expect(page.getByRole('tabpanel', { name: '记录' })).toHaveText('fixture log')
    const more = pane.getByRole('button', { name: '面板操作' })
    await more.click()
    const menu = pane.getByRole('menu', { name: '面板操作' })
    await expect(menu.getByRole('menuitem', { name: '格式化' })).toBeFocused()
    await page.keyboard.press('ArrowUp')
    await expect(menu.getByRole('menuitem', { name: '关闭面板' })).toBeFocused()
    await page.keyboard.press('Escape')
    await expect(menu).toHaveCount(0)
    await expect(more).toBeFocused()
    await page.keyboard.press('Enter')
    await page.keyboard.press('ArrowDown')
    await expect(menu.getByRole('menuitem', { name: '自动换行' })).toBeFocused()
    await page.keyboard.press('Enter')
    await expect(menu).toHaveCount(0)
    await expect(pane.locator('.fixture-chosen')).toHaveText('wrap')
    await expect(more).toBeFocused()
    const segments = pane.getByRole('group', { name: '面板视图' })
    await segments.getByRole('button', { name: '放映' }).click()
    await expect(segments.getByRole('button', { name: '放映' })).toHaveAttribute('aria-pressed', 'true')
    await expect(segments.getByRole('button', { name: '文档' })).toHaveAttribute('aria-pressed', 'false')

    await edit.click()
    await expect(page.locator('.pm-edit-status')).toHaveCount(0)
    await expect(page.locator('.VPNav')).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.className)).not.toMatch(/pm-edit/)
  })

  test('on a tablet and a phone, where the side bar gives way, the activity bar opens the file tree in a drawer', async ({ page }) => {
    const activity = page.getByRole('navigation', { name: '活动' })
    const drawer = page.getByRole('dialog', { name: '工作区文件' })
    for (const [width, height] of [[900, 1000], [390, 844]] as const) {
      await page.setViewportSize({ width, height })
      await openDevPage(page, home, page.locator('.pm-site-home__document[data-document="notes"]'))
      await expect(page.getByRole('complementary', { name: '工作区文件' })).toHaveCount(0)
      await activity.getByRole('button', { name: '工作区文件' }).click()
      await expect(drawer.getByRole('navigation', { name: '文件' }).locator('[data-document="notes"]')).toBeVisible()
      const [bar, box] = await Promise.all([activity.boundingBox(), drawer.boundingBox()])
      if (width < 768) expect(box!.y).toBeGreaterThanOrEqual(bar!.y + bar!.height - 1)
      else expect(box!.x).toBeGreaterThanOrEqual(bar!.x + bar!.width - 1)
      expect(box!.x + box!.width).toBeLessThanOrEqual(width + 0.5)
      await page.keyboard.press('Escape')
      await expect(drawer).toHaveCount(0)
    }
    await activity.getByRole('button', { name: '工作区文件' }).click()
    await drawer.locator('[data-path="presmium.workspace.yaml"]').click()
    await expect(drawer).toHaveCount(0)
    await expect(page.locator('.pm-workbench__source').getByRole('textbox', { name: '源码' })).toContainText('title: 设计验收工作区')
  })

  test('on a phone the drawers open below the activity bar, a popover of the navigation screen stays on the screen, and edit mode stacks its bar and panes round the preview', async ({ page }) => {
    page.on('dialog', dialog => void dialog.accept())
    await page.setViewportSize({ width: 390, height: 844 })
    await openDevPage(page, home, page.locator('.pm-site-home__document[data-document="notes"]'))
    const activity = page.getByRole('navigation', { name: '活动' })
    await activity.getByRole('button', { name: '使用说明' }).click()
    const guide = page.getByRole('dialog', { name: '使用说明' })
    const [bar, drawer] = await Promise.all([activity.boundingBox(), guide.boundingBox()])
    expect(drawer!.y).toBeGreaterThanOrEqual(bar!.y + bar!.height - 1)
    await activity.getByRole('button', { name: '修改历史' }).click()
    await expect(page.getByRole('dialog', { name: '修改历史' })).toBeVisible()
    await expect(guide).toHaveCount(0)
    await page.keyboard.press('Escape')

    await page.locator('.pm-workspace-documents__toggle').click()
    const documents = page.getByRole('dialog', { name: '管理文档' })
    const notes = documents.locator('.pm-workspace-document[data-document="notes"]')
    await notes.locator('input[name="to"]').fill('notes-on-a-phone')
    await notes.getByRole('button', { name: '复制' }).click()
    await expect(documents.locator('.pm-workspace-document[data-document="notes-on-a-phone"]')).toBeVisible()

    await openDevPage(page, `${home}notes-on-a-phone/`, page.locator('.pm-section').first())
    await page.locator('.VPNavBarHamburger').click()
    const screen = page.locator('.pm-toolbar--screen')
    await screen.locator('.pm-workspace-history__toggle').click()
    const history = page.getByRole('dialog', { name: '修改历史' })
    await expect(history.locator('.pm-workspace-revision__summary')).toHaveText('复制文档 notes 为 notes-on-a-phone')
    await expect.poll(async () => {
      const box = (await history.boundingBox())!
      return box.x >= 16 && box.x + box.width <= 390 - 16 + 0.5
    }, { message: 'the history is 1 rem inside the screen' }).toBe(true)
    await page.keyboard.press('Escape')
    await expect(history).toHaveCount(0)

    await screen.locator('.pm-workspace-edit').click()
    const [top, source, content, dock] = await Promise.all([
      page.getByRole('banner', { name: '编辑' }),
      page.getByRole('region', { name: '源码' }),
      page.locator('.VPDoc'),
      page.getByRole('complementary', { name: '编辑面板' }),
    ].map(async (pane) => {
      await expect(pane).toBeVisible()
      return (await pane.boundingBox())!
    }))
    for (const box of [top!, source!, content!, dock!]) expect([box.x, box.width]).toEqual([0, 390])
    expect(top!.y + top!.height).toBeLessThanOrEqual(source!.y + 1)
    expect(source!.y + source!.height).toBeLessThanOrEqual(content!.y + 1)
    expect(content!.y + content!.height).toBeLessThanOrEqual(dock!.y + 1)
    await expect(page.locator('.VPNavScreen')).toHaveCount(0)
    expect(await page.evaluate(() => getComputedStyle(document.body).overflow)).not.toBe('hidden')
  })

  for (const colorScheme of ['light', 'dark'] as const) {
    test(`every text reaches WCAG AA (${colorScheme}): the home page, its history, dialog and guide, a document's page and edit mode`, async ({ page }) => {
      await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' })
      await openDevPage(page, home, page.locator('.pm-site-home__document[data-document="notes"]'))
      await expect(page.locator('.pm-workspace-recent')).toBeVisible()
      expect(await page.evaluate(() => document.documentElement.classList.contains('dark'))).toBe(colorScheme === 'dark')
      await page.evaluate(() => document.querySelector('.pm-site-home')!.insertAdjacentHTML('beforeend', '<div id="faint"><p style="color: rgb(128 128 128 / 0.3)">faint probe</p><input id="faint-field" class="pm-ui-input" aria-label="faint" style="border-color: rgb(128 128 128 / 0.3)"></div>'))
      expect(await lowContrast(page)).toEqual([expect.stringMatching(/^faint probe /), expect.stringMatching(/^border of faint-field: /)])
      await page.evaluate(() => document.getElementById('faint')!.remove())
      expect(await lowContrast(page)).toEqual([])
      await page.locator('.pm-workspace-history__toggle').click()
      await expect(page.locator('.pm-workspace-revision').first()).toBeVisible()
      expect(await lowContrast(page)).toEqual([])
      await page.keyboard.press('Escape')
      await page.locator('.pm-workspace-documents__toggle').click()
      await expect(page.locator('.pm-workspace-document').first()).toBeVisible()
      expect(await lowContrast(page)).toEqual([])
      await page.keyboard.press('Escape')
      await page.locator('.pm-workspace-guide__toggle').click()
      expect(await lowContrast(page)).toEqual([])
      await page.keyboard.press('Escape')
      await page.getByRole('navigation', { name: '文件' }).locator('[data-document="notes"]').click()
      await page.getByRole('combobox', { name: '搜索文档、章节与命令' }).fill('文档')
      await expect(page.getByRole('listbox', { name: '搜索结果' }).getByRole('option').first()).toBeVisible()
      expect(await lowContrast(page)).toEqual([])

      await openDevPage(page, `${home}notes/`, page.locator('.pm-workspace-edit').filter({ visible: true }))
      expect(await lowContrast(page)).toEqual([])
      await page.locator('.pm-workspace-edit').filter({ visible: true }).click()
      await expect(page.locator('.pm-edit-status')).toBeVisible()
      await expect(page.getByRole('region', { name: '源码' }).getByRole('textbox', { name: '源码' })).toContainText('title: 分词笔记')
      await page.locator('.pm-section[data-section] .pm-block--markdown').first().click()
      await expect(page.locator('.cm-line.pm-cm-picked').first()).toBeVisible()
      expect(await lowContrast(page)).toEqual([])
    })
  }
})
