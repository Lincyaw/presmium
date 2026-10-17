import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, test } from '@playwright/test'
import { presmium } from './fixtures/deck.ts'
import { SLIDES, WEB } from './urls.ts'

// The demo lecture (examples/demo): it builds to the three media without warnings, as `pnpm demo:build`
// does (on another machine, but those of recordings made in another environment; its headmatter also
// lists the lecture renderer, which is not built by default: it needs a speech engine), and its built
// web form and slides (`pnpm demo:build`, served on WEB and SLIDES) open and page, and its slides export to
// a PDF, a page a slide (C-8; enabled once WP-89e is merged). The features are
// tested on fixture decks of their own; this spec only reads the lecture's sections from its IR, and
// e2e/demo.spec.ts checks the lecture's own examples.
const DEMO = fileURLToPath(new URL('../examples/demo', import.meta.url))
/** `presmium-export` of the publishing plugin, which the lecture lists. */
const EXPORT = fileURLToPath(new URL('../packages/addon-publish/bin/presmium-export.mjs', import.meta.url))
/**
 * The build and the export both write the lecture's Slidev deck, `.presmium/slides` (the slides renderer's work
 * directory, whatever `--out`), and the export serves it while it prints: the two never run at once (a test lock),
 * or the build rewrites the deck under the print page. The export runs on a deck whose Vite dependency cache may be
 * empty (a new checkout, as in a full run): the 书卷 theme has Vite find the addons' dependencies when the server
 * starts (packages/render-slides/theme/setup/vite-plugins.ts), so the print page is not reloaded by a late round of
 * them, which under load lost the PDF's links or left the page hidden until the export timed out. What remains comes
 * from outside: when the host's network changes while the print page loads (a Docker network or container of another
 * test starting, an IPv6 address renewed), Chromium fails the requests in flight with `net::ERR_NETWORK_CHANGED`, the
 * print page cannot load its modules ("Failed to fetch dynamically imported module" for every slide) and the export
 * prints it without its slides or times out waiting for its body. The export is then tried again, as
 * `presmium-export` tells an author to, which Playwright reports as flaky rather than as passed.
 */
const DEMO_DECK = { lock: 'examples/demo/.presmium/slides' }

interface Section { id: string, index: number, title: string, depth: number, steps: number }

async function sections(): Promise<Section[]> {
  return (await (await fetch(`${WEB}/ir.json`)).json() as { sections: Section[] }).sections
}

/**
 * The one warning the build machine brings: the recordings in .presmium/freeze name the environment
 * that made them (the Python version; the browser and the GPU of the shader), and a build in another
 * environment reuses them with this warning (docs/ir.md section 4, examples/demo/README.md). In the
 * environment that recorded them, the build has no warning at all.
 */
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

test.describe('the lecture\'s PDF', () => {
  test.describe.configure({ retries: 2 })

  test('the lecture\'s slides export to a PDF, a page a slide, its links kept (C-8)', DEMO_DECK, async ({ browserName }) => {
    test.skip(browserName !== 'chromium', 'the export runs in Playwright\'s Chromium whatever the browser under test')
    test.setTimeout(900_000)
    const out = mkdtempSync(join(tmpdir(), 'presmium-demo-export-'))
    try {
      const exported = spawnSync(process.execPath, [EXPORT, DEMO, '--output', join(out, 'demo.pdf'), '--json'], { cwd: DEMO, encoding: 'utf8', timeout: 840_000 })
      // A failed export leaves its PDF and its output with the test's results.
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
})

/** The first sections of the lecture in order, each with the next one. */
async function firstTurns(): Promise<[Section, Section][]> {
  const all = await sections()
  return [[all[0]!, all[1]!], [all[1]!, all[2]!]]
}

/**
 * Errors in the browser console that come from Slidev and the browser under test, not from
 * Presmium, with why they stay (docs/architecture.md section 9.3):
 * - Slidev asks for a screen wake lock while the slides are shown (its `wakeLock` option); a browser
 *   driven by Playwright denies it.
 * - Slidev 53 installs the Twoslash popups of @shikijs/vitepress-twoslash 4.5 in every deck; their
 *   patch to the menus of floating-vue 5.4 fails, as the menu component no longer has the shape the
 *   patch expects. The built slides report it on every load, as Slidev's dev server (`presmium dev`,
 *   `slidev export`) does; only dragging over a Twoslash popup is affected, and decks have no
 *   Twoslash code.
 */
const FRAMEWORK_ERRORS = [/^Wake Lock permission request denied$/, /^Failed to patch FloatingVue\b/]

test('the slides open on the cover and page from section to section, with no error in the console', async ({ page }) => {
  const errors: string[] = []
  page.on('console', message => void (message.type() === 'error' && errors.push(message.text())))
  page.on('pageerror', error => void errors.push(error.message))
  const turns = await firstTurns()
  await page.goto(`${SLIDES}/1`)
  await expect(page.locator('.slidev-page-1 h1')).toHaveText(turns[0]![0].title)
  for (const [current, next] of turns) {
    // Past its last step, a slide turns to the next.
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
