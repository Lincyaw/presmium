import { spawn } from 'node:child_process'
import type { ChildProcess } from 'node:child_process'
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { WEB } from './urls.ts'

// The IR runtime (@presmium/viewer) in the built web form on WEB, and in `presmium dev`.
// Sections of the demo: cover, core (pages/core.md), web and scrolly (pages/web.md).

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

  // Leaving the present view goes back to the document view at the same place.
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

  // A section opened from another page: the document view goes to its page.
  await page.keyboard.press('Home')
  await expect(present).toHaveAttribute('data-section', 'presmium-demo')
  await page.keyboard.press('ArrowRight')
  await expect(present).toHaveAttribute('data-section', 'core')
  await page.keyboard.press('Escape')
  await expect(page).toHaveURL(/\/core\.html/)
  await settled(page)
  await expect(page.locator('h2#core')).toBeInViewport()
})

test('the present view pages with the keyboard; the presenter window follows with the narration of the step', async ({ page }) => {
  await page.goto(`${WEB}/core.html`)
  await selectView(page, 'present')
  const present = page.getByRole('region', { name: '放映' })
  const stepper = present.locator('.pm-demo-stepper')
  await expect(present).toHaveAttribute('data-section', 'core')
  await expect(present).toHaveAttribute('data-step', '0')
  await expect(stepper).toHaveAttribute('data-step', '0')
  // Narration is not on the screen.
  await expect(present).not.toContainText('故意抛错的组件显示错误占位')

  await page.keyboard.press('ArrowRight')
  await expect(present).toHaveAttribute('data-step', '1')
  await expect(stepper).toHaveAttribute('data-step', '1')
  await expect(stepper.locator('li').nth(1)).toBeHidden()

  const [presenter] = await Promise.all([page.waitForEvent('popup'), present.getByRole('button', { name: '演讲者窗口' }).click()])
  const notes = presenter.locator('.pm-presenter')
  await expect(notes).toHaveAttribute('data-step', '1')
  await expect(notes.locator('.pm-current')).toContainText('故意抛错的组件显示错误占位')
  await expect(notes.locator('.pm-presenter__next')).toContainText('网页形态中才出现的补充说明')
  await expect(notes.locator('.pm-presenter__timer')).toHaveText(/^\d\d:\d\d$/)

  // Either window moves both.
  await page.keyboard.press('ArrowRight')
  await expect(notes).toHaveAttribute('data-step', '2')
  await expect(notes.locator('.pm-current')).toContainText('网页形态中才出现的补充说明')
  await presenter.keyboard.press('ArrowRight')
  await expect(present).toHaveAttribute('data-section', 'web')
  await expect(present).toHaveAttribute('data-step', '0')
  await presenter.keyboard.press('ArrowLeft')
  await expect(present).toHaveAttribute('data-section', 'core')
  await expect(present).toHaveAttribute('data-step', '2')
  await expect(stepper).toHaveAttribute('data-step', '2')
})

/**
 * `presmium dev --to web` on a copy of the demo deck (inside the demo, so its
 * plugins resolve), printing the dev server URL.
 */
async function startDev(deck: string): Promise<{ url: string, child: ChildProcess }> {
  const demo = resolve('examples/demo')
  rmSync(deck, { recursive: true, force: true })
  mkdirSync(deck, { recursive: true })
  writeFileSync(join(deck, '.gitignore'), '*\n')
  cpSync(join(demo, 'lecture.md'), join(deck, 'lecture.md'))
  cpSync(join(demo, 'pages'), join(deck, 'pages'), { recursive: true })
  const child = spawn(process.execPath, [resolve('packages/cli/bin/presmium.mjs'), 'dev', '--to', 'web'], { cwd: deck, stdio: ['ignore', 'pipe', 'inherit'] })
  const url = await new Promise<string>((done, fail) => {
    let output = ''
    child.stdout!.on('data', (chunk: Buffer) => {
      output += chunk
      const match = /^web {2}(http\S+)$/m.exec(output)
      if (match) done(match[1]!)
    })
    child.once('exit', code => fail(new Error(`presmium dev exited (${code}):\n${output}`)))
  })
  return { url, child }
}

test('presmium dev shows an edited paragraph within 300 ms, keeping the view, step and scroll position', async ({ page }) => {
  test.setTimeout(120_000)
  const deck = resolve('examples/demo/.presmium/e2e-live')
  const { url, child } = await startDev(deck)
  try {
    await page.goto(`${url}web.html`)
    const scrolly = page.locator('.pm-section[data-section="scrolly"]')
    await expect(scrolly.locator('.pm-block--narration').nth(1)).toContainText('第二步，渲染章节')
    // The first visit makes Vite optimize dependencies, which may reload the page once.
    await page.waitForLoadState('networkidle')
    await page.reload()
    await expect(scrolly).toBeVisible()

    await selectView(page, 'scrolly')
    await scrollToStep(page, 'scrolly', 2)
    const before = await page.evaluate(() => {
      (window as { marker?: boolean }).marker = true
      new MutationObserver(() => {
        const w = window as { updatedAt?: number }
        if (document.querySelector('[data-section="scrolly"]')?.textContent?.includes('第二步，绘制章节')) w.updatedAt ??= Date.now()
      }).observe(document.body, { subtree: true, childList: true, characterData: true })
      return window.scrollY
    })

    const file = join(deck, 'pages/web.md')
    const saved = Date.now()
    writeFileSync(file, readFileSync(file, 'utf8').replace('第二步，渲染章节', '第二步，绘制章节'))
    await expect(scrolly).toContainText('第二步，绘制章节')
    const updatedAt = await page.evaluate(() => (window as { updatedAt?: number }).updatedAt!)
    expect(updatedAt - saved).toBeLessThan(300)

    // Same page (no reload), same view, step and scroll position.
    expect(await page.evaluate(() => (window as { marker?: boolean }).marker)).toBe(true)
    await expect(menu(page)).toHaveValue('scrolly')
    await expect(scrolly).toHaveAttribute('data-step', '2')
    expect(await page.evaluate(() => window.scrollY)).toBe(before)
  } finally {
    child.kill('SIGTERM')
    await new Promise(done => child.once('exit', done))
    rmSync(deck, { recursive: true, force: true })
  }
})
