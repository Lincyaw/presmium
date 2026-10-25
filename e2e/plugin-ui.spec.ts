import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { lowContrast } from './fixtures/contrast.ts'
import { useFixture } from './fixtures/deck.ts'
import { startClassroomServer } from './fixtures/plugins/decks.ts'

const LINK = { '@lincyaw/addon-assistant': 'packages/addon-assistant', '@lincyaw/host': 'packages/host' }

async function scheme(page: Page, dark: boolean): Promise<void> {
  await page.addInitScript((on) => {
    localStorage.setItem('presmium-appearance', on ? 'dark' : 'light')
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
    with: ['host/plugin'],
    link: LINK,
    edit: (dir) => {
      const file = join(dir, 'lecture.md')
      writeFileSync(file, readFileSync(file, 'utf8').replace('renderers:', `presmium:\n  presmium.session:\n    server: ${classroom!.url}\nrenderers:`))
    },
  })

  const RUNTIME = { timeout: 180_000 }

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
