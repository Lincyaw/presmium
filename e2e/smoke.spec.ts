import { expect, test } from '@playwright/test'
import { SLIDES } from './urls.ts'

// One slide per IR section: the cover, then the sections of examples/demo/lecture.md in order.
test('slides form opens and navigates', async ({ page }) => {
  await page.goto(`${SLIDES}/1`)
  const cover = page.locator('.slidev-page-1')
  await expect(cover).toBeVisible()
  await expect(cover.locator('h1')).toHaveText('Presmium Demo')
  await expect(cover).toContainText('同一份源码，多种媒介')
  await page.keyboard.press('ArrowRight')
  await expect(page).toHaveURL(/\/2/)
  await expect(page.locator('.slidev-page-2 h1')).toHaveText('宿主适配')
})
