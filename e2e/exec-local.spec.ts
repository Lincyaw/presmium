import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { expect, test } from '@playwright/test'
import type { Locator, Page } from '@playwright/test'
import { openDevPage, startDev, useFixture } from './fixtures/deck.ts'

const { strFromU8, unzipSync } = createRequire(new URL('../packages/addon-exec-local/package.json', import.meta.url))('fflate') as {
  strFromU8: (data: Uint8Array) => string
  unzipSync: (data: Uint8Array) => Record<string, Uint8Array>
}

test.describe.configure({ mode: 'default' })
const deck = useFixture('exec-local')
const DEFINITION = readFileSync(new URL('fixtures/exec-local/workspace/.devcontainer/devcontainer.json', import.meta.url), 'utf8')

async function expectExport(page: Page, env: Locator) {
  const [download] = await Promise.all([page.waitForEvent('download'), env.locator('[data-action="replicate"]').click()])
  expect(download.suggestedFilename()).toBe('presmium-env-greet.zip')
  const files = unzipSync(new Uint8Array(readFileSync((await download.path())!)))
  expect(Object.keys(files).sort()).toEqual(['.devcontainer/devcontainer.json', 'README.md', 'src/greet.py'])
  expect(strFromU8(files['.devcontainer/devcontainer.json']!)).toBe(DEFINITION)
  expect(strFromU8(files['src/greet.py']!)).toContain('print(greet("Presmium"))')
  expect(strFromU8(files['README.md']!)).toContain('devcontainer exec --workspace-folder . python3 src/greet.py')
}

test('a built deck shows the snippet, needs the dev server to run it, and exports the environment', async ({ page }) => {
  await page.goto(`${deck().slides}/${deck().slide('exec-local')}`)
  const slide = page.locator('.slidev-page').filter({ has: page.locator('h1', { hasText: '本地环境' }) })
  const env = slide.locator('.pm-local-env')
  await expect(env).toHaveAttribute('data-state', 'disconnected')
  await expect(env.locator('.pm-local-env__notice')).toHaveText('本地环境只在开发服务器中可用')
  await expect(env.locator('pre')).toContainText('print(greet("Presmium"))')
  await expect(env.locator('.pm-local-env__badge')).toHaveText('容器：.devcontainer/devcontainer.json')
  await expect(env.locator('[data-action]')).toHaveCount(1)
  await expectExport(page, env)
  await expect(slide.locator('[data-pm-error]')).toHaveCount(0)
})

test('the web form exports the environment of the snippet', async ({ page }) => {
  await page.goto(`${deck().web}/exec-local.html`)
  const env = page.locator('.pm-local-env').first()
  await expect(env.locator('pre')).toContainText('print(greet("Presmium"))')
  await expectExport(page, env)
})

test('under presmium dev the snippet runs and exports, and nothing writes it back: no commit button, no commit route (D-2)', async ({ page }) => {
  test.setTimeout(300_000)
  const dev = await startDev(deck().dir, 'slides')
  try {
    const env = page.locator('.pm-local-env').filter({ visible: true })
    await openDevPage(page, `${dev.url.replace(/\/$/, '')}/${deck().slide('exec-local')}`, env.locator('[data-action="replicate"]'))
    await expect(env).toHaveAttribute('data-state', 'connected')
    await expect(env.locator('[data-action="run"]')).toHaveCount(1)
    await expect(env.locator('[data-action="commit"]')).toHaveCount(0)
    await expect(env).not.toContainText('提交')
    for (const path of ['/__presmium/presmium.execLocal/commit', '/__presmium/exec-local/commit']) {
      const res = await page.request.post(`${new URL(dev.url).origin}${path}`, { data: { file: 'src/greet.py', content: 'print(1)\n' } })
      expect(res.status(), path).toBe(404)
    }
  } finally {
    await dev.stop()
  }
})
