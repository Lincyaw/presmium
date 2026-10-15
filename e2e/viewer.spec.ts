import { spawn } from 'node:child_process'
import type { ChildProcess } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { WEB } from './urls.ts'

// The IR runtime (@presmium/viewer) in the built web form on WEB, and in `presmium dev`.
// Sections of the demo: the cover, core (pages/core.md), web and scrolly (pages/web.md).

const menu = (page: Page) => page.getByRole('combobox', { name: '视图' })

/** Waits until the page view has scrolled to the position kept across a view switch. */
async function settled(page: Page) {
  await expect(page.locator('.pm-view-host')).not.toHaveAttribute('aria-busy', 'true')
}

async function selectView(page: Page, view: string) {
  await menu(page).selectOption(view)
  if (view !== 'present') await settled(page)
}

/** Scrolls the narration of a step of a scrolly section to the middle of the screen. */
async function scrollToStep(page: Page, section: string, step: number) {
  const target = page.locator(`.pm-section[data-section="${section}"]`)
  await expect(async () => {
    await target.locator(`.pm-step[data-step="${step}"]`).evaluate(el => el.scrollIntoView({ block: 'center' }))
    await expect(target).toHaveAttribute('data-step', String(step), { timeout: 500 })
  }).toPass()
}

test('switching between the document, scrolly and present views keeps the section and the step', async ({ page }) => {
  await page.goto(`${WEB}/web.html`)
  await scrollToStep(page, 'scrolly', 2)

  await selectView(page, 'present')
  const present = page.getByRole('region', { name: '放映' })
  await expect(present).toHaveAttribute('data-section', 'scrolly')
  await expect(present).toHaveAttribute('data-step', '2')
  await expect(present.locator('li', { hasText: '发布' })).toBeVisible()

  // Leaving the present view goes back to the page view it came from, at the same place.
  await page.keyboard.press('Escape')
  await expect(present).toHaveCount(0)
  await expect(menu(page)).toHaveValue('document')
  await settled(page)
  const scrolly = page.locator('.pm-section[data-section="scrolly"]')
  await expect(scrolly).toHaveAttribute('data-step', '2')
  await expect(scrolly.locator('.pm-step[data-step="2"]')).toBeInViewport()

  // The scrolly view lays out every section that way; the position stays.
  await selectView(page, 'scrolly')
  await expect(page.locator('.pm-section[data-section="web"]')).toHaveClass(/pm-section--scrolly/)
  await expect(scrolly).toHaveAttribute('data-step', '2')
  await expect(scrolly.locator('.pm-step[data-step="2"]')).toBeInViewport()
  await scrollToStep(page, 'scrolly', 3)
  await selectView(page, 'present')
  await expect(present).toHaveAttribute('data-step', '3')

  // A section on another page: leaving the present view goes to its page, still in the scrolly view.
  await page.keyboard.press('Home')
  await expect(present).toHaveAttribute('data-section', 'presmium-demo')
  await page.keyboard.press('ArrowRight')
  await expect(present).toHaveAttribute('data-section', 'core')
  await page.getByRole('button', { name: '退出放映' }).click()
  await expect(page).toHaveURL(/\/core\.html/)
  await expect(menu(page)).toHaveValue('scrolly')
  await settled(page)
  await expect(page.locator('h2#core')).toBeInViewport()
})

test('the present view pages with the keyboard; the presenter window follows with the narration of the step', async ({ page }) => {
  // `?view=` opens a view at the page's own section.
  await page.goto(`${WEB}/web.html?view=present`)
  const present = page.getByRole('region', { name: '放映' })
  await expect(present).toHaveAttribute('data-section', 'web')
  await page.keyboard.press('ArrowRight')
  await expect(present).toHaveAttribute('data-section', 'scrolly')
  await expect(present).toHaveAttribute('data-step', '0')
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('ArrowRight')
  // The stepper appears at step 2 and steps through its own states from there.
  const stepper = present.locator('.pm-demo-stepper')
  await expect(present).toHaveAttribute('data-step', '2')
  await expect(stepper).toHaveAttribute('data-step', '0')
  await page.keyboard.press('ArrowRight')
  await expect(present).toHaveAttribute('data-step', '3')
  await expect(stepper).toHaveAttribute('data-step', '1')
  await expect(stepper.locator('li').nth(1)).toBeHidden()
  // Narration is not on the screen.
  await expect(present).not.toContainText('先是离线缓存')

  const [presenter] = await Promise.all([page.waitForEvent('popup'), present.getByRole('button', { name: '演讲者窗口' }).click()])
  const notes = presenter.locator('.pm-presenter')
  await expect(notes).toHaveAttribute('data-step', '3')
  await expect(notes.locator('.pm-current')).toContainText('先是离线缓存')
  await expect(notes.locator('.pm-presenter__next')).toContainText('然后是形态互跳')
  await expect(notes.locator('.pm-presenter__timer')).toHaveText(/^\d\d:\d\d$/)

  // Either window moves both.
  await page.keyboard.press('ArrowRight')
  await expect(notes).toHaveAttribute('data-step', '4')
  await expect(notes.locator('.pm-current')).toContainText('然后是形态互跳')
  await expect(stepper.locator('li').nth(1)).toBeVisible()
  for (let i = 0; i < 5; i++) await presenter.keyboard.press('ArrowLeft')
  await expect(present).toHaveAttribute('data-section', 'web')
  await presenter.keyboard.press('ArrowRight')
  await expect(present).toHaveAttribute('data-section', 'scrolly')
  await expect(present).toHaveAttribute('data-step', '0')
})

