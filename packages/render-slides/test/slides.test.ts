// `presmium build --to slides` on real decks, then `slidev export` on the Slidev deck it leaves (WP-41).
// The fixture decks stay in place (their .presmium/ is ignored) so the generated deck resolves
// Slidev, its theme and playwright-chromium from this package's node_modules.
import { createReadStream, existsSync, lstatSync, mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, extname, join, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { presmium, run } from '@presmium/cli/testing'
import { PDFDocument } from 'pdf-lib'
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { chromium } from 'playwright-chromium'
import { afterAll, expect, it } from 'vitest'

const DECK = fileURLToPath(new URL('./fixtures/deck', import.meta.url))
const EXPORT_DECK = fileURLToPath(new URL('./fixtures/export', import.meta.url))
const MYST_DECK = fileURLToPath(new URL('./fixtures/myst', import.meta.url))
const TRACE_DECK = fileURLToPath(new URL('./fixtures/trace', import.meta.url))
const LIVE_DECK = fileURLToPath(new URL('./fixtures/live', import.meta.url))
const require = createRequire(import.meta.url)
const SLIDEV = join(dirname(require.resolve('@slidev/cli/package.json')), 'bin/slidev.mjs')

const out = mkdtempSync(join(tmpdir(), 'presmium-slides-'))
afterAll(() => rmSync(out, { recursive: true, force: true }))

/** `presmium <args>` in a fixture deck; the output, both streams. */
async function build(args: string[], cwd = DECK): Promise<{ code: number, output: string }> {
  const { code, stdout, stderr } = await presmium(cwd, args)
  return { code, output: stdout + stderr }
}

/** `slidev <args>` in a fixture deck. */
async function slidev(args: string[], cwd = DECK): Promise<{ code: number, output: string }> {
  const { code, stdout, stderr } = await run(process.execPath, [SLIDEV, ...args], { cwd })
  return { code, output: stdout + stderr }
}

const TYPES: Record<string, string> = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.pdf': 'application/pdf', '.webm': 'video/webm' }

/**
 * Serves a build's output directory as one site, each renderer's output under
 * `/<id>/`; a path under `/slides/` that is no file is a route of the slides.
 */
async function serveSite(dir: string): Promise<{ url: string, close(): Promise<void> }> {
  const server = createServer((request, response) => {
    const path = decodeURIComponent(new URL(request.url ?? '/', 'http://localhost').pathname)
    let file = join(dir, path)
    if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html')
    if (!existsSync(file) && path.startsWith('/slides/') && !extname(path)) file = join(dir, 'slides/index.html')
    if (!file.startsWith(dir + sep) || !existsSync(file)) {
      response.writeHead(404).end()
      return
    }
    response.writeHead(200, { 'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream' })
    createReadStream(file).pipe(response)
  })
  await new Promise<void>(done => server.listen(0, '127.0.0.1', done))
  return {
    url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
    close: () => new Promise((done) => {
      server.close(() => done())
      server.closeAllConnections()
    }),
  }
}

/** NFKC: fonts in PDFs often map CJK characters to compatibility code points (a radical for 示). */
const normal = (text: string) => text.normalize('NFKC')

/** The text of each page of a PDF, normalized. */
async function pdfText(file: string): Promise<string[]> {
  const pdf = await getDocument({ data: new Uint8Array(readFileSync(file)) }).promise
  const pages: string[] = []
  for (let n = 1; n <= pdf.numPages; n++) {
    const { items } = await (await pdf.getPage(n)).getTextContent()
    pages.push(normal(items.map(item => 'str' in item ? item.str : '').join('')))
  }
  return pages
}

it('build --to slides leaves a Slidev deck that slidev export turns into a PDF with a page per step', async () => {
  const built = await build(['build', '--to', 'slides', '--out', out])
  expect(built.code, built.output).toBe(0)
  // Built alone, the slides are served at the root of their site (C-13).
  expect(readFileSync(join(out, 'slides/index.html'), 'utf8')).toMatch(/src="\/assets\/index-/)
  // The deck's public/ directory is served with the slides: linked entry by entry, never written to.
  expect(existsSync(join(out, 'slides/dot.svg'))).toBe(true)
  expect(lstatSync(join(DECK, '.presmium/slides/public/dot.svg')).isSymbolicLink()).toBe(true)
  expect(built.output).toContain('slidev export .presmium/slides/slides.md')
  // The origin bar of code in versions links the file at the lines of the version on screen (C-10).
  const slides = readFileSync(join(DECK, '.presmium/slides/slides.md'), 'utf8')
  const shown = 'Math.min(Math.max($clicks - 2, 0), 1)'
  expect(slides).toContain(`href="https://example.org/v1/sum.py#L1" target="_blank" rel="noopener" title="在仓库中打开 sum.py" v-show="${shown} === 0">sum.py:1</a>`)
  expect(slides).toContain(`href="https://example.org/v2/sum.py#L2" target="_blank" rel="noopener" title="在仓库中打开 sum.py" v-show="${shown} === 1">sum.py:2</a>`)
  // The output of a run that failed says so, as in the web form.
  expect(slides).toContain('```text\nEXIT 3\n```\n\n<p class="pm-output__note">退出码 3</p>')

  const pdf = join(out, 'deck.pdf')
  const exported = await slidev(['export', '.presmium/slides/slides.md', '--with-clicks', '--output', pdf])
  expect(exported.code, exported.output).toBe(0)
  // Every step of every section is a page: list items, a revealed block, highlight stages, code versions.
  const { sections } = JSON.parse(readFileSync(join(out, 'ir.json'), 'utf8')) as { sections: { steps: number }[] }
  expect(sections.map(s => s.steps)).toEqual([0, 3, 3, 0])
  expect((await PDFDocument.load(readFileSync(pdf))).getPageCount()).toBe(10)
}, 180_000)

it('a PDF export shows the static fallback of interactive components, not their controls or run-time state; what a predict reveals shows open', async () => {
  const target = join(out, 'export')
  const built = await build(['build', '--to', 'slides', '--out', target], EXPORT_DECK)
  expect(built.code, built.output).toBe(0)
  // The base the deck sets, as a path from the root.
  expect(readFileSync(join(target, 'slides/index.html'), 'utf8')).toMatch(/src="\/talks\/export\/assets\/index-/)
  const pdf = join(target, 'export.pdf')
  // The slides of plugin components load late on a busy machine; the export waits for them (Slidev's `--wait`).
  const exported = await slidev(['export', '.presmium/slides/slides.md', '--wait', '2000', '--output', pdf], EXPORT_DECK)
  expect(exported.code, exported.output).toBe(0)

  const [, panel, local, quiz, predict] = await pdfText(pdf)
  // The run panel and the local environment: their code, without run buttons or a missing dev server.
  expect(panel).toContain('print("panel fallback")')
  expect(local).toContain('print("local fallback")')
  // The quiz: its question and options, without a submit button.
  expect(quiz).toContain(normal('导出的测验显示什么？'))
  expect(quiz).toContain(normal('题目与选项'))
  // The predict: its question and choices, and what it reveals shown, the output of its code recorded at compile time included.
  expect(predict).toContain(normal('这段代码打印什么？'))
  expect(predict).toContain(normal('打印 6：'))
  expect(predict).toContain('print("sum:", sum([1, 2, 3]))')
  expect(predict).toContain('sum: 6')
  for (const text of [panel, local, quiz, predict]) {
    for (const live of ['运行', '提交', '保存预测', '开发服务器', '执行服务不可用']) expect(text).not.toContain(normal(live))
  }
}, 180_000)

it('writes MyST as Slidev reads it, publishes the local files the slides show and isolates each plugin component', async () => {
  const target = join(out, 'myst')
  const built = await build(['build', '--to', 'web,slides,notebook', '--out', target], MYST_DECK)
  expect(built.code, built.output).toBe(0)
  // Built with another site and no base set, the slides are served under /slides/ and the other site
  // under /<its id>/, so the output directory deploys as one site (C-13).
  expect(readFileSync(join(target, 'web/index.html'), 'utf8')).toContain('base /web/')
  expect(readFileSync(join(target, 'slides/index.html'), 'utf8')).toMatch(/src="\/slides\/assets\/index-/)
  const slides = readFileSync(join(MYST_DECK, '.presmium/slides/slides.md'), 'utf8')
  const notebook = (JSON.parse(readFileSync(join(target, 'notebook/lecture.ipynb'), 'utf8')) as { cells: { source: string[] }[] }).cells.map(c => c.source.join('')).join('\n\n')

  // The web-only block takes no step of the slides: the code that follows it shows at the first click (R-03).
  expect(slides).toContain('# Only\n\n<div v-click="1">\n\n```python\nprint("after")')

  // MyST lowered as the notebook lowers it (R-07): the figure's caption a paragraph of its own, the dropdown
  // a <details>, the definition list a list; links to labels go to their slides through Slidev's <Link>.
  expect(slides).toContain('![](/e385aa54-dot.svg)\n\n*A dot.*')
  expect(slides).toContain('<details>\n<summary>Open me</summary>\n\nHidden body.\n\n</details>')
  expect(slides).toContain('- **Term**\n\n  Definition of the term.')
  expect(slides).toContain('See <Link to="2">the first section</Link> and <Link to="3">Figure\u00A01</Link>.')
  expect(slides).toContain('<iframe src="https://example.org/embed" width="80%" loading="lazy"></iframe>')

  // Local files of an included page, and the file a component names, are published at the root of the
  // slides under their content hash (R-06): an image by its path from the root, to which Vite and Slidev's
  // image preloader add the base; a link, as HTML (Slidev's links are routes), and a component's prop with
  // the base. A URL with a malformed escape stays as it is.
  expect(slides).toContain('![A dot](/e385aa54-dot.svg) <a href="/slides/003d456f-handout.pdf" target="_blank" rel="noopener">The handout</a> [A broken link](%E0%A4.pdf) <span class="pm-button pm-button--text">Soon</span>')
  expect(slides).toContain(`<FixtureClip :src='"/slides/7cb92485-clip.webm"' />`)
  // The notes are HTML as Slidev shows them, without Vite: an image there has the base too.
  expect(slides).toContain('![A dot in the notes](/slides/e385aa54-dot.svg)')
  for (const file of ['e385aa54-dot.svg', '003d456f-handout.pdf', '7cb92485-clip.webm']) expect(existsSync(join(target, 'slides', file)), file).toBe(true)
  expect(notebook).toContain('![A dot](media/e385aa54-dot.svg) [The handout](media/003d456f-handout.pdf)')

  // Footnotes of two included files that both write [^1] stay apart in one slide (R-04).
  expect(slides).toContain('One[^1].\n\n[^1]: The first note.')
  expect(slides).toContain('Two[^1-2].\n\n[^1-2]: The second note.')

  // Each plugin component is isolated (K-07); an extension that throws leaves the component and a warning
  // at its block (R-33); code that a component holds shows no recorded output (C-5).
  const line = readFileSync(join(MYST_DECK, 'lecture.md'), 'utf8').split('\n').indexOf(':::{boom}') + 1
  expect(built.output).toContain(`lecture.md:${line}  warning  the slides extension of FixtureBoom (plugin fixture.widgets) failed: the extension broke`)
  expect(slides).toContain('<PmBoundary name="FixtureBoom">\n\n<PmStaticFallback>\n\n<FixtureBoom />')
  expect(slides).toContain('<PmBoundary name="FixturePanel">\n\n<FixturePanel>\n\n```text\nowned by the panel\n```\n\n</FixturePanel>')
  expect(slides).not.toContain('OWNED BY THE PANEL')

  // Two plugins render a component of the same name: both renderers pick the plugin the node names (R-42).
  expect(slides).toContain('<PmBoundary name="FixtureTwin">\n\n<p>twin from twin</p>')
  expect(notebook).toContain('twin from twin')
  expect(`${slides}${notebook}`).not.toContain('twin from widgets')
  // An overlay with nothing to show in exports is not wrapped for them (C-15).
  expect(slides).toContain('<PmBoundary name="FixturePointer">\n\n<FixturePointer />\n\n</PmBoundary>')

  // In the browser, under the base: the image shows, the handout opens in a tab of its own while the
  // slides stay where they are, and nothing the slides ask for is missing.
  const { sections } = JSON.parse(readFileSync(join(target, 'ir.json'), 'utf8')) as { sections: { id: string, index: number }[] }
  const media = sections.find(s => s.id === 'media')!.index
  const site = await serveSite(target)
  const browser = await chromium.launch()
  try {
    const page = await browser.newPage()
    const failed: string[] = []
    page.context().on('response', (response) => {
      if (response.status() >= 400) failed.push(`${response.status()} ${response.url()}`)
    })
    await page.goto(`${site.url}/slides/${media}`)
    const image = page.locator(`.slidev-page-${media} img[alt="A dot"]`)
    await expect.poll(() => image.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth)).toBeGreaterThan(0)
    const [tab, handout] = await Promise.all([
      page.waitForEvent('popup'),
      page.context().waitForEvent('response', response => response.url().endsWith('.pdf')),
      page.locator(`.slidev-page-${media}`).getByText('The handout').click(),
    ])
    expect(handout.url()).toBe(`${site.url}/slides/003d456f-handout.pdf`)
    expect(handout.status()).toBe(200)
    expect(handout.frame().page()).toBe(tab)
    expect(page.url()).toBe(`${site.url}/slides/${media}`)
    // A {button} without a target is drawn as a button, as one with a link is.
    expect(await page.locator(`.slidev-page-${media} .pm-button--text`).evaluate(button => getComputedStyle(button).borderTopStyle)).toBe('solid')
    // The presenter view shows the notes, with their image.
    await page.goto(`${site.url}/slides/presenter/${media}`)
    const noted = page.locator('img[alt="A dot in the notes"]').first()
    await expect.poll(() => noted.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth)).toBeGreaterThan(0)
    expect(failed).toEqual([])
  } finally {
    await browser.close()
    await site.close()
  }
}, 240_000)

it('shows tags that name no HTML element as text, and reports a slide that does not build at its block, not in the generated deck', async () => {
  // An agent's trace in a table and in narration: its pseudo-XML tags are words, not markup (docs/coverage-agentic-se.md section 4).
  const built = await build(['build', '--to', 'slides', '--out', join(out, 'trace')], TRACE_DECK)
  expect(built.code, built.output).toBe(0)
  const slides = readFileSync(join(TRACE_DECK, '.presmium/slides/slides.md'), 'utf8')
  expect(slides).toMatch(/\| 1 +\| \\<reminder> keep the tests green \|/)
  expect(slides).toContain('The trace says \\<system-reminder> before each request.')

  // HTML that Slidev cannot compile as a Vue template: the error is at its block in the source.
  const broken = await build(['build', '--to', 'slides', '--out', join(out, 'broken'), 'broken.md'], TRACE_DECK)
  expect(broken.code).toBe(1)
  const line = readFileSync(join(TRACE_DECK, 'broken.md'), 'utf8').split('\n').indexOf('Some text <span> not closed.') + 1
  expect(broken.output).toContain(`broken.md:${line}  error  slide 3 (Broken) does not build: Element is missing end tag.`)
  expect(broken.output).not.toContain('__slidev_')
}, 180_000)

it('gives code that runs live one output area, its runner\'s, which shows the recording until the code runs; shows an HTML table whole, sanitized, in the slide and its export (F-18, F-65)', async () => {
  const target = join(out, 'live')
  const built = await build(['build', '--to', 'slides', '--out', target], LIVE_DECK)
  expect(built.code, built.output).toBe(0)
  const slides = readFileSync(join(LIVE_DECK, '.presmium/slides/slides.md'), 'utf8')
  // The recording is the runner's (its options in the headmatter), not a block below it.
  expect(slides).toContain("```python {monaco-run} {autorun:'once',height:'auto',runnerOptions:$slidev.configs.presmiumRuns['live/code-1']}")
  expect(slides).not.toContain('```text\nLIVE-RECORDED 42\n```')
  // HTML output: sanitized (no script), one block Vue leaves as it is.
  const html = /<div class="pm-output__html" v-pre>(.*)<\/div>/.exec(slides)?.[1]
  expect(html).toMatch(/^<table>/)
  expect(html).not.toMatch(/<script|<style/)

  const { sections } = JSON.parse(readFileSync(join(target, 'ir.json'), 'utf8')) as { sections: { id: string, index: number }[] }
  const slide = (id: string) => sections.find(s => s.id === id)!.index
  const site = await serveSite(target)
  const browser = await chromium.launch()
  try {
    const page = await browser.newPage()
    await page.goto(`${site.url}/slides/${slide('live')}`)
    const runner = page.locator(`.slidev-page-${slide('live')} .slidev-runner-output`)
    await runner.locator('.pm-run-recorded').waitFor()
    expect(await runner.innerText()).toBe('预录输出\nLIVE-RECORDED 42')
    await page.goto(`${site.url}/slides/${slide('only-live')}`)
    const hint = page.locator(`.slidev-page-${slide('only-live')} .slidev-runner-output .pm-run-hint`)
    await hint.waitFor()
    expect(await hint.innerText()).toBe('按 ▶ 运行这段代码')
    expect(await page.content()).not.toContain('Click the play button')

    await page.goto(`${site.url}/slides/${slide('table')}`)
    const layout = page.locator(`.slidev-page-${slide('table')} .slidev-layout`)
    const rows = layout.locator('.pm-output__html tbody tr')
    await rows.last().waitFor()
    expect(await rows.count()).toBe(12)
    const [box, last] = await Promise.all([layout.boundingBox(), rows.last().boundingBox()])
    expect(last!.y + last!.height).toBeLessThanOrEqual(box!.y + box!.height)
    expect(await page.evaluate(() => (window as { fixtureScript?: number }).fixtureScript)).toBeUndefined()
  } finally {
    await browser.close()
    await site.close()
  }

  const pdf = join(target, 'table.pdf')
  const exportTable = () => slidev(['export', '.presmium/slides/slides.md', '--range', String(slide('table')), '--output', pdf], LIVE_DECK)
  let exported = await exportTable()
  // The deck's first export may find Vite still optimizing the execution plugin's dependencies, which a
  // busy machine makes outlast the print page's wait: once more, with the dependencies optimized.
  if (exported.code !== 0 && /Timeout/.test(exported.output)) exported = await exportTable()
  expect(exported.code, exported.output).toBe(0)
  const text = (await pdfText(pdf)).join('\n')
  expect(text).toContain('row 0')
  expect(text).toContain('row 11')
}, 240_000)
