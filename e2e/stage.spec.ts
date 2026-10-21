import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { useFixture } from './fixtures/deck.ts'

test.describe.configure({ mode: 'default' })
const deck = useFixture('stage')
const slides = (path: string | number) => `${deck().slides}/${path}`
const basics = () => deck().slide('stage-basics')
const steps = () => deck().slide('stage-steps')

async function openBothViews(page: Page) {
  const audience = page
  await audience.goto(slides(basics()))
  await expect(audience.locator('.pm-stage-basics h1')).toBeVisible()
  const presenter = await page.context().newPage()
  await presenter.goto(slides(`presenter/${basics()}`))
  await expect(presenter.locator('.pm-stage-basics h1').first()).toBeVisible()
  return { audience, presenter }
}

function coversCentre(page: Page, selector: string) {
  return page.evaluate(sel => !!document.elementFromPoint(innerWidth / 2, innerHeight / 2)?.closest(sel), selector)
}

test('tables, footnotes and highlighted code are visible', async ({ page }) => {
  await page.goto(slides(basics()))
  const slide = page.locator('.slidev-layout.pm-stage-basics')

  await expect(slide.locator('table')).toBeVisible()
  await expect(slide.locator('table tbody tr')).toHaveCount(3)

  await expect(slide.locator('sup.footnote-ref')).toBeVisible()
  await expect(slide.locator('.footnotes')).toContainText('快捷键在演讲者视图和听众视图中都可用')
  await expect(slide.locator('.footnotes')).toBeInViewport()

  const code = slide.locator('pre.shiki')
  await expect(code).toBeVisible()
  const colours = await code.locator('.line span').evaluateAll(spans => new Set(spans.map(s => getComputedStyle(s).color)).size)
  expect(colours).toBeGreaterThan(2)
})

test('presenter notes highlight the current step and fade the others', async ({ page }) => {
  await page.goto(slides(`presenter/${steps()}`))
  const notes = page.locator('.slidev-note-with-clicks').first()
  const step = (n: number) => notes.locator(':scope > p').nth(n)
  await expect(notes.locator(':scope > p')).toHaveCount(3)
  const highlighted = 'rgb(234, 243, 241)'
  const faded = 'rgb(92, 88, 79)'

  await expect(step(0)).toHaveCSS('background-color', highlighted)
  await expect(step(1)).toHaveCSS('color', faded)

  for (const current of [1, 2]) {
    await page.keyboard.press('ArrowRight')
    await expect(step(current)).toHaveCSS('background-color', highlighted)
    await expect(step(current)).not.toHaveCSS('color', faded)
    await expect(step(current - 1)).toHaveCSS('color', faded)
    await expect(step(current - 1)).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)')
  }
  await expect(step(0)).toHaveCSS('color', faded)
})

test('b blacks out the audience view and b again restores it', async ({ page }) => {
  const { audience, presenter } = await openBothViews(page)

  await presenter.keyboard.press('b')
  await expect(audience.locator('.pm-stage-black')).toBeVisible()
  await expect.poll(() => coversCentre(audience, '.pm-stage-black')).toBe(true)
  await expect(presenter.locator('.pm-stage-badge')).toHaveAttribute('data-mode', 'black')
  await expect(presenter.locator('.pm-stage-black')).toHaveCount(0)

  await presenter.keyboard.press('b')
  await expect(audience.locator('.pm-stage-black')).toHaveCount(0)
  await expect.poll(() => coversCentre(audience, '.pm-stage-basics')).toBe(true)
  await expect(presenter.locator('.pm-stage-badge')).toBeHidden()
})

test('f freezes the audience view while the presenter moves on; f again resumes', async ({ page }) => {
  const { audience, presenter } = await openBothViews(page)

  await presenter.keyboard.press('f')
  const frozen = audience.locator('.pm-stage-frozen')
  await expect(frozen).toBeVisible()
  await expect(presenter.locator('.pm-stage-badge')).toHaveAttribute('data-mode', 'frozen')

  await presenter.keyboard.press('ArrowRight')
  await expect(audience).toHaveURL(new RegExp(`/${steps()}\\b`))
  await expect.poll(() => coversCentre(audience, '.pm-stage-frozen')).toBe(true)
  await expect(frozen.locator('.pm-stage-basics h1')).toBeVisible()

  await presenter.keyboard.press('f')
  await expect(frozen).toBeHidden()
  await expect(audience.locator('.pm-stage-steps h1')).toBeVisible()
  await expect.poll(() => coversCentre(audience, '.pm-stage-steps')).toBe(true)
})

test('annotations are persisted: a drawing survives a reload', async ({ page }) => {
  await page.goto(slides(basics()))
  await expect(page.locator('.pm-stage-basics h1')).toBeVisible()
  await page.getByTitle('Show drawing toolbar').click()

  const box = (await page.locator('.pm-stage-basics').boundingBox())!
  const y = box.y + box.height * 0.8
  await page.mouse.move(box.x + box.width * 0.6, y)
  await page.mouse.down()
  for (let i = 1; i <= 10; i++) await page.mouse.move(box.x + box.width * (0.6 + i * 0.03), y - i * 4)
  await page.mouse.up()
  const strokes = page.locator('.slidev-slide-content > svg path')
  await expect(strokes).not.toHaveCount(0)

  await page.reload()
  await expect(page.locator('.pm-stage-basics h1')).toBeVisible()
  await expect(strokes).not.toHaveCount(0)
})

