import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, test } from '@playwright/test'
import { presmium } from './fixtures/deck.ts'
import { SLIDES, WEB } from './urls.ts'

// The demo lecture (examples/demo): it builds to every medium without warnings, and its built web
// form and slides (`pnpm demo:build`, served on WEB and SLIDES) open and page. The features are
// tested on fixture decks of their own; this spec only reads the lecture's sections from its IR.
const DEMO = fileURLToPath(new URL('../examples/demo', import.meta.url))

interface Section { id: string, index: number, title: string, depth: number, steps: number }

async function sections(): Promise<Section[]> {
  return (await (await fetch(`${WEB}/ir.json`)).json() as { sections: Section[] }).sections
}

test('the lecture builds to the web, the slides and a notebook without warnings', async ({ browserName }) => {
  test.skip(browserName !== 'chromium', 'the build does not depend on the browser')
  test.setTimeout(600_000)
  const out = mkdtempSync(join(tmpdir(), 'presmium-demo-'))
  try {
    const report = await presmium(['build', '--out', out], DEMO)
    expect(report).toMatch(/^0 errors, 0 warnings\b/m)
    expect(existsSync(join(out, 'web/index.html'))).toBe(true)
    expect(existsSync(join(out, 'slides/index.html'))).toBe(true)
    const notebook = JSON.parse(readFileSync(join(out, 'notebook/lecture.ipynb'), 'utf8')) as { cells: { metadata: { presmium?: { section: string } } }[] }
    const ids = (await sections()).map(section => section.id)
    expect(new Set(notebook.cells.map(cell => cell.metadata.presmium?.section))).toEqual(new Set(ids))
  } finally {
    rmSync(out, { recursive: true, force: true })
  }
})

/** The first sections of the lecture in order, each with the next one. */
async function firstTurns(): Promise<[Section, Section][]> {
  const all = await sections()
  return [[all[0]!, all[1]!], [all[1]!, all[2]!]]
}

test('the slides open on the cover and page from section to section', async ({ page }) => {
  const turns = await firstTurns()
  await page.goto(`${SLIDES}/1`)
  await expect(page.locator('.slidev-page-1 h1')).toHaveText(turns[0]![0].title)
  for (const [current, next] of turns) {
    // Past its last step, a slide turns to the next.
    for (let step = 0; step <= current.steps; step++) await page.keyboard.press('ArrowRight')
    await expect(page).toHaveURL(new RegExp(`/${next.index}(\\?|$)`))
    await expect(page.locator(`.slidev-page-${next.index} h1`)).toHaveText(next.title)
  }
})

test('the web form opens on the cover, goes to a section from the sidebar and pages in the present view', async ({ page }) => {
  const all = await sections()
  const cover = all[0]!
  await page.goto(WEB)
  await expect(page.locator(`.pm-section[data-section="${cover.id}"]`)).toContainText(cover.title)

  // A section of the first chapter, which has a page of its own.
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
