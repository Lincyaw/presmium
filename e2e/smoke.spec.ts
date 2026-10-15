import { expect, test } from '@playwright/test'
import { SLIDES } from './urls.ts'

test('slides form opens and navigates', async ({ page }) => {
  await page.goto(`${SLIDES}/1`)
  await expect(page.locator('.slidev-page-1')).toBeVisible()
  await page.keyboard.press('ArrowRight')
  await expect(page).toHaveURL(/\/2/)
})
