import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { lowContrast } from './fixtures/contrast.ts'
import { useFixture } from './fixtures/deck.ts'
import { startClassroomServer } from './fixtures/plugins/decks.ts'

const ASSISTANT = { '@lincyaw/slidev-addon-assistant': 'packages/addon-assistant' }

async function scheme(page: Page, dark: boolean): Promise<void> {
  await page.addInitScript((on) => {
    localStorage.setItem('vitepress-theme-appearance', on ? 'dark' : 'light')
    localStorage.setItem('slidev-color-schema', on ? 'dark' : 'light')
  }, dark)
}

test.describe('a deck built with the default theme', () => {
  test.describe.configure({ mode: 'default', timeout: 120_000 })
  let classroom: Awaited<ReturnType<typeof startClassroomServer>> | undefined
  test.beforeAll(async () => {
    classroom = await startClassroomServer()
  })
  test.afterAll(() => {
    classroom?.child.kill('SIGTERM')
  })
  const deck = useFixture('plugin-ui', {
    link: ASSISTANT,
    edit: (dir) => {
      const file = join(dir, 'lecture.md')
      writeFileSync(file, readFileSync(file, 'utf8').replace('renderers:', `presmium:\n  presmium.session:\n    server: ${classroom!.url}\nrenderers:`))
    },
  })

  test('its slides are 书卷: the chapter above the serif title, the foot with the deck, the steps and the number, code of 18 px or more', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 })
    const index = deck().slide('merge')
    await page.goto(`${deck().slides}/${index}`)
    const slide = page.locator(`.slidev-page-${index} .slidev-layout`)
    await expect(slide).toHaveClass(/pm-book/)
    await expect(slide).toHaveCSS('background-color', 'rgb(247, 245, 240)')
    await expect(slide.locator('.pm-book__chapter')).toHaveText('合并的规则')
    await expect(slide.locator('.pm-book__chapter')).toHaveCSS('color', 'rgb(15, 95, 92)')
    expect(await slide.locator('h1').evaluate(el => getComputedStyle(el).fontFamily)).toMatch(/^"?Source Serif 4/)
    const foot = slide.locator('.pm-book-footer')
    await expect(foot.locator('.pm-book-footer__title')).toHaveText('书卷样式')
    await expect(foot.locator('.pm-book-footer__page')).toHaveText(`${index} / ${deck().doc.sections.length}`)
    const steps = foot.getByRole('img', { name: '第 0 步，共 2 步' })
    await expect(steps.locator('span')).toHaveCount(2)
    await page.keyboard.press('ArrowRight')
    await expect(foot.getByRole('img', { name: '第 1 步，共 2 步' }).locator('span[data-done]')).toHaveCount(1)
    const code = slide.locator('.slidev-code').first()
    expect(await code.evaluate((el: HTMLElement) => Number.parseFloat(getComputedStyle(el).fontSize) * el.getBoundingClientRect().height / el.offsetHeight)).toBeGreaterThanOrEqual(18)

    await page.goto(`${deck().slides}/1`)
    await expect(page.locator('.slidev-page-1 .slidev-layout')).toHaveClass(/pm-book--cover/)
    await expect(page.locator('.slidev-page-1 .pm-book-footer__title')).toHaveCount(0)
  })

  for (const dark of [false, true]) {
    test(`every slide, components included, reaches WCAG AA, its fields 3:1, and the run button keeps its ink (${dark ? 'dark' : 'light'})`, async ({ page }) => {
      await scheme(page, dark)
      await page.setViewportSize({ width: 1280, height: 720 })
      for (const section of deck().doc.sections) {
        await page.goto(`${deck().slides}/${section.index}?clicks=${section.steps}`)
        const slide = page.locator(`.slidev-page-${section.index}`)
        await expect(slide.locator('h1').first()).toBeVisible()
        await expect(slide.locator('.slidev-layout')).toHaveCSS('background-color', dark ? 'rgb(22, 22, 20)' : 'rgb(247, 245, 240)')
        if (section.id === 'diagram') await expect(slide.locator('.mermaid')).toBeVisible()
        expect(await lowContrast(page, `.slidev-page-${section.index}`), section.id).toEqual([])
      }
      await page.goto(`${deck().slides}/${deck().slide('run')}`)
      await expect(page.locator('.pm-run-panel__run').first()).toHaveCSS('background-color', dark ? 'rgb(237, 234, 227)' : 'rgb(28, 27, 25)')
    })

    test(`the presenter view's panels, the classroom's controls among them, reach WCAG AA, their fields 3:1 (${dark ? 'dark' : 'light'})`, async ({ page }) => {
      await scheme(page, dark)
      await page.setViewportSize({ width: 1440, height: 900 })
      await page.goto(`${deck().slides}/presenter/${deck().slide('merge')}`)
      const panels = page.locator('.pm-presenter-panels')
      await panels.locator('summary').click()
      const session = panels.locator('[data-panel="presmium.session"]')
      await expect(session.getByLabel('昵称')).toBeVisible()
      await expect(panels.locator('[data-panel="presmium.classroom"]')).toBeVisible()
      expect(await lowContrast(page, '.pm-presenter-panels')).toEqual([])
      await session.getByLabel('昵称').fill('王老师')
      await session.getByRole('button', { name: '创建课堂' }).click()
      await expect(session.getByRole('img', { name: '加入课堂的二维码' }).locator('svg')).toBeVisible()
      expect(await lowContrast(page, '.pm-presenter-panels')).toEqual([])
    })

    test(`in the web form the components and the question panel reach WCAG AA, their fields 3:1 (${dark ? 'dark' : 'light'})`, async ({ page }) => {
      await scheme(page, dark)
      await page.setViewportSize({ width: 1440, height: 900 })
      await page.goto(`${deck().web}/basics.html`)
      for (const name of ['quiz', 'predict', 'run-panel', 'exercise', 'question-box', 'pulse', 'demo-stepper']) await expect(page.locator(`.pm-${name}`).first()).toBeVisible()
      await expect(page.locator('.pm-mermaid[data-rendered]')).toHaveAttribute('data-theme', dark ? 'dark' : 'default')
      await expect(page.locator('.pm-run-panel__run')).toHaveCSS('background-color', dark ? 'rgb(237, 234, 227)' : 'rgb(28, 27, 25)')
      expect(await lowContrast(page, ':is(.pm-quiz, .pm-predict, .pm-run-panel, .pm-exercise, .pm-question-box, .pm-pulse, .pm-demo-stepper, .pm-mermaid)', 'pre.shiki')).toEqual([])
      await page.locator('.pm-assistant-toolbar').filter({ visible: true }).getByRole('button', { name: '提问' }).click()
      const ask = page.getByRole('dialog', { name: '向 AI 提问' })
      await expect(ask.getByLabel('地址')).toBeVisible()
      expect(await lowContrast(page, '.pm-assistant-popover')).toEqual([])
    })
  }

  const RUNTIME = { timeout: 180_000 }

  test('the run panel names the language and where it runs above the code, with its run button; its output, beside the code on a slide, says how long the run took', async ({ page }) => {
    test.setTimeout(240_000)
    await page.setViewportSize({ width: 1280, height: 720 })
    const index = deck().slide('run')
    await page.goto(`${deck().slides}/${index}`)
    const panel = page.locator(`.slidev-page-${index} .pm-run-panel`)
    const bar = panel.locator('.pm-run-panel__bar')
    await expect(bar.locator('.pm-run-panel__where')).toHaveText('Python · 浏览器中运行')
    const [top, code] = await Promise.all([bar.boundingBox(), panel.locator('.pm-run-panel__source pre').boundingBox()])
    expect(top!.y + top!.height).toBeLessThanOrEqual(code!.y + 1)
    await bar.locator('.pm-run-panel__run').click()
    const output = panel.locator('.pm-run-panel__output')
    await expect(output.locator('.pm-run-panel__stdout')).toContainText('合并第 2 轮', RUNTIME)
    await expect(output.locator('.pm-run-panel__label')).toHaveText(/^输出 · \d+\.\d{2} 秒$/)
    const [main, beside] = await Promise.all([panel.locator('.pm-run-panel__main').boundingBox(), output.boundingBox()])
    expect(beside!.x).toBeGreaterThanOrEqual(main!.x + main!.width - 1)
    expect(beside!.y).toBeLessThan(main!.y + main!.height)

    await page.goto(`${deck().web}/basics.html`)
    await expect(page.locator('.pm-section[data-section="run"] .pm-run-panel__where')).toHaveText('Python · 浏览器中运行')
    await page.goto(`${deck().web}/basics.html?view=present&section=run`)
    await expect(page.getByRole('region', { name: '放映' }).locator('.pm-run-panel__where')).toHaveText('Python · 浏览器中运行')
  })

  test('the plugins draw the host\'s line icons, not glyphs: the exercise\'s marks, the high-contrast switch, the step buttons of a traced run', async ({ page }) => {
    test.setTimeout(240_000)
    await page.goto(`${deck().web}/basics.html`)
    const traced = page.locator('.pm-section[data-section="trace"] .pm-step-run')
    await traced.scrollIntoViewIfNeeded()
    const stepper = traced.locator('.pm-step-run__stepper')
    await expect(stepper).toBeVisible(RUNTIME)
    await expect(stepper.locator('button svg.pm-ui-icon')).toHaveCount(2)
    expect(await stepper.textContent()).not.toMatch(/[◀▶]/)
    const exercise = page.locator('.pm-section[data-section="exercise"] .pm-exercise')
    await exercise.getByRole('button', { name: '提交' }).click()
    const cases = exercise.locator('.pm-exercise__cases li')
    await expect(cases.first()).toBeVisible(RUNTIME)
    await expect(cases.locator('svg.pm-exercise__mark')).toHaveCount(await cases.count())
    expect(await exercise.locator('.pm-exercise__cases').textContent()).not.toMatch(/[✓✗]/)
    const toggle = page.getByRole('switch', { name: '高对比度' }).filter({ visible: true }).first()
    await expect(toggle.locator('svg.pm-ui-icon')).toHaveCount(1)
    expect(await toggle.textContent()).not.toMatch(/◐/)
  })
})
