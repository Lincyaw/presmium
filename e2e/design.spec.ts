// The design system and the workbench (N-10, WP-95b; docs/architecture.md 5.10, docs/design/): `presmium serve`
// of a workspace (e2e/fixtures/design) on this machine. Its home page is the workbench: the activity bar, the
// workspace's files, the launcher with its search and the documents as cards in the serif of the design, and the
// status bar; the fonts come with Presmium, and the dark scheme switches every token. The history names an undo and
// its redo (F-55); the usage guide names its topics (P-120). On a document's page edit mode shows its status bar and
// the panes a plugin puts in its split (a test plugin fills them). Every text reaches WCAG AA in light and dark: the
// home page, its history, its document dialog and guide, a document's page and edit mode.
import { execFileSync, spawn } from 'node:child_process'
import type { ChildProcess } from 'node:child_process'
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { openDevPage } from './fixtures/deck.ts'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const FIXTURE = join(ROOT, 'e2e/fixtures/design')
const PRESMIUM = join(ROOT, 'packages/cli/bin/presmium.mjs')
const PLUGIN = 'presmium-fixture-design-panes'

/** The environment of the test without credentials or Presmium's variables. */
function clean(dir: string): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env }
  delete env.NODE_ENV
  for (const name of Object.keys(env)) {
    if (name.startsWith('PRESMIUM_') || /(?:_KEY|_TOKEN|_SECRET|_PASSWORD|_APPID)$/i.test(name)) delete env[name]
  }
  return { ...env, XDG_STATE_HOME: `${dir}.state`, XDG_CACHE_HOME: `${dir}.cache` }
}

