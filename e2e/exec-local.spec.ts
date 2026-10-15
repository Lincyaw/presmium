import { existsSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { expect, test } from '@playwright/test'
import type { Locator, Page } from '@playwright/test'
import { SLIDES, WEB } from './urls.ts'

// The zip library of the addon, which writes the archives.
const { strFromU8, unzipSync } = createRequire(new URL('../packages/addon-exec-local/package.json', import.meta.url))('fflate') as {
  strFromU8: (data: Uint8Array) => string
  unzipSync: (data: Uint8Array) => Record<string, Uint8Array>
}

// examples/demo/pages/exec-local.md, built by `presmium build`. Running and committing
// need a dev server behind the deck (covered by packages/addon-exec-local/test);
// a built deck shows the snippet and exports the environment archived at compile time.
const DIST = new URL('../examples/demo/dist/', import.meta.url)
const HAS_WEB = existsSync(new URL('web', DIST))
const DEFINITION = readFileSync(new URL('../examples/sample-repo/.devcontainer/devcontainer.json', import.meta.url), 'utf8')

function slideOf(id: string): number {
  const ir = JSON.parse(readFileSync(new URL('ir.json', DIST), 'utf8')) as { sections: { id: string, index: number }[] }
  return ir.sections.find(section => section.id === id)!.index
}

/** Clicks “导出环境” and checks the downloaded archive: the snippet, the devcontainer definition, a README. */
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
  await page.goto(`${SLIDES}/${slideOf('exec-local')}`)
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
  test.skip(!HAS_WEB, 'needs the web build (examples/demo/dist/web)')
  await page.goto(`${WEB}/exec-local.html`)
  const env = page.locator('.pm-local-env').first()
  await expect(env.locator('pre')).toContainText('print(greet("Presmium"))')
  await expectExport(page, env)
})