test('the web form shows the table, the footnote at its section and the highlighted code', async ({ page }) => {
  await page.goto(`${deck().web}/stage.html`)
  const section = page.locator('.pm-section[data-section="stage-basics"]')
  await expect(section.locator('table tbody tr')).toHaveCount(3)
  await expect(section).toContainText('快捷键在演讲者视图和听众视图中都可用')
  await expect(page.locator('.pm-section[data-section="stage-steps"]')).not.toContainText('快捷键在演讲者视图和听众视图中都可用')
  const code = section.locator('pre.shiki')
  await expect(code).toContainText('toggleScreen')
  await expect.poll(() => code.locator('.line span').evaluateAll(spans => new Set(spans.map(s => getComputedStyle(s).color)).size)).toBeGreaterThan(2)
})

test('in the web form\'s present view, b blacks out and f freezes the audience window; the presenter window shows which', async ({ page }) => {
  await page.goto(`${deck().web}/stage.html?view=present`)
  const present = page.getByRole('region', { name: '放映' })
  await expect(present).toHaveAttribute('data-section', 'stage-basics')
  const [presenter] = await Promise.all([page.waitForEvent('popup'), page.keyboard.press('p')])
  await expect(presenter.locator('.pm-presenter')).toHaveAttribute('data-section', 'stage-basics')
  const badge = presenter.locator('.pm-presenter .pm-stage-badge')

  await page.keyboard.press('b')
  await expect(page.locator('.pm-stage-black')).toBeVisible()
  await expect.poll(() => coversCentre(page, '.pm-stage-black')).toBe(true)
  await expect(badge).toHaveAttribute('data-mode', 'black')
  await page.keyboard.press('b')
  await expect(page.locator('.pm-stage-black')).toHaveCount(0)
  await expect.poll(() => coversCentre(page, '.pm-present__slide')).toBe(true)
  await expect(badge).toHaveCount(0)

  await presenter.keyboard.press('f')
  const frozen = page.locator('.pm-stage-frozen')
  await expect(frozen).toBeVisible()
  await expect(badge).toHaveAttribute('data-mode', 'frozen')
  await presenter.keyboard.press('ArrowRight')
  await expect(present).toHaveAttribute('data-section', 'stage-steps')
  await expect.poll(() => coversCentre(page, '.pm-stage-frozen')).toBe(true)
  await expect(frozen.locator('h1')).toHaveText('讲台：基础内容')
  await presenter.keyboard.press('f')
  await expect(frozen).toBeHidden()
  await expect(present.locator('.pm-present__title')).toHaveText('讲台：步骤与画面')
  await expect.poll(() => coversCentre(page, '.pm-present__slide')).toBe(true)
})

test('the slides form fits the stage slides to a 4:3 and a 16:10 screen', async ({ page }) => {
  for (const [width, height] of [[1024, 768], [1280, 800]] as const) {
    await page.setViewportSize({ width, height })
    for (const [no, layout] of [[basics(), 'pm-stage-basics'], [steps(), 'pm-stage-steps']] as const) {
      await page.goto(slides(no))
      const slide = page.locator(`.slidev-layout.${layout}`).filter({ visible: true })
      await expect(slide).toBeInViewport({ ratio: 0.999 })
      expect(await slide.evaluate(el => el.scrollHeight <= el.clientHeight && el.scrollWidth <= el.clientWidth), `${layout} at ${width}x${height}`).toBe(true)
    }
  }
})

test('the slides form has an overview: o shows every slide, a click goes to one', async ({ page }) => {
  await page.goto(slides(basics()))
  await expect(page.locator('.pm-stage-basics h1')).toBeVisible()
  const preview = page.locator('h1', { hasText: '讲台：步骤与画面' }).filter({ visible: true })
  await expect(preview).toHaveCount(0)
  await page.keyboard.press('o')
  await expect(preview).toBeVisible()
  await preview.click({ force: true })
  await expect(page).toHaveURL(new RegExp(`/${steps()}$`))
  await expect(preview).toHaveCount(1)
  await expect(page.locator('.pm-stage-steps h1').filter({ visible: true })).toBeInViewport()
})

test('an image written in the source, next to its page, loads in both forms, and neither page requests a missing file', async ({ page }) => {
  const missing: string[] = []
  page.on('response', (response) => {
    const navigation = response.request().resourceType() === 'document'
    const html = response.headers()['content-type']?.startsWith('text/html')
    if (response.status() >= 400 || (html && !navigation)) missing.push(`${response.status()} ${response.url()}`)
  })
  const loaded = async (slide: ReturnType<Page['locator']>) => {
    const image = slide.getByRole('img', { name: '听众视图的三种状态：正常、黑屏、冻结' })
    await expect(image).toBeVisible()
    await expect.poll(() => image.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth > 0)).toBe(true)
    await page.waitForLoadState('networkidle')
  }
  await page.goto(slides(steps()))
  await loaded(page.locator('.slidev-layout.pm-stage-steps').filter({ visible: true }))
  await page.goto(`${deck().web}/stage.html`)
  await loaded(page.locator('.pm-section[data-section="stage-steps"]'))
  expect(missing).toEqual([])
})
