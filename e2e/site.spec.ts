// The course site (WP-86: P-78, P-79, P-123, P-122 增补), on sites the real `presmium build` makes in `beforeAll`.
// A deck (e2e/fixtures/site/deck) with the site shell of `renderers.web`, local files its body and raw HTML link,
// and an English translation; a workspace (e2e/fixtures/site/workspace) whose home page is one of its two
// documents, with search and the doc footer across them. WP-81e2: a hidden directory is not published (and
// presmium check says so); text of raw HTML that only looks like an attribute is not; the site of a workspace
// says it leaves out a document's translation. WP-89f: linked Markdown files are files, not pages (F-24); a link to
// another document's lecture.md opens its page, and no build publishes a document's source (F-25).
import { spawnSync } from 'node:child_process'
import { cpSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import type { IRDocument } from '../packages/kernel/src/ir.ts'
import { deckDir, presmium, serve } from './fixtures/deck.ts'

const FIXTURES = fileURLToPath(new URL('./fixtures/site', import.meta.url))
const PRESMIUM = fileURLToPath(new URL('../packages/cli/bin/presmium.mjs', import.meta.url))

/** A built site: its directory, the build report and the server of its `dist/`. */
interface Built {
  dir: string
  report: string
  url: string
  close(): Promise<void>
}

async function buildSite(fixture: string, args: string[], served: string, single?: string): Promise<Built> {
  const dir = deckDir(`site-${fixture}`)
  try {
    cpSync(join(FIXTURES, fixture), dir, { recursive: true })
    const report = await presmium(['build', ...args], dir)
    const server = await serve(join(dir, served), single)
    return {
      dir,
      report,
      url: server.url,
      async close() {
        await server.close()
        rmSync(dir, { recursive: true, force: true })
      },
    }
  } catch (error) {
    rmSync(dir, { recursive: true, force: true })
    throw error
  }
}

/** The body of the file a link of the page names. */
async function download(page: Page, href: string | null): Promise<Buffer> {
  expect(href).toBeTruthy()
  const response = await page.request.get(new URL(href!, page.url()).href)
  expect(response.status()).toBe(200)
  return response.body()
}

/** Opens the search box with its shortcut, again until the page has hydrated and takes it. */
async function openSearch(page: Page) {
  const input = page.getByRole('searchbox')
  await expect(async () => {
    if (!await input.isVisible()) await page.keyboard.press('Control+k')
    await expect(input).toBeFocused({ timeout: 500 })
  }).toPass({ timeout: 10_000 })
  return input
}

test.describe('a deck with a site shell, published files and a translation', () => {
  test.describe.configure({ mode: 'serial', timeout: 120_000 })
  let site: Built

  test.beforeAll(async () => {
    test.setTimeout(600_000)
    site = await buildSite('deck', ['--to', 'web,slides'], 'dist', '/slides/')
  })
  test.afterAll(async () => {
    await site?.close()
  })

  test('the web form has a navigation bar, a footer, Open Graph data and a sitemap', async ({ page }) => {
    await page.goto(`${site.url}/web/chapter2.html`)
    await expect(page.locator('.VPNavBar').getByRole('link', { name: '课程主页' })).toHaveAttribute('href', 'https://course.example.edu/')
    await expect(page.locator('.VPNavBar').getByRole('link', { name: '第二章' })).toHaveAttribute('href', '/web/chapter2.html')
    await expect(page.locator('.pm-site-footer')).toContainText('课程资料按 CC BY 4.0 发布')
    await expect(page.locator('.pm-site-footer')).toContainText('2026 课程组')
    await expect(page.locator('meta[property="og:title"]')).toHaveAttribute('content', /第二章 深入/)
    await expect(page.locator('meta[property="og:description"]')).toHaveAttribute('content', '一门检查站点外壳的课程')
    const image = await page.locator('meta[property="og:image"]').getAttribute('content')
    expect(image).toMatch(/^https:\/\/course\.example\.edu\/web\/media\/[\da-f]{8}-cover\.png$/)
    expect((await page.request.get(`${site.url}${new URL(image!).pathname}`)).status()).toBe(200)
    const sitemap = await page.request.get(`${site.url}/web/sitemap.xml`)
    expect(sitemap.status()).toBe(200)
    expect(await sitemap.text()).toContain('<loc>https://course.example.edu/web/chapter2.html</loc>')
  })

  test('a starter file the body links downloads from the web form and the slides; a linked directory opens its file listing; a raw HTML video\'s poster loads', async ({ page }) => {
    const starter = readFileSync(join(site.dir, 'starter/main.py'))
    await page.goto(`${site.url}/web/start.html`)
    const section = page.locator('.pm-section[data-section="starter"]')
    expect(await download(page, await section.getByRole('link', { name: '起始代码', exact: true }).getAttribute('href'))).toEqual(starter)
    const poster = await section.locator('video').getAttribute('poster')
    expect(poster).toMatch(/^\/web\/media\/[\da-f]{8}-cover\.png$/)
    expect(await download(page, poster)).toEqual(readFileSync(join(site.dir, 'media/cover.png')))

    // The directory opens at its file listing, from which each file downloads.
    await section.getByRole('link', { name: '整个起始目录', exact: true }).click()
    await expect(page).toHaveURL(/\/web\/media\/[\da-f]{8}-starter\/(?:index\.html)?$/)
    await expect(page.getByRole('heading', { name: 'starter/' })).toBeVisible()
    const saved = page.waitForEvent('download')
    await page.getByRole('link', { name: 'data.csv' }).click()
    expect(readFileSync((await (await saved).path())!)).toEqual(readFileSync(join(site.dir, 'starter/data.csv')))

    // The slides publish the same file, and the listing too.
    const doc = JSON.parse(readFileSync(join(site.dir, 'dist/ir.json'), 'utf8')) as IRDocument
    const slide = doc.sections.find(s => s.id === 'starter')!.index
    await page.goto(`${site.url}/slides/${slide}`)
    const content = page.locator('.slidev-page').filter({ has: page.locator('h1', { hasText: '起始代码' }) })
    expect(await download(page, await content.getByRole('link', { name: '起始代码', exact: true }).getAttribute('href'))).toEqual(starter)
    const listing = await download(page, await content.getByRole('link', { name: '整个起始目录', exact: true }).getAttribute('href'))
    expect(listing.toString()).toContain('data.csv')
    expect(await download(page, await content.locator('video').getAttribute('poster'))).toEqual(readFileSync(join(site.dir, 'media/cover.png')))
  })

  test('a linked Markdown template and the README of a linked directory are published as files, not built as pages (F-24)', async ({ page }) => {
    // Their HTML-like placeholders (`<answer>`, `<placeholder>`) and `{{ x }}` would fail the build as Vue templates.
    await page.goto(`${site.url}/web/start.html`)
    const section = page.locator('.pm-section[data-section="starter"]')
    expect(await download(page, await section.getByRole('link', { name: '报告模板', exact: true }).getAttribute('href'))).toEqual(readFileSync(join(site.dir, 'kit/report.md')))
    await section.getByRole('link', { name: '实验工具包', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'kit/' })).toBeVisible()
    expect(await download(page, await page.getByRole('link', { name: 'README.md' }).getAttribute('href'))).toEqual(readFileSync(join(site.dir, 'kit/README.md')))
    // The only pages under media/ are the file listings of the directories.
    const media = readdirSync(join(site.dir, 'dist/web/media'), { recursive: true, encoding: 'utf8' })
    expect(media.filter(file => file.endsWith('.md')).length).toBeGreaterThanOrEqual(2)
    expect(media.filter(file => file.endsWith('.html') && !/(?:^|\/)index\.html$/.test(file))).toEqual([])
  })

  test('a local link that cannot be published is a warning on its line in the build report, once for the two forms; a hidden directory is not published', () => {
    const lines = readFileSync(join(site.dir, 'lecture.md'), 'utf8').split('\n')
    const line = (text: string) => lines.findIndex(own => own.includes(text)) + 1
    const missing = new RegExp(`^lecture\\.md:${line('handouts/missing.pdf')}  warning  handouts/missing\\.pdf is not published: there is no such file  \\(presmium\\.links\\)$`, 'gm')
    expect(site.report.match(missing)).toHaveLength(1)
    const hidden = new RegExp(`^lecture\\.md:${line('(.handouts/)')}  warning  \\.handouts/ is not published: hidden directories and node_modules are not published  \\(presmium\\.links\\)$`, 'gm')
    expect(site.report.match(hidden)).toHaveLength(1)
    for (const form of ['dist/web/media', 'dist/slides']) expect(readdirSync(join(site.dir, form), { recursive: true, encoding: 'utf8' }).filter(file => file.includes('answers.txt'))).toEqual([])
    // presmium check says so too, on the same line (its broken links are errors: it exits 1).
    const checked = spawnSync(process.execPath, [PRESMIUM, 'check', '--json'], { cwd: site.dir, encoding: 'utf8' })
    const { findings } = JSON.parse(checked.stdout) as { findings: { checkId: string, message: string, source: { line: number } }[] }
    expect(findings).toContainEqual(expect.objectContaining({ checkId: 'presmium.links', message: '.handouts/: hidden directories and node_modules are not published', source: expect.objectContaining({ line: line('(.handouts/)') }) }))
    // Raw HTML is parsed: ` href=not-a-file.txt` in the text of a `<code>` is no attribute, so nothing is published for it.
    expect(site.report).not.toContain('not-a-file.txt')
  })

  test('text in raw HTML that only looks like an attribute stays as written', async ({ page }) => {
    await page.goto(`${site.url}/web/start.html`)
    await expect(page.locator('.pm-section[data-section="practice"] code').filter({ hasText: 'not-a-file' })).toHaveText('href=not-a-file.txt')
  })

  test('switching a Chinese deck to English on its second chapter stays on the second chapter', async ({ page }) => {
    await page.goto(`${site.url}/web/chapter2.html`)
    await expect(page.locator('h1#chapter2')).toContainText('第二章 深入')
    const menu = page.locator('.VPNavBarTranslations')
    await expect(async () => {
      await menu.getByRole('button').hover()
      await menu.getByRole('link', { name: 'English' }).click({ timeout: 2000 })
    }).toPass({ timeout: 20_000 })
    await expect(page).toHaveURL(/\/web\/en\/chapter2\.html$/)
    await expect(page.locator('h1#chapter2')).toContainText('Chapter 2 Going deeper')
    await expect(page.locator('html')).toHaveAttribute('lang', 'en')
    await expect(page.locator('.pm-section[data-section="deep"]')).toContainText('nautilus')
  })
})

