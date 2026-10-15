import { expect, test } from '@playwright/test'
import { SLIDES } from './urls.ts'

// examples/demo/pages/exec-local.md declares `routeAlias: exec-local`.
// The local environment works only in the dev server; its endpoints are
// covered by packages/addon-exec-local/test. A built deck shows the snippet alone.
test('a built deck shows the snippet and explains that the local environment needs the dev server', async ({ page }) => {
  await page.goto(`${SLIDES}/exec-local`)
  const slide = page.locator('.slidev-layout.pm-exec-local').first()
  await expect(slide.locator('h1')).toHaveText('本地环境')

  const env = slide.locator('.pm-local-env')
  await expect(env).toHaveAttribute('data-state', 'disconnected')
  await expect(env.locator('.pm-local-env__notice')).toHaveText('本地环境只在开发服务器中可用')
  await expect(env.locator('pre')).toContainText('print(greet("Presmium"))')
  await expect(env.locator('[data-action]')).toHaveCount(0)
  await expect(slide.locator('[data-pm-error]')).toHaveCount(0)
})
