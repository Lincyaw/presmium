import { spawn } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { expect, test } from '@playwright/test'
import type { Locator, Page } from '@playwright/test'
import { SLIDES } from './urls.ts'

// The slides form is generated from the IR (`presmium build`, renderer `slides`).
// examples/demo/pages/core.md is the first section after the cover, i.e. slide 2.
const CORE = `${SLIDES}/2`
const PRESENTER = `${SLIDES}/presenter/2`

/** Waits until the core slide is shown and the kernel has started its plugins. */
async function openCore(page: Page, url = CORE) {
  await page.goto(url)
  const slide = page.locator('.slidev-layout.pm-core').first()
  await expect(slide.locator('.pm-demo-greeting')).toContainText('presmium.demo.provider')
  return slide
}

async function openPanels(page: Page) {
  const panels = page.locator('.pm-presenter-panels')
  await panels.locator('summary').click()
  return panels
}

test('jumping to step 3 renders the same DOM as stepping there from step 0', async ({ page }) => {
  const jumped = await openCore(page, `${CORE}?clicks=3`)
  await expect(jumped.locator('.pm-demo-stepper')).toHaveAttribute('data-step', '3')
  const expected = await jumped.innerHTML()

  const stepped = await openCore(page)
  const stepper = stepped.locator('.pm-demo-stepper')
  await expect(stepper).toHaveAttribute('data-step', '0')
  for (const step of ['1', '2', '3']) {
    await page.keyboard.press('ArrowRight')
    await expect(stepper).toHaveAttribute('data-step', step)
  }
  expect(await stepped.innerHTML()).toBe(expected)
})

test('a consumer plugin gets the provider service; a plugin missing a required service is disabled', async ({ page }) => {
  const slide = await openCore(page)
  await expect(slide.locator('.pm-demo-greeting')).toHaveText('presmium.demo.consumer 收到 presmium.demo.provider 的问候')

  await openCore(page, PRESENTER)
  const report = (await openPanels(page)).locator('.pm-start-report')
  await expect(report.locator('[data-plugin="presmium.demo.provider"]')).toHaveAttribute('data-status', 'started')
  await expect(report.locator('[data-plugin="presmium.demo.consumer"]')).toHaveAttribute('data-status', 'started')
  const orphan = report.locator('[data-plugin="presmium.demo.orphan"]')
  await expect(orphan).toHaveAttribute('data-status', 'disabled')
  await expect(orphan).toContainText('presmium.demo.missing')
})

test('a throwing component shows a placeholder while the rest of the slide renders', async ({ page }) => {
  const slide = await openCore(page)
  await expect(slide.locator('[data-pm-error="PmDemoBroken"]')).toContainText('故意抛出的错误')
  await expect(slide.locator('h1')).toHaveText('宿主适配')
  await expect(slide.locator('.pm-demo-stepper')).toBeAttached()
  await expect(slide.locator('.pm-demo-animated')).toBeVisible()
})

test('presenter panels appear only in the presenter view', async ({ page }) => {
  await openCore(page, PRESENTER)
  const panels = await openPanels(page)
  await expect(panels.locator('[data-panel="presmium.core.start-report"]')).toBeVisible()
  await expect(panels.locator('.pm-component-errors [data-component="PmDemoBroken"]')).toBeVisible()

  await openCore(page)
  await expect(page.locator('.pm-presenter-panels')).toHaveCount(0)
})

test('with reduced motion the animated component shows its final state at once', async ({ page }) => {
  const animations = (bar: Locator) => bar.evaluate(el => el.getAnimations().length)

  const animated = (await openCore(page)).locator('.pm-demo-animated__bar')
  expect(await animations(animated)).toBe(1)

  await page.emulateMedia({ reducedMotion: 'reduce' })
  const still = (await openCore(page)).locator('.pm-demo-animated__bar')
  expect(await animations(still)).toBe(0)
  expect(await still.evaluate(el => getComputedStyle(el).transform)).toBe('none')
})

