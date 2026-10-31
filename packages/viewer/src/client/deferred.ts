import { createStore } from '@lincyaw/host'
import { docBlocks } from '@lincyaw/kernel'
import type { IRDocument, MdastNode } from '@lincyaw/kernel'
import type { raw } from 'hast-util-raw'
import type { OutputParsers } from './code/output-parsers.ts'

/**
 * The parts of the viewer that only some documents use, loaded apart from the app: the HTML parser for HTML written in
 * Markdown, and the parsers of code outputs (ANSI colours, Markdown). A page loads the parts its document uses before it
 * first renders (`loadDocumentParts`), so that the server's render and the browser's first one agree; a part a later
 * change of the document needs loads then, and the blocks render again once it is there.
 */

type RawHtml = typeof raw

/** Counts the parts loaded, so that a block shown without one renders again once it is there. */
export const loadedParts = createStore(0)
let rawHtml: RawHtml | undefined
let outputParsers: OutputParsers | undefined
const loading = new Map<string, Promise<void>>()

function load(name: string, start: () => Promise<void>): Promise<void> {
  let known = loading.get(name)
  if (!known) {
    known = start().then(
      () => loadedParts.set(loadedParts.getSnapshot() + 1),
      (error: unknown) => {
        loading.delete(name)
        console.error(`[presmium] the viewer's ${name} did not load`, error)
      },
    )
    loading.set(name, known)
  }
  return known
}

const loadRawHtml = () => load('HTML parser', async () => { rawHtml = (await import('hast-util-raw')).raw })
const loadOutputParsers = () => load('output parsers', async () => { outputParsers = (await import('./code/output-parsers.ts')).OUTPUT_PARSERS })

/** The HTML parser if it is loaded; else it starts loading and the caller shows the HTML as missing meanwhile. */
export function rawHtmlParser(): RawHtml | undefined {
  if (!rawHtml) void loadRawHtml()
  return rawHtml
}

/** The parsers of code outputs if they are loaded; else they start loading and the caller shows plain text meanwhile. */
export function codeOutputParsers(): OutputParsers | undefined {
  if (!outputParsers) void loadOutputParsers()
  return outputParsers
}

function hasHtml(node: MdastNode | undefined): boolean {
  return node !== undefined && (node.type === 'html' || (node.children?.some(hasHtml) ?? false))
}

/** Loads the parts `doc` uses (`import.meta.env.SSR` included: the server renders the document with them too). */
export async function loadDocumentParts(doc: IRDocument): Promise<void> {
  const parts: Promise<void>[] = []
  for (const { block } of docBlocks(doc)) {
    const node = block.node
    if (!rawHtml && ((node.type === 'markdown' && hasHtml(node.mdast)) || (node.type === 'component' && hasHtml(node.fallback)))) parts.push(loadRawHtml())
    if (!outputParsers && node.type === 'code' && node.outputs?.length) parts.push(loadOutputParsers())
  }
  await Promise.all(parts)
}