/**
 * `presmium dev --to web` on a copy of a deck, in a directory of its own inside
 * the demo (so the renderers and plugins resolve), printing the dev server URL.
 */
async function startDev(files: string[]): Promise<{ deck: string, url: string, child: ChildProcess, stop(): Promise<void> }> {
  const work = resolve('examples/demo/.presmium')
  mkdirSync(work, { recursive: true })
  const deck = mkdtempSync(join(work, 'e2e-'))
  writeFileSync(join(deck, '.gitignore'), '*\n')
  for (const file of files) cpSync(file, join(deck, file.split('/').at(-1)!), { recursive: true })
  // The "editor" records what it is asked to open.
  writeFileSync(join(deck, 'editor.sh'), `#!/bin/sh\nprintf '%s\\n' "$@" > '${join(deck, 'opened.txt')}'\n`, { mode: 0o755 })
  const child = spawn(process.execPath, [resolve('packages/cli/bin/presmium.mjs'), 'dev', '--to', 'web'], {
    cwd: deck,
    stdio: ['ignore', 'pipe', 'inherit'],
    env: { ...process.env, LAUNCH_EDITOR: join(deck, 'editor.sh') },
  })
  const stop = async () => {
    if (child.exitCode === null) {
      child.kill('SIGTERM')
      await new Promise(done => child.once('exit', done))
    }
    rmSync(deck, { recursive: true, force: true })
  }
  const url = await new Promise<string>((done, fail) => {
    let output = ''
    child.stdout!.on('data', (chunk: Buffer) => {
      output += chunk
      const match = /^web {2}(http\S+)$/m.exec(output)
      if (match) done(match[1]!)
    })
    child.once('exit', code => fail(new Error(`presmium dev exited (${code}):\n${output}`)))
  }).catch(async (error: unknown) => {
    await stop()
    throw error
  })
  return { deck, url, child, stop }
}

/** Opens a dev page once its dependencies are optimized (the first visit may reload the page once). */
async function openDev(page: Page, url: string, ready: string) {
  for (let visit = 0; visit < 2; visit++) {
    await page.goto(url)
    await expect(page.locator(ready).first()).toBeVisible()
    await page.waitForLoadState('networkidle')
  }
}

/** Marks the window, so a reload shows as a missing mark. */
async function mark(page: Page) {
  await page.evaluate(() => {
    (window as { marker?: boolean }).marker = true
  })
}

const marked = (page: Page) => page.evaluate(() => (window as { marker?: boolean }).marker === true)