test('narration becomes the speaker notes, highlighted at the step it belongs to', async ({ page }) => {
  await openCore(page, PRESENTER)
  const notes = page.locator('.slidev-note')
  // Narration after the stepper takes one paragraph per internal step (docs/ir.md 2.4).
  const intro = notes.locator('p', { hasText: '本章演示宿主适配' })
  const first = notes.locator('p', { hasText: '第一步突出' })
  await expect(intro).not.toHaveClass(/slidev-note-fade/)
  await expect(first).toHaveClass(/slidev-note-fade/)

  await page.keyboard.press('ArrowRight')
  await expect(first).not.toHaveClass(/slidev-note-fade/)
  await expect(intro).toHaveClass(/slidev-note-fade/)
})

test('the slide shows the visual blocks only: no narration, no content limited to other renderers', async ({ page }) => {
  const slide = await openCore(page)
  await expect(slide).toContainText('错误边界')
  await expect(slide).not.toContainText('本章演示宿主适配')
  await expect(slide).not.toContainText('网页形态中才出现的补充说明')
})

test('a component counts its steps from its block: at its first internal step it looks the same wherever the block appears', async ({ page }) => {
  // The core section's stepper appears at step 0; the one of core-scope (slide 3) at step 2.
  const stepper = async (url: string, layout: string) => {
    await page.goto(url)
    const shown = page.locator(`.slidev-layout.${layout} .pm-demo-stepper`)
    await expect(shown).toHaveAttribute('data-step', '1')
    await expect(shown.locator('li[data-status="active"]')).toHaveText('解析文稿')
    // Slidev marks each click target with its click of the slide, which differs by design.
    return (await shown.innerHTML()).replace(/ data-slidev-clicks-(start|end)="\d+"/g, '')
  }
  const early = await stepper(`${CORE}?clicks=1`, 'pm-core')
  const late = await stepper(`${SLIDES}/3?clicks=3`, 'pm-core-scope')
  expect(late).toBe(early)

  // One step back is the late stepper's initial state, the step its block appears at.
  await page.keyboard.press('ArrowLeft')
  await expect(page.locator('.slidev-layout.pm-core-scope .pm-demo-stepper')).toHaveAttribute('data-step', '0')
})

/** A small deck for `presmium dev --to slides`, in a directory of its own inside the demo so its packages resolve. */
const DEV_DECK = `---
title: 开发服务器
plugins:
  - '@presmium/slidev-addon-core'
renderers:
  slides: {}
---

# 开发服务器

(first)=
## 第一页

:::{slide}
编辑前的内容
:::
`

test('presmium dev serves the slides with Slidev and updates them when the source changes, without a reload', async ({ page }) => {
  test.setTimeout(180_000)
  const work = resolve('examples/demo/.presmium')
  mkdirSync(work, { recursive: true })
  const deck = mkdtempSync(join(work, 'e2e-slides-'))
  writeFileSync(join(deck, '.gitignore'), '*\n')
  writeFileSync(join(deck, 'lecture.md'), DEV_DECK)
  const child = spawn(process.execPath, [resolve('packages/cli/bin/presmium.mjs'), 'dev', '--to', 'slides'], { cwd: deck, stdio: ['ignore', 'pipe', 'inherit'] })
  try {
    const url = await new Promise<string>((done, fail) => {
      let output = ''
      child.stdout!.on('data', (chunk: Buffer) => {
        output += chunk
        const match = /^slides {2}(http\S+)$/m.exec(output)
        if (match) done(match[1]!)
      })
      child.once('exit', code => fail(new Error(`presmium dev exited (${code}):\n${output}`)))
    })
    // The first visit may reload once while Vite optimizes the dependencies.
    const slide = page.locator('.slidev-page-2')
    for (let visit = 0; visit < 2; visit++) {
      await page.goto(`${url}2`)
      await expect(slide).toContainText('编辑前的内容', { timeout: 60_000 })
      await page.waitForLoadState('networkidle')
    }
    await page.evaluate(() => {
      (window as { marker?: boolean }).marker = true
    })

    const file = join(deck, 'lecture.md')
    writeFileSync(file, readFileSync(file, 'utf8').replace('编辑前的内容', '编辑后的内容'))
    await expect(slide).toContainText('编辑后的内容')
    expect(await page.evaluate(() => (window as { marker?: boolean }).marker)).toBe(true)
  } finally {
    child.kill('SIGTERM')
    await new Promise(done => child.exitCode === null ? child.once('exit', done) : done(undefined))
    rmSync(deck, { recursive: true, force: true })
  }
})
