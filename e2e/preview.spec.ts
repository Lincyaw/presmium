import { readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { expect, test } from '@playwright/test'
import { previewUrl } from '../packages/language-server/src/domain/preview.ts'
import { PREVIEW_REQUEST, SECTION_REQUEST } from '../packages/language-server/src/domain/protocol.ts'
import type { Preview, SectionAt } from '../packages/language-server/src/domain/protocol.ts'
import { startServer } from '../packages/language-server/test/client.ts'
import type { Client } from '../packages/language-server/test/client.ts'
import { writeDeck } from './fixtures/plugins/decks.ts'

// Preview sync (P-81) as the VS Code extension does it: the language server starts `presmium dev`
// for the deck of a document (`presmium/preview`), maps the cursor to its section
// (`presmium/section`), and the preview goes where `previewUrl` says. The page stands in for the
// extension's webview frame. The deck has two pages of long sections (e2e/fixtures/plugins/preview).

const FILLER = Array.from({ length: 30 }, (_, i) => `Paragraph ${i + 1} of this section, long enough to push the next heading below the window.`).join('\n\n')

test.describe('the editor preview', () => {
  test.describe.configure({ timeout: 240_000 })
  let deck: string
  let server: Client

  test.beforeAll(() => {
    deck = writeDeck('preview', `
title: Preview
plugins:
  - '@presmium/slidev-addon-core'
renderers:
  web: {}
`, ['preview/one.md', 'preview/two.md'], text => text.replaceAll('{{filler}}', FILLER))
  })

  test.afterAll(async () => {
    await server?.close()
    if (deck) rmSync(deck, { recursive: true, force: true })
  })

  test('follows the cursor to its section, on the same page by its anchor and on another page by ?section=', async ({ page }) => {
    server = await startServer()
    const files = { one: join(deck, 'pages/preview/one.md'), two: join(deck, 'pages/preview/two.md') }
    const uri = (file: string) => pathToFileURL(file).href
    for (const file of Object.values(files)) server.open(uri(file), readFileSync(file, 'utf8'))
    /** The section at the first line of `text` in `file`, as the extension asks for it. */
    const sectionAt = async (file: string, text: string) => {
      const line = readFileSync(file, 'utf8').split('\n').indexOf(text)
      expect(line).toBeGreaterThanOrEqual(0)
      return await server.connection.sendRequest(SECTION_REQUEST, { textDocument: { uri: uri(file) }, position: { line, character: 0 } }) as SectionAt
    }
    const heading = (title: string) => page.getByRole('heading', { name: title, level: 2 })

    const preview = await server.connection.sendRequest(PREVIEW_REQUEST, { textDocument: { uri: uri(files.one) } }) as Preview
    expect(preview.entry).toBe(join(deck, 'lecture.md'))

    // The preview opens at the section of the cursor.
    const alpha = await sectionAt(files.one, '## Alpha')
    expect(alpha).toMatchObject({ id: 'alpha', link: '/one.html' })
    await page.goto(previewUrl(preview.url, alpha))
    await expect(heading('Alpha')).toBeInViewport()
    await expect(heading('Gamma')).not.toBeInViewport()

    // The cursor moves down the same page: the anchor scrolls there.
    const cursor = await sectionAt(files.one, '## Gamma')
    const sameUrl = previewUrl(preview.url, cursor, alpha)
    expect(new URL(sameUrl).hash).toBe('#gamma')
    await page.goto(sameUrl)
    await expect(heading('Gamma')).toBeInViewport()
    await expect(heading('Alpha')).not.toBeInViewport()

    // The cursor goes to the other page: it opens at the section.
    const epsilon = await sectionAt(files.two, '## Epsilon')
    const otherUrl = previewUrl(preview.url, epsilon, cursor)
    expect(new URL(otherUrl).search).toBe('?section=epsilon')
    await page.goto(otherUrl)
    await expect(page).toHaveURL(/\/two(\.html)?/)
    await expect(heading('Epsilon')).toBeInViewport()
    await expect(heading('Delta')).not.toBeInViewport()
  })
})
