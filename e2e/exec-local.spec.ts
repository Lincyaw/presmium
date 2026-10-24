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

test('the web form exports the environment of the snippet', async ({ page }) => {
  await page.goto(`${deck().web}/exec-local.html`)
  const env = page.locator('.pm-local-env').first()
  await expect(env.locator('pre')).toContainText('print(greet("Presmium"))')
  await expectExport(page, env)
})
