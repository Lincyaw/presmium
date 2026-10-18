// The documentation site (WP-93c: P-144, P-145, P-123 in workspace sites), built in `beforeAll` by its own build
// (site/build.mjs: the publication checks of every document and translation, `presmium build` of the workspace,
// TypeDoc, a link check of the built pages) into a temporary directory, and served from there.
import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { serve } from './fixtures/deck.ts'

const SITE = fileURLToPath(new URL('../site', import.meta.url))
/** The documents of the site, each written in Chinese and translated into English. */
const DOCUMENTS = ['guide', 'plugins', 'reference']

/** Runs the site's build into `out` and resolves with its output; fails with it. */
async function buildDocs(out: string): Promise<string> {
  const child = spawn(process.execPath, [join(SITE, 'build.mjs'), '--out', out], { cwd: SITE, stdio: ['ignore', 'pipe', 'pipe'] })
  let output = ''
  child.stdout.on('data', (chunk: Buffer) => output += chunk)
  child.stderr.on('data', (chunk: Buffer) => output += chunk)
  const code = await new Promise<number | null>(done => child.once('exit', done))
  if (code !== 0) throw new Error(`site/build.mjs exited (${code}):\n${output}`)
  return output
}

/** The links of a document page's sidebar: its table of contents. */
async function contents(page: Page): Promise<{ href: string, text: string }[]> {
  const links = page.locator('.VPSidebar a.VPLink')
  await expect(links.first()).toBeVisible()
  return links.evaluateAll(anchors => anchors.map(a => ({ href: new URL((a as HTMLAnchorElement).href).pathname, text: a.textContent?.trim() ?? '' })))
}

/** Switches the page's language with the navigation bar's language menu. */
async function switchTo(page: Page, language: string) {
  const menu = page.locator('.VPNavBarTranslations')
  await expect(async () => {
    await menu.getByRole('button').hover()
    await menu.getByRole('link', { name: language }).click({ timeout: 2000 })
  }).toPass({ timeout: 20_000 })
}

test.describe('the documentation site', () => {
  test.describe.configure({ mode: 'serial', timeout: 120_000 })
  let out: string
  let report: string
  let site: { url: string, close(): Promise<void> }

  test.beforeAll(async () => {
    test.setTimeout(900_000)
    out = mkdtempSync(join(tmpdir(), 'presmium-docs-'))
    report = await buildDocs(out)
    site = await serve(join(out, 'web'))
  })
  test.afterAll(async () => {
    await site?.close()
    if (out) rmSync(out, { recursive: true, force: true })
  })

  test('the build checks every document and its translation, and the built site has no dead link', () => {
    for (const dir of DOCUMENTS) {
      for (const entry of ['lecture.md', 'lecture.en.md']) expect(report).toContain(`checked ${dir}/${entry}: no problems`)
    }
    expect(report).toMatch(/^== links: \d+ pages$/m)
    expect(report).toContain('no dead links')
  })

  test('each document has the complete table of contents in both languages', async ({ page }) => {
    for (const dir of DOCUMENTS) {
      await page.goto(`${site.url}/${dir}/`)
      await expect(page.locator('html')).toHaveAttribute('lang', 'zh-CN')
      const chinese = await contents(page)
      expect(chinese.length, dir).toBeGreaterThan(3)
      await page.goto(`${site.url}/${dir}/en/`)
      await expect(page.locator('html')).toHaveAttribute('lang', 'en')
      const english = await contents(page)
      // Every chapter and section, at the same place under /en/, with an English title.
      expect(english.map(link => link.href)).toEqual(chinese.map(link => link.href.replace(`/${dir}/`, `/${dir}/en/`)))
      for (const { text } of english) expect(text, dir).not.toMatch(/[一-鿿]/)
    }
  })

  test('the home page has an English version that lists the documents in English', async ({ page }) => {
    await page.goto(`${site.url}/`)
    await expect(page.locator('.pm-site-home__title')).toHaveText('Presmium 文档')
    await expect(page.getByRole('link', { name: '作者指南' })).toBeVisible()
    await switchTo(page, 'English')
    await expect(page).toHaveURL(`${site.url}/en/`)
    await expect(page.locator('.pm-site-home__title')).toHaveText('Presmium documentation')
    for (const title of ['Author guide', 'Plugin guide', 'Interfaces and versions']) await expect(page.getByRole('link', { name: title })).toBeVisible()
    await page.getByRole('link', { name: 'Author guide' }).click()
    await expect(page).toHaveURL(`${site.url}/guide/en/`)
    await expect(page.locator('h1').first()).toContainText('Author guide')
  })

  test('a chapter\'s language menu stays on the chapter', async ({ page }) => {
    await page.goto(`${site.url}/plugins/plugin-testing.html`)
    await expect(page.locator('h1').first()).toContainText('插件测试')
    await switchTo(page, 'English')
    await expect(page).toHaveURL(`${site.url}/plugins/en/plugin-testing.html`)
    await expect(page.locator('h1').first()).toContainText('Testing plugins')
    await switchTo(page, '中文')
    await expect(page).toHaveURL(`${site.url}/plugins/plugin-testing.html`)
  })

  test('the API reference is generated from the source, under the navigation bar\'s API', async ({ page }) => {
    await page.goto(`${site.url}/reference/en/`)
    await page.locator('.VPNavBar').getByRole('link', { name: 'API', exact: true }).click()
    await expect(page).toHaveURL(`${site.url}/api/`)
    await page.getByRole('link', { name: '@presmium/kernel' }).first().click()
    await expect(page.getByRole('link', { name: 'KERNEL_VERSION' }).first()).toBeVisible()
    await expect(page.getByRole('link', { name: 'IR_VERSION' }).first()).toBeVisible()
  })
})