test.describe('presmium dev', () => {
  test.describe.configure({ mode: 'serial', timeout: 120_000 })
  let dev: Awaited<ReturnType<typeof startDev>>
  test.beforeAll(async () => {
    test.setTimeout(120_000)
    dev = await startDev([resolve('examples/demo/lecture.md'), resolve('examples/demo/pages')])
  })
  test.afterAll(() => dev?.stop())
  const edit = (from: string | RegExp, to: string) => {
    const file = join(dev.deck, 'pages/web.md')
    writeFileSync(file, readFileSync(file, 'utf8').replace(from, to))
  }

  test('an edited paragraph shows within 300 ms, keeping the view, step and scroll position', async ({ page }) => {
    await openDev(page, `${dev.url}web.html`, '.pm-section[data-section="scrolly"]')
    const scrolly = page.locator('.pm-section[data-section="scrolly"]')
    await expect(scrolly.locator('.pm-block--narration').nth(1)).toContainText('第二步，渲染章节')

    await selectView(page, 'scrolly')
    await scrollToStep(page, 'scrolly', 2)
    await mark(page)
    const before = await page.evaluate(() => {
      new MutationObserver(() => {
        const w = window as { updatedAt?: number }
        if (document.querySelector('[data-section="scrolly"]')?.textContent?.includes('第二步，绘制章节')) w.updatedAt ??= Date.now()
      }).observe(document.body, { subtree: true, childList: true, characterData: true })
      return window.scrollY
    })

    const saved = Date.now()
    edit('第二步，渲染章节', '第二步，绘制章节')
    await expect(scrolly).toContainText('第二步，绘制章节')
    const updatedAt = await page.evaluate(() => (window as { updatedAt?: number }).updatedAt!)
    expect(updatedAt - saved).toBeLessThan(300)

    // Same page (no reload), same view, step and scroll position.
    expect(await marked(page)).toBe(true)
    await expect(menu(page)).toHaveValue('scrolly')
    await expect(scrolly).toHaveAttribute('data-step', '2')
    expect(await page.evaluate(() => window.scrollY)).toBe(before)
  })

  test('a section, or a block with Alt+click, opens its source in the editor', async ({ page }) => {
    await openDev(page, `${dev.url}web.html`, '.pm-section[data-section="scrolly"]')
    const opened = join(dev.deck, 'opened.txt')
    // File and line the editor was given.
    const asked = () => (existsSync(opened) ? readFileSync(opened, 'utf8').split('\n').slice(0, 2) : [])
    const scrolly = page.locator('.pm-section[data-section="scrolly"]')
    const source = readFileSync(join(dev.deck, 'pages/web.md'), 'utf8').split('\n')
    const lineOf = (text: string) => String(source.findIndex(line => line.includes(text)) + 1)

    await scrolly.getByRole('button', { name: '在编辑器中打开源码' }).click()
    await expect.poll(asked).toEqual([join(dev.deck, 'pages/web.md'), lineOf('## 滚动叙事')])
    rmSync(opened)
    await scrolly.locator('.pm-block--narration', { hasText: '第一步，编译源码' }).click({ modifiers: ['Alt'] })
    await expect.poll(asked).toEqual([join(dev.deck, 'pages/web.md'), lineOf('第一步，编译源码')])
  })

  test('a renamed heading and a new section show without a reload; the sidebar follows', async ({ page }) => {
    await openDev(page, `${dev.url}web.html`, '.pm-section[data-section="scrolly"]')
    const scrolly = page.locator('.pm-section[data-section="scrolly"]')
    await selectView(page, 'scrolly')
    await scrollToStep(page, 'scrolly', 2)
    await mark(page)
    const before = await page.evaluate(() => window.scrollY)

    edit('## 滚动叙事', '## 滚动叙事改名')
    edit(/$/, '\n(added)=\n## 新增章节\n\n保存后新增的章节。\n')
    await expect(scrolly.locator('h2')).toHaveText('滚动叙事改名')
    await expect(page.locator('.pm-section[data-section="added"]')).toContainText('保存后新增的章节')
    const sidebar = page.locator('.VPSidebar')
    await expect(sidebar.getByRole('link', { name: '滚动叙事改名' })).toBeAttached()
    await expect(sidebar.getByRole('link', { name: '新增章节' })).toBeAttached()

    expect(await marked(page)).toBe(true)
    await expect(menu(page)).toHaveValue('scrolly')
    await expect(scrolly).toHaveAttribute('data-step', '2')
    expect(await page.evaluate(() => window.scrollY)).toBe(before)
  })

  test('in the scrolly view, content added above the reading position keeps it in place', async ({ page }) => {
    await openDev(page, `${dev.url}web.html`, '.pm-section[data-section="scrolly"]')
    const scrolly = page.locator('.pm-section[data-section="scrolly"]')
    const marker = scrolly.locator('.pm-step[data-step="2"]')
    await selectView(page, 'scrolly')
    await scrollToStep(page, 'scrolly', 2)
    const top = () => marker.evaluate(el => Math.round(el.getBoundingClientRect().top))
    const before = await top()
    await mark(page)

    // Paragraphs added to the section above push the reading position down the page.
    const added = Array.from({ length: 4 }, (_, i) => `上方新增的第 ${i + 1} 段讲解，让前一节变长。`).join('\n\n')
    edit('搜索框支持中文分词', `${added}\n\n搜索框支持中文分词`)
    await expect(page.locator('.pm-section[data-section="web"]')).toContainText('上方新增的第 4 段讲解')
    await expect.poll(top).toBe(before)
    await expect(scrolly).toHaveAttribute('data-step', '2')
    expect(await marked(page)).toBe(true)
  })

  test('a keyword written while the server runs can be searched', async ({ page }) => {
    await openDev(page, `${dev.url}web.html`, '.pm-section[data-section="scrolly"]')
    edit('第一步，编译源码。', '第一步，编译源码，也就是 Quokka 步骤。')
    await expect(page.locator('.pm-section[data-section="scrolly"]')).toContainText('Quokka')

    await page.keyboard.press('Control+k')
    const input = page.getByRole('searchbox')
    const result = page.getByRole('listbox').getByRole('option').first()
    // The search index is updated in the page too: typing again finds the new keyword.
    await expect(async () => {
      await input.fill('')
      await input.fill('quokka')
      await expect(result).toBeVisible({ timeout: 1000 })
    }).toPass()
    await result.click()
    await expect(page).toHaveURL(/\/web\.html#scrolly$/)
  })
})

test.describe('a plugin that extends the IR runtime', () => {
  test.describe.configure({ mode: 'serial', timeout: 120_000 })
  let dev: Awaited<ReturnType<typeof startDev>>
  test.beforeAll(async () => {
    test.setTimeout(120_000)
    const fixture = resolve('packages/viewer/test/fixtures/plugin-deck')
    dev = await startDev(['lecture.md', 'notes.md', 'plugin'].map(file => join(fixture, file)))
  })
  test.afterAll(() => dev?.stop())

  test('its view appears in the view menu and keeps the position; its renderers draw their nodes', async ({ page }) => {
    await openDev(page, `${dev.url}?section=probe`, '.pm-section[data-section="probe"]')
    await expect(page.locator('h2#probe')).toBeInViewport()
    await expect(menu(page).locator('option', { hasText: '卡片' })).toBeAttached()

    await selectView(page, 'cards')
    const cards = page.locator('.pm-card')
    await expect(cards).toHaveCount(3)
    await expect(page.locator('.pm-card[aria-current="true"]')).toHaveAttribute('data-section', 'probe')
    await selectView(page, 'document')
    await expect(page.locator('h2#probe')).toBeInViewport()

    // A renderer for a node kind (csv code) and one for a component.
    const table = page.locator('.pm-section[data-section="table"]')
    await expect(table.locator('table.pm-csv td', { hasText: '苹果' })).toBeVisible()
    await expect(table.locator('.pm-swapped')).toHaveText('插件的渲染器')
    await expect(table.locator('.pm-swap')).toHaveCount(0)
    // The deck has no slides form, so no section links to one.
    await expect(page.getByRole('link', { name: '在幻灯片中打开' })).toHaveCount(0)
  })

  test('a component written for Slidev sees its section\'s $frontmatter, $page and $clicks, and v-click rules', async ({ page }) => {
    await openDev(page, `${dev.url}?view=present&section=probe`, '.pm-present .pm-probe')
    const probe = page.locator('.pm-present .pm-probe')
    // $frontmatter is the section's (title and web hints), not the VitePress page's.
    await expect(probe).toHaveAttribute('data-title', '探针')
    await expect(probe).toHaveAttribute('data-accent', 'teal')
    await expect(probe).toHaveAttribute('data-page', '3')
    const shown = (part: string) => probe.locator(`.pm-probe__${part}`)
    const states = async () => Promise.all(['click', 'after', 'hide'].map(part => shown(part).getAttribute('data-pm-click')))

    await expect(probe).toHaveAttribute('data-clicks', '0')
    await expect.poll(states).toEqual(['hidden', 'hidden', 'shown'])
    await page.keyboard.press('ArrowRight')
    await expect(probe).toHaveAttribute('data-clicks', '1')
    await expect.poll(states).toEqual(['shown', 'shown', 'shown'])
    await page.keyboard.press('ArrowRight')
    await expect(probe).toHaveAttribute('data-clicks', '2')
    await expect.poll(states).toEqual(['shown', 'shown', 'hidden'])
    // Stepping back is the reverse.
    await page.keyboard.press('ArrowLeft')
    await expect.poll(states).toEqual(['shown', 'shown', 'shown'])

    // The document view shows the final state.
    await page.keyboard.press('Escape')
    const inPage = page.locator('.pm-section[data-section="probe"] .pm-probe')
    await expect.poll(() => Promise.all(['click', 'after', 'hide'].map(part => inPage.locator(`.pm-probe__${part}`).getAttribute('data-pm-click')))).toEqual(['shown', 'shown', 'hidden'])
  })

  test('a footnote reference opens its definition, which MyST moves to the last section, on another page', async ({ page }) => {
    await openDev(page, dev.url, '.pm-section[data-section="table"]')
    await page.locator('.pm-section[data-section="table"] .pm-footnote-ref a').click()
    await expect(page).toHaveURL(/\/notes\.html#fn-csv$/)
    await expect(page.locator('#fn-csv')).toContainText('CSV 是逗号分隔的值')
    await expect(page.locator('#fn-csv')).toBeInViewport()
  })
})