/** The fixture as a workspace of its own (a git repository, its operator plugin installed), served on this machine. */
async function serveWorkspace(): Promise<{ dir: string, child: ChildProcess, url: string }> {
  const work = join(ROOT, 'examples/demo/.presmium')
  mkdirSync(work, { recursive: true })
  const dir = mkdtempSync(join(work, 'e2e-design-'))
  cpSync(FIXTURE, dir, { recursive: true })
  cpSync(join(FIXTURE, 'plugins', PLUGIN), join(dir, 'node_modules', PLUGIN), { recursive: true })
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

/**
 * The texts of the page under `scope` whose contrast with what is behind them is below WCAG AA: 4.5:1, or 3:1 for
 * large text (24 px, or 18.66 px bold). The background is every ancestor's background colour composited, the text's
 * colour with the opacity of its ancestors; disabled controls are left out, as WCAG does.
 */
function lowContrast(page: Page, scope = 'body'): Promise<string[]> {
  return page.evaluate((selector) => {
    const parse = (value: string): number[] => {
      const srgb = /^color\(srgb ([\d.e-]+) ([\d.e-]+) ([\d.e-]+)(?: \/ ([\d.e-]+))?\)$/.exec(value)
      if (srgb) return [Number(srgb[1]) * 255, Number(srgb[2]) * 255, Number(srgb[3]) * 255, srgb[4] === undefined ? 1 : Number(srgb[4])]
      const parts = (/rgba?\(([^)]+)\)/.exec(value)?.[1] ?? '0 0 0 0').split(/[\s,/]+/).filter(Boolean).map(Number)
      return [parts[0]!, parts[1]!, parts[2]!, parts[3] ?? 1]
    }
    const over = (top: number[], below: number[]) => [0, 1, 2].map(i => top[i]! * top[3]! + below[i]! * (1 - top[3]!)).concat(1)
    const luminance = (c: number[]) => {
      const [r, g, b] = c.slice(0, 3).map((v) => {
        const s = v / 255
        return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
      })
      return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!
    }
    const ratio = (a: number[], b: number[]) => {
      const [high, low] = [luminance(a), luminance(b)].sort((x, y) => y - x)
      return (high! + 0.05) / (low! + 0.05)
    }
    const failures: string[] = []
    for (const element of document.querySelectorAll<HTMLElement>(`${selector}, ${selector} *`)) {
      const text = [...element.childNodes].filter(node => node.nodeType === Node.TEXT_NODE).map(node => node.textContent ?? '').join('').trim()
      if (!text || element.closest('[aria-hidden="true"], :disabled, [aria-disabled="true"]')) continue
      if (!element.checkVisibility({ opacityProperty: true, visibilityProperty: true })) continue
      const box = element.getBoundingClientRect()
      if (box.width <= 1 || box.height <= 1) continue
      const style = getComputedStyle(element)
      let background = [255, 255, 255, 1]
      let opacity = 1
      const layers: number[][] = []
      for (let at: Element | null = element; at; at = at.parentElement) {
        const own = getComputedStyle(at)
        opacity *= Number(own.opacity)
        layers.push(parse(own.backgroundColor))
      }
      for (const layer of layers.reverse()) background = over(layer, background)
      const color = parse(style.color)
      const shown = over([color[0]!, color[1]!, color[2]!, color[3]! * opacity], background)
      const size = Number.parseFloat(style.fontSize)
      const large = size >= 24 || (size >= 18.66 && Number(style.fontWeight) >= 700)
      const value = ratio(shown, background)
      if (value < (large ? 3 : 4.5)) failures.push(`${text.slice(0, 40)} (${element.className || element.tagName}: ${value.toFixed(2)})`)
    }
    return failures
  }, scope)
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
    await expect(page.getByRole('contentinfo', { name: '状态栏' })).toContainText('git')
    await expect(page.locator('.fixture-pane[data-slot="status"]')).toBeVisible()
    await expect(page.locator('.pm-workspace-documents__new')).toHaveText('新建文档')

    // The cards: a serif title, the directory; the search (Ctrl K) filters them.
    const notes = page.locator('.pm-site-home__document[data-document="notes"]')
    expect(await notes.locator('.pm-site-home__link').evaluate(el => getComputedStyle(el).fontFamily)).toMatch(/^"Source Serif 4"/)
    await expect(notes).toContainText('notes/')
    await page.keyboard.press('Control+k')
    await expect(page.getByRole('searchbox', { name: '搜索文档' })).toBeFocused()
    await page.keyboard.type('随笔')
    await expect(page.locator('.pm-site-home__document')).toHaveCount(1)
    await expect(page.locator('.pm-site-home__document')).toHaveAttribute('data-document', 'essay')
    await page.keyboard.press('Control+a')
    await page.keyboard.press('Backspace')
    await expect(page.locator('.pm-site-home__document')).toHaveCount(2)

    // The Latin faces are Presmium's own files, from this server; none from the network (N-03).
    expect(await page.evaluate(async () => {
      await document.fonts.ready
      return ['400 14px "IBM Plex Sans"', '600 20px "Source Serif 4"', '400 13px "IBM Plex Mono"'].map(font => document.fonts.check(font))
    })).toEqual([true, true, true])
    expect(fonts.length).toBeGreaterThan(0)
    expect(fonts.filter(url => !url.startsWith(new URL(home).origin))).toEqual([])

    // The dark scheme: the tokens switch, and the switch is remembered.
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
    // The undo's button redoes the change; the redo is undone in turn.
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
    // The latest changes on the home page, tagged by origin.
    await expect(page.locator('.pm-workspace-recent li').first()).toContainText('重做「删除文档 notes-copy」')
    await page.keyboard.press('Escape')
    await expect(history).toHaveCount(0)

    await page.getByRole('navigation', { name: '活动' }).getByRole('button', { name: '使用说明' }).click()
    const guide = page.getByRole('dialog', { name: '使用说明' })
    await expect(guide.getByRole('heading', { level: 3 })).toHaveText(['管理文档', '编辑模式', 'AI 修改', '模型设置', '修改历史', '连接外部 agent（MCP）'])
    await expect(guide).toContainText(`${new URL(home).origin}/mcp`)
  })

  test('edit mode shows its status bar, and the panes a plugin puts in its split', async ({ page }) => {
    await openDevPage(page, `${home}notes/`, page.locator('.pm-workspace-edit').filter({ visible: true }))
    const edit = page.locator('.pm-workspace-edit').filter({ visible: true })
    await expect(page.locator('.pm-edit-status')).toHaveCount(0)
    await edit.click()
    await expect(edit).toHaveAttribute('aria-pressed', 'true')
    await expect(edit).toHaveText('退出编辑')
    expect(await page.evaluate(() => ['pm-editing', 'pm-edit-split', 'pm-edit-docked'].map(name => document.documentElement.classList.contains(name)))).toEqual([true, true, true])
    await expect(page.getByRole('region', { name: '源码' }).locator('.fixture-pane[data-slot="source"]')).toBeVisible()
    await expect(page.getByRole('complementary', { name: '编辑面板' }).locator('.fixture-pane[data-slot="dock"]')).toBeVisible()
    const status = page.getByRole('contentinfo', { name: '状态栏' })
    await expect(status).toContainText('git')
    await expect(status.locator('.fixture-pane[data-slot="status"]')).toBeVisible()
    // The page is the preview between the panes.
    const [source, content, dock] = await Promise.all(['.pm-edit-source', '.VPDoc', '.pm-edit-dock'].map(selector => page.locator(selector).boundingBox()))
    expect(content!.x).toBeGreaterThanOrEqual(source!.x + source!.width)
    expect(content!.x + content!.width).toBeLessThanOrEqual(dock!.x + 1)
    await edit.click()
    await expect(page.locator('.pm-edit-status')).toHaveCount(0)
    expect(await page.evaluate(() => document.documentElement.className)).not.toMatch(/pm-edit/)
  })

  for (const colorScheme of ['light', 'dark'] as const) {
    test(`every text reaches WCAG AA (${colorScheme}): the home page, its history, dialog and guide, a document's page and edit mode`, async ({ page }) => {
      // The final colours, without the controls' transitions (the tokens' durations are 0 then).
      await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' })
      await openDevPage(page, home, page.locator('.pm-site-home__document[data-document="notes"]'))
      await expect(page.locator('.pm-workspace-recent')).toBeVisible()
      expect(await page.evaluate(() => document.documentElement.classList.contains('dark'))).toBe(colorScheme === 'dark')
      // The check finds a faint text, put on the page for a moment.
      await page.evaluate(() => document.querySelector('.pm-site-home')!.insertAdjacentHTML('beforeend', '<p id="faint" style="color: rgb(128 128 128 / 0.3)">faint probe</p>'))
      expect(await lowContrast(page)).toEqual([expect.stringMatching(/^faint probe /)])
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

      await openDevPage(page, `${home}notes/`, page.locator('.pm-workspace-edit').filter({ visible: true }))
      expect(await lowContrast(page)).toEqual([])
      await page.locator('.pm-workspace-edit').filter({ visible: true }).click()
      await expect(page.locator('.pm-edit-status')).toBeVisible()
      expect(await lowContrast(page)).toEqual([])
    })
  }
})
