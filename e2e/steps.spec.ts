import { expect, test } from '@playwright/test'
import { useFixture } from './fixtures/deck.ts'

const deck = useFixture('steps')
test('Markdown results replace each other and restore on backward navigation in both forms', async ({ page }) => {
  for (const form of ['web', 'slides']) {
    await page.goto(form === 'web' ? `${deck().web}/?view=present&section=values` : `${deck().slides}/${deck().slide('values')}`)
    const parent = page.locator(form === 'web' ? '.pm-present' : `.slidev-page-${deck().slide('values')}`).first()
    const blocks = [parent.locator('[data-block="result-one"]'), parent.locator('[data-block="result-two"]'), parent.locator('[data-block="result-three"]')]
    for (const [turn, step] of [0, 1, 2, 1, 0].entries()) {
      for (const [i, block] of blocks.entries()) {
        if (i === step) await expect(block).toBeVisible()
        else if (form === 'slides') await expect(block.locator('.slidev-vclick-target').first()).toHaveClass(/slidev-vclick-hidden/)
        else await expect(block).toBeHidden()
      }
      const active = blocks[step]!
      const top = await active.evaluate(element => element.getBoundingClientRect().top)
      expect(top).toBeLessThan(350)
      if (turn < 4) await page.keyboard.press(turn < 2 ? 'ArrowRight' : 'ArrowLeft')
    }
  }
})
