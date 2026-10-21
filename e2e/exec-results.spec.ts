import { expect, test } from '@playwright/test'
import { useFixture } from './fixtures/deck.ts'

test.describe.configure({ mode: 'default' })
const deck = useFixture('exec/results')

for (const form of ['web', 'slides'] as const) {
  test(`${form}: database query values and display output survive a parameter change and appear in the comparison`, async ({ page }) => {
    await page.goto(form === 'web' ? `${deck().web}/#query-results` : `${deck().slides}/${deck().slide('query-results')}`)
    const panel = form === 'web' ? page.locator('.pm-section[data-section="query-results"] .pm-run-panel') : page.locator('.slidev-page').filter({ visible: true }).locator('.pm-run-panel')
    await panel.locator('.pm-run-panel__run').click()
    await expect(panel.locator('.pm-run-panel__stdout')).toHaveText("[('Ada', 37)]", { timeout: 30_000 })
    await expect(panel.locator('.pm-run-panel__html table')).toContainText('教师Ada')
    await panel.locator('input[name="age"]').fill('42')
    await panel.locator('.pm-run-panel__run').click()
    await expect(panel.locator('.pm-run-panel__stdout')).toHaveText("[('Ada', 42)]")
    await expect(panel.locator('.pm-run-panel__diff [data-kind="removed"]')).toContainText("[('Ada', 37)]")
    await expect(panel.locator('.pm-run-panel__diff [data-kind="added"]')).toContainText("[('Ada', 42)]")
  })

  test(`${form}: a teacher can reset a run panel's interpreter and repeat the demonstration from its first result`, async ({ page }) => {
    await page.goto(form === 'web' ? `${deck().web}/#reset-session` : `${deck().slides}/${deck().slide('reset-session')}`)
    const panel = form === 'web' ? page.locator('.pm-section[data-section="reset-session"] .pm-run-panel') : page.locator('.slidev-page').filter({ visible: true }).locator('.pm-run-panel')
    await panel.locator('.pm-run-panel__run').click()
    await expect(panel.locator('.pm-run-panel__stdout')).toHaveText('1', { timeout: 30_000 })
    await panel.locator('.pm-run-panel__run').click()
    await expect(panel.locator('.pm-run-panel__stdout')).toHaveText('2')
    await panel.getByRole('button', { name: '重置会话' }).click()
    await expect(panel).toHaveAttribute('data-runs', '0')
    await expect(panel.locator('.pm-run-panel__output')).toHaveCount(0)
    await panel.locator('.pm-run-panel__run').click()
    await expect(panel.locator('.pm-run-panel__stdout')).toHaveText('1')
  })
}
