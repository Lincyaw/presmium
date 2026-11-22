import mammoth from 'mammoth'
import { fromHtml } from 'hast-util-from-html'
import type { MdastNode } from '@lincyaw/kernel'
import { defaultHandlers, toMdast } from 'hast-util-to-mdast'
import { toMarkdown } from 'mdast-util-to-markdown'
import { gfmToMarkdown } from 'mdast-util-gfm'
import type { ImportNotice } from './import-notices.ts'

/**
 * DOCX contributes semantic content; page layout, fonts and external files do not enter the document. Mammoth's messages
 * become conversion notices, except those about a style it does not know: the text still comes in, and styles never do.
 */
export async function wordMarkdown(buffer: Buffer): Promise<{ text: string, assets: Map<string, Uint8Array>, notices: ImportNotice[], tree: MdastNode }> {
  const assets = new Map<string, Uint8Array>()
  let imageNumber = 0
  const extensions: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif', 'image/webp': 'webp', 'image/svg+xml': 'svg', 'image/tiff': 'tiff' }
  const converted = await mammoth.convertToHtml({ buffer }, {
    includeEmbeddedStyleMap: false,
    styleMap: ["p[style-name='Title'] => h1:fresh"],
    externalFileAccess: false,
    convertImage: mammoth.images.imgElement(async image => {
      const name = `word-image-${++imageNumber}.${extensions[image.contentType] ?? 'bin'}`
      const bytes = await image.readAsBuffer()
      assets.set(name, bytes)
      return { src: name }
    }),
  })
  const tree = toMdast(fromHtml(converted.value, { fragment: true }), {
    handlers: {
      table(state, node) {
        const result = defaultHandlers.table!(state, node)
        if (result && !Array.isArray(result) && result.type === 'table') {
          const hasHeader = (element: typeof node): boolean => element.tagName === 'thead' || element.tagName === 'th'
            || element.children.some(child => child.type === 'element' && hasHeader(child))
          // The HTML converter inserts an empty Markdown header for Word tables without one.
          // Keep the original rows in the editable tree; the text copy only supplies its title.
          if (!hasHeader(node)) result.children.shift()
          Object.assign(result, { headerRows: hasHeader(node) ? 1 : 0 })
        }
        return result
      },
    },
  })
  const text = toMarkdown(tree, { extensions: [gfmToMarkdown()], bullet: '-', fences: true })
  const notices = converted.messages
    .filter(message => !/^Unrecognised (?:paragraph|run|table|numbering) style/i.test(message.message))
    .map((message): ImportNotice => ({ kind: /image/i.test(message.message) ? 'image' : 'content' }))
  return { text, tree: tree as unknown as MdastNode, assets, notices }
}
