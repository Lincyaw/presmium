import { join, resolve } from 'node:path'
import type { DeckSlide, Finding } from '@presmium/kernel'
import { load } from '@slidev/parser/fs'

export const DECK_ENTRY = 'slides.md'

export interface Deck {
  /** Absolute deck directory. */
  dir: string
  /** Absolute path of the entry Markdown file. */
  entry: string
  /** Raw text of the entry file. */
  entryText: string
  headmatter: Record<string, unknown>
  /** Rendered slides, `src:` imports expanded. */
  slides: DeckSlide[]
  /** Parser errors (e.g. a missing `src:` file) as `error` findings. */
  findings: Finding[]
}

/** Parses `<deckDir>/slides.md` with the Slidev parser, following `src:` imports. */
export async function loadDeck(deckDir: string): Promise<Deck> {
  const dir = resolve(deckDir)
  const entry = join(dir, DECK_ENTRY)
  const data = await load({ roots: [dir], userRoot: dir }, entry)
  const slides = data.slides.map((slide, i): DeckSlide => ({
    index: i + 1,
    file: slide.source.filepath,
    line: slide.source.start + 1,
    frontmatter: slide.frontmatter,
    content: slide.content,
    note: slide.note,
  }))
  const findings = Object.values(data.markdownFiles).flatMap(md => (md.errors ?? []).map((error): Finding => ({
    checkId: 'presmium.parse',
    severity: 'error',
    message: error.message,
    source: { file: md.filepath, line: error.row + 1 },
  })))
  return { dir, entry, entryText: data.entry.raw, headmatter: data.headmatter, slides, findings }
}

/** 1-based line of the first headmatter line that mentions `text`; 1 when absent. */
export function headmatterLine(entryText: string, text: string): number {
  const lines = entryText.split(/\r?\n/)
  const end = lines.indexOf('---', 1)
  const index = lines.slice(0, end < 0 ? undefined : end).findIndex(line => line.includes(text))
  return index < 0 ? 1 : index + 1
}
