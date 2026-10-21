import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { serve } from './fixtures/deck.ts'

const SITE = fileURLToPath(new URL('../site', import.meta.url))
const DOCUMENTS = ['guide', 'plugins', 'reference']

async function runBuild(args: string[]): Promise<{ code: number | null, output: string }> {
  const child = spawn(process.execPath, [join(SITE, 'build.mjs'), ...args], { cwd: SITE, stdio: ['ignore', 'pipe', 'pipe'] })
  let output = ''
  child.stdout.on('data', (chunk: Buffer) => output += chunk)
  child.stderr.on('data', (chunk: Buffer) => output += chunk)
  const code = await new Promise<number | null>(done => child.once('exit', done))
  return { code, output }
}

async function buildDocs(out: string): Promise<string> {
  const { code, output } = await runBuild(['--out', out])
  if (code !== 0) throw new Error(`site/build.mjs exited (${code}):\n${output}`)
  return output
}

function workspace(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), 'presmium-docs-broken-'))
  for (const [path, text] of Object.entries({ 'presmium.workspace.yaml': 'title: Notes\ndocuments: [notes/lecture.md]\n', ...files })) {
    mkdirSync(dirname(join(root, path)), { recursive: true })
    writeFileSync(join(root, path), text)
  }
  mkdirSync(join(root, 'node_modules/@lincyaw'), { recursive: true })
  symlinkSync(fileURLToPath(new URL('../packages/web', import.meta.url)), join(root, 'node_modules/@lincyaw/web'))
  return root
}

async function contents(page: Page): Promise<{ href: string, text: string }[]> {
  const links = page.locator('.VPSidebar a.VPLink')
  await expect(links.first()).toBeVisible()
  return links.evaluateAll(anchors => anchors.map(a => ({ href: new URL((a as HTMLAnchorElement).href).pathname, text: a.textContent?.trim() ?? '' })))
}

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

  test('a link to another document goes to its page in the language of the page that links it', async ({ page }) => {
    await page.goto(`${site.url}/plugins/en/`)
    await page.getByRole('link', { name: 'Interfaces and versions' }).first().click()
    await expect(page).toHaveURL(`${site.url}/reference/en/versions.html`)
    await expect(page.locator('html')).toHaveAttribute('lang', 'en')
    await page.goto(`${site.url}/plugins/`)
    await page.locator('.VPDoc').getByRole('link', { name: '接口与版本' }).click()
    await expect(page).toHaveURL(`${site.url}/reference/versions.html`)
  })

  test('the API reference is generated from the source, under the navigation bar\'s API', async ({ page }) => {
    await page.goto(`${site.url}/reference/en/`)
    await page.locator('.VPNavBar').getByRole('link', { name: 'API', exact: true }).click()
    await expect(page).toHaveURL(`${site.url}/api/`)
    await page.getByRole('link', { name: '@lincyaw/kernel' }).first().click()
    await page.locator('.col-content').getByRole('link', { name: 'index', exact: true }).click()
    await expect(page.getByRole('link', { name: 'KERNEL_VERSION' }).first()).toBeVisible()
    await expect(page.getByRole('link', { name: 'IR_VERSION' }).first()).toBeVisible()
    await page.goBack()
    await page.locator('.col-content').getByRole('link', { name: 'node', exact: true }).click()
    await expect(page.locator('.col-content').getByRole('link', { name: 'copyPublished' })).toBeVisible()
  })
})

test.describe('the documentation site\'s build fails', () => {
  test.describe.configure({ timeout: 300_000 })
  const made: string[] = []
  test.afterAll(() => {
    for (const dir of made) rmSync(dir, { recursive: true, force: true })
  })

  test('on a dead link or an out-of-date translation of a document, before building anything', async () => {
    const root = workspace({
      'notes/lecture.md': '---\ntitle: 笔记\ntranslations: { en: lecture.en.md }\n---\n\n(notes)=\n# 笔记\n\n见[缺少的文件](missing.md)。\n',
      'notes/lecture.en.md': '---\ntitle: Notes\nlang: en\ntranslationOf: { entry: lecture.md, digest: abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789 }\n---\n\n(notes)=\n# Notes\n\nSee the file.\n',
    })
    made.push(root)
    const { code, output } = await runBuild(['--site', root, '--out', join(root, 'dist')])
    expect(code, output).toBe(1)
    expect(output).toMatch(/^notes\/lecture\.md:9 {2}error {2}missing\.md: no such file {2}\(presmium\.links\)$/m)
    expect(output).toMatch(/^notes\/lecture\.en\.md:\d+ {2}warning {2}translation "en" \(lecture\.en\.md\) is out of date: .* \(presmium\.translations\)$/m)
    expect(output).toContain('the publication checks found 2 problems')
    expect(existsSync(join(root, 'dist'))).toBe(false)
  })

  test('on a link of a built page to no file of the site', async () => {
    const root = workspace({
      'presmium.workspace.yaml': 'title: Notes\ndocuments: [notes/lecture.md]\nsite:\n  nav:\n    - { text: Missing, link: /nowhere/ }\n',
      'notes/lecture.md': '---\ntitle: Notes\nlang: en\n---\n\n(notes)=\n# Notes\n\nA page.\n',
    })
    made.push(root)
    const { code, output } = await runBuild(['--site', root, '--out', join(root, 'dist')])
    expect(code, output).toBe(1)
    expect(output).toContain('checked notes/lecture.md: no problems')
    expect(output).toContain('dead link: /index.html -> /nowhere/')
    expect(output).toContain('dead link: /notes/index.html -> ../nowhere/')
    expect(output).toMatch(/^\d+ dead links in the built site$/m)
  })
})