test.describe('a workspace site', () => {
  test.describe.configure({ mode: 'serial', timeout: 120_000 })
  let site: Built

  test.beforeAll(async () => {
    test.setTimeout(600_000)
    site = await buildSite('workspace', [], 'dist/web')
  })
  test.afterAll(async () => {
    await site?.close()
  })

  test('a document\'s translation is not in the workspace site, and the build says so at its headmatter', () => {
    expect(site.report).toMatch(/^week2\/lecture\.md:3  warning  translation "en" \(lecture\.en\.md\) is not in the workspace site: a workspace site does not build the translations of its documents yet; build this document alone \(presmium build week2\) to publish it  \(presmium\.translations\)$/m)
  })

  test('the home page shows the document the configuration names', async ({ page }) => {
    await page.goto(`${site.url}/`)
    await expect(page).toHaveURL(`${site.url}/week1/`)
    await expect(page.locator('h1')).toContainText('第 1 周')
    await expect(page.locator('.VPNavBar').getByRole('link', { name: '第 2 周' })).toHaveAttribute('href', '../week2/')
    const sitemap = await (await page.request.get(`${site.url}/sitemap.xml`)).text()
    expect(sitemap).toContain('<loc>https://course.example.edu/week2/</loc>')
  })

  test('a word only another document holds is found, and opens that document', async ({ page }) => {
    await page.goto(`${site.url}/week1/`)
    const input = await openSearch(page)
    await input.fill('鹦鹉螺')
    const first = page.getByRole('listbox').getByRole('option').first()
    await expect(first.getByRole('link')).toHaveAttribute('aria-label', /^第 2 周 > /)
    await first.click()
    await expect(page).toHaveURL(`${site.url}/week2/#w2-shells`)
    await expect(page.locator('h2#w2-shells')).toBeInViewport()
  })

  test('a link to another document\'s lecture.md opens that document\'s page at the section; no document\'s source is published (F-25)', async ({ page }) => {
    await page.goto(`${site.url}/week1/`)
    const link = page.locator('.pm-section[data-section="w1-basics"]').getByRole('link', { name: '第 2 周的螺线' })
    await expect(link).toHaveAttribute('href', '/week2/w2-more.html#w2-spiral')
    await link.click()
    await expect(page).toHaveURL(`${site.url}/week2/w2-more.html#w2-spiral`)
    await expect(page.locator('h2#w2-spiral')).toBeInViewport()
    expect(readdirSync(join(site.dir, 'dist'), { recursive: true, encoding: 'utf8' }).filter(file => file.endsWith('lecture.md'))).toEqual([])
  })

  test('the linking document built for students holds none of the linked document\'s teacher sentences, nor its source; the build says the link stays as written (F-25)', async () => {
    const out = join(site.dir, 'student')
    const report = await presmium(['build', 'week1', '--audience', 'student', '--to', 'web', '--out', out], site.dir)
    expect(report).toMatch(/^week1\/lecture\.md:12 {2}warning {2}\.\.\/week2\/lecture\.md#w2-spiral is not published: it is the source of the document .*week2, which a workspace site links as its page; this build keeps the link as written {2}\(presmium\.links\)$/m)
    const files = readdirSync(out, { recursive: true, encoding: 'utf8' })
    expect(files.filter(file => file.endsWith('lecture.md'))).toEqual([])
    const teacher = '先在黑板上画一条阿基米德螺线做对比'
    expect(files.filter(file => statSync(join(out, file)).isFile() && readFileSync(join(out, file), 'utf8').includes(teacher))).toEqual([])
  })

  test('the next chapter after the first document\'s last chapter is the second document', async ({ page }) => {
    await page.goto(`${site.url}/week1/w1-review.html`)
    const next = page.getByRole('link', { name: /^下一章/ })
    await expect(next).toContainText('第 2 周')
    await next.click()
    await expect(page).toHaveURL(`${site.url}/week2/`)
    await expect(page.locator('h1')).toContainText('第 2 周')
    await expect(page.getByRole('link', { name: /^上一章/ })).toContainText('第 1 周的复习')
  })
})
