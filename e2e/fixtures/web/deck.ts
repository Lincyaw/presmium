// The fixture deck of e2e/web.spec.ts and e2e/viewer.spec.ts (./deck): a zh-CN deck of three
// chapters (a source file without a chapter title, then two chapter titles in one file) with a
// test plugin whose component steps. Built by `buildFixture` with the @presmium/host its plugin
// imports and served as one site: the web form under /web/ and the slides under /slides/ (the bases
// the deck sets), so each form's default link to the other works.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { IRDocument } from '../../../packages/kernel/src/ir.ts'
import { buildFixture } from '../deck.ts'

export interface WebDeck {
  /** Origin of the server. */
  url: string
  /** A page of the web form, e.g. `basics.html?view=present`. */
  web(path?: string): string
  /** A route of the slides form, e.g. `3?clicks=2`. */
  slides(path?: string): string
  /** The IR the web form publishes: the web renderer's view of the document. */
  doc: IRDocument
  /** Section number (slide number) by section id. */
  slide(id: string): number
  /** The built copy of the deck. */
  dir: string
  close(): Promise<void>
}

/** Builds the fixture deck into the forms `to` (e.g. `web,slides`), changed by `edit`, and serves them. */
export async function webDeck(to: string, edit?: (dir: string) => void): Promise<WebDeck> {
  const deck = await buildFixture('web/deck', { to, edit, link: { '@presmium/host': 'packages/host' }, bases: true })
  return {
    url: deck.url,
    web: (path = '') => `${deck.web}/${path}`,
    slides: (path = '') => `${deck.slides}/${path}`,
    doc: JSON.parse(readFileSync(join(deck.dir, 'dist/web/ir.json'), 'utf8')) as IRDocument,
    slide: id => deck.slide(id),
    dir: deck.dir,
    close: () => deck.close(),
  }
}
