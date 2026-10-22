import { spawnSync } from 'node:child_process'
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, test } from '@playwright/test'
import { deckDir, presmium } from './fixtures/deck.ts'
import { SLIDES, WEB } from './urls.ts'

const DEMO = fileURLToPath(new URL('../e2e/fixtures/regression', import.meta.url))
const EXPORT = fileURLToPath(new URL('../packages/addon-publish/bin/presmium-export.mjs', import.meta.url))
const PRINT = fileURLToPath(new URL('./fixtures/print', import.meta.url))
const DEMO_DECK = { lock: 'e2e/fixtures/regression/.presmium/slides' }

interface Section { id: string, index: number, title: string, depth: number, steps: number }

async function sections(): Promise<Section[]> {
  return (JSON.parse(readFileSync(join(DEMO, 'dist/web/ir.json'), 'utf8')) as { sections: Section[] }).sections
}

const RECORDED_ELSEWHERE = /\swarning\s+block \S+: its recorded output was made with "[^"]*", this build has "[^"]*"; the recording is reused/

test('the lecture builds to the web, the slides and a notebook without warnings', DEMO_DECK, async ({ browserName }) => {
  test.skip(browserName !== 'chromium', 'the build does not depend on the browser')
  test.setTimeout(600_000)
  const out = mkdtempSync(join(tmpdir(), 'presmium-demo-'))
  try {
    const report = await presmium(['build', '--to', 'web,slides,notebook', '--out', out], DEMO)
    expect(report).toMatch(/^0 errors, \d+ warnings\b/m)
    const warnings = report.split('\n').filter(line => /^\S*\s{2}warning\s{2}/.test(line))
    const elsewhere = warnings.filter(line => RECORDED_ELSEWHERE.test(line))
    for (const line of elsewhere) test.info().annotations.push({ type: 'recorded elsewhere', description: line })
    expect(warnings.filter(line => !elsewhere.includes(line))).toEqual([])
    expect(report).toMatch(new RegExp(`^0 errors, ${elsewhere.length} warnings\\b`, 'm'))
    expect(existsSync(join(out, 'web/index.html'))).toBe(true)
    expect(existsSync(join(out, 'slides/index.html'))).toBe(true)
    const notebook = JSON.parse(readFileSync(join(out, 'notebook/lecture.ipynb'), 'utf8')) as { cells: { metadata: { presmium?: { section: string } } }[] }
    const ids = (await sections()).map(section => section.id)
    expect(new Set(notebook.cells.map(cell => cell.metadata.presmium?.section))).toEqual(new Set(ids))
  } finally {
    rmSync(out, { recursive: true, force: true })
  }
})

test('the lecture\'s slides export to a PDF, a page a slide, its links kept', DEMO_DECK, async ({ browserName }) => {
  test.skip(browserName !== 'chromium', 'the export runs in Playwright\'s Chromium whatever the browser under test')
  test.setTimeout(900_000)
  const out = mkdtempSync(join(tmpdir(), 'presmium-demo-export-'))
  try {
    const exported = spawnSync(process.execPath, [EXPORT, DEMO, '--output', join(out, 'demo.pdf'), '--json'], { cwd: DEMO, encoding: 'utf8', timeout: 840_000 })
    if (exported.status !== 0) {
      if (existsSync(join(out, 'demo.pdf'))) await test.info().attach('demo.pdf', { path: join(out, 'demo.pdf'), contentType: 'application/pdf' })
      await test.info().attach('presmium-export', { body: `${exported.stdout}\n${exported.stderr}`, contentType: 'text/plain' })
    }
    expect(exported.status, `${exported.stdout}\n${exported.stderr}`).toBe(0)
    const report = JSON.parse(exported.stdout) as { format: string, pages: number, links: { url: string, pages: number[] }[] }
    expect(report.format).toBe('pdf')
    expect(report.pages).toBe((await sections()).length)
    expect(report.links.filter(link => link.pages.length === 0)).toEqual([])
    expect(readFileSync(join(out, 'demo.pdf')).subarray(0, 5).toString()).toBe('%PDF-')
  } finally {
    rmSync(out, { recursive: true, force: true })
  }
})

test('the export waits for the print page to show every slide, and loads it again when a request of the page fails', async ({ browserName }) => {
  test.skip(browserName !== 'chromium', 'the export runs in Playwright\'s Chromium whatever the browser under test')
  test.setTimeout(300_000)
  const dir = deckDir('print')
  try {
    cpSync(PRINT, dir, { recursive: true })
    const exported = spawnSync(process.execPath, [EXPORT, dir, '--output', join(dir, 'print.pdf'), '--json'], { cwd: dir, encoding: 'utf8', timeout: 240_000 })
    expect(exported.status, `${exported.stdout}\n${exported.stderr}`).toBe(0)
    const report = JSON.parse(exported.stdout) as { pages: number, links: { url: string, pages: number[] }[] }
    expect(report.pages).toBe(2)
    expect(report.links.map(link => [link.url, link.pages])).toEqual([['https://example.com/one', [1]], ['https://example.com/two', [2]]])
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

async function firstTurns(): Promise<[Section, Section][]> {
  const all = await sections()
  return [[all[0]!, all[1]!], [all[1]!, all[2]!]]
}

const FRAMEWORK_ERRORS = [/^Wake Lock permission request denied$/, /^Failed to patch FloatingVue\b/]

test('the slides open on the cover and page from section to section, with no error in the console', async ({ page }) => {
  const errors: string[] = []
  page.on('console', message => void (message.type() === 'error' && errors.push(message.text())))
  page.on('pageerror', error => void errors.push(error.message))
  const turns = await firstTurns()
  await page.goto(`${SLIDES}/1`)
  await expect(page.locator('.slidev-page-1 h1')).toHaveText(turns[0]![0].title)
  for (const [current, next] of turns) {
    for (let step = 0; step <= current.steps; step++) await page.keyboard.press('ArrowRight')
    await expect(page).toHaveURL(new RegExp(`/${next.index}(\\?|$)`))
    await expect(page.locator(`.slidev-page-${next.index} h1`)).toHaveText(next.title)
  }
  expect(errors.filter(text => !FRAMEWORK_ERRORS.some(known => known.test(text)))).toEqual([])
})

test('the web form opens on the cover, goes to a section from the sidebar and pages in the present view', async ({ page }) => {
  const all = await sections()
  const cover = all[0]!
  await page.goto(WEB)
  await expect(page.locator(`.pm-section[data-section="${cover.id}"]`)).toContainText(cover.title)

  const section = all.find(s => s.depth === 2)!
  await page.getByRole('navigation').getByRole('link', { name: section.title, exact: true }).first().click()
  await expect(page).not.toHaveURL(`${WEB}/`)
  await expect(page.locator(`.pm-section[data-section="${section.id}"]`)).toBeVisible()

  await page.goto(`${WEB}/?view=present&section=${encodeURIComponent(cover.id)}`)
  const present = page.getByRole('region', { name: '放映' })
  await expect(present).toHaveAttribute('data-section', cover.id)
  for (const [current, next] of await firstTurns()) {
    for (let step = 0; step <= current.steps; step++) await page.keyboard.press('ArrowRight')
    await expect(present).toHaveAttribute('data-section', next.id)
  }
})
