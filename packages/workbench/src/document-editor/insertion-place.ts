import type { DocumentProjection } from './projection.ts'
import type { DocumentEditorBlock, NativeDocumentEditor } from './schema.tsx'

/** Where the caret is in the document, as a place for new content that the author and the AI can both name. */
export interface DocumentInsertionPlace {
  sectionId: string
  /** The block (its document ID) the caret is in, then the blocks holding it, innermost first. */
  blocks: string[]
  /** The text of the paragraph the caret is in, when it has any. */
  text?: string
  /**
   * What new content follows: the caret's paragraph, or the content before it when the paragraph is empty, by its text
   * ('' when that content has none). None at the start of the page.
   */
  after?: string
  /** Nothing else follows on the page. */
  end: boolean
}

type Inline = { type: string, text?: string, content?: unknown, props?: { label?: string } }

function inlineText(content: unknown): string {
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''
  return (content as Inline[]).map(item => item.type === 'text' ? item.text ?? '' : item.type === 'presmiumInline' ? item.props?.label ?? '' : inlineText(item.content)).join('')
}

function textOf(block: DocumentEditorBlock): string {
  const text = block.type === 'image' ? block.props.caption || block.props.name
    : block.type === 'presmiumAtom' ? block.props.label
    : block.type === 'presmiumContainer' ? block.props.title
    : inlineText(block.content)
  return text.replace(/\s+/g, ' ').trim()
}

// An empty paragraph (or heading, list item…) is where content can go, not content to follow.
const filled = (block: DocumentEditorBlock) => !Array.isArray(block.content) || block.content.length > 0

/** The place of the caret's block, as the slash menu opened in it; none on a page title. */
export function documentInsertionPlace(editor: NativeDocumentEditor, projection: Pick<DocumentProjection, 'owners' | 'pages'>): DocumentInsertionPlace | undefined {
  const at = editor.getTextCursorPosition().block as DocumentEditorBlock
  if (at.type === 'presmiumPage') return undefined
  const order: DocumentEditorBlock[] = []
  const visit = (blocks: readonly DocumentEditorBlock[]) => { for (const block of blocks) { order.push(block); visit(block.children) } }
  visit(editor.document)
  const index = order.findIndex(block => block.id === at.id)
  const start = order.findLastIndex((block, i) => i < index && block.type === 'presmiumPage')
  const page = order[start]
  if (index < 0 || page?.type !== 'presmiumPage') return undefined
  const next = order.findIndex((block, i) => i > index && block.type === 'presmiumPage')
  const holders: DocumentEditorBlock[] = []
  for (let block = editor.getParentBlock(at); block; block = editor.getParentBlock(block)) holders.push(block as DocumentEditorBlock)
  const anchor = filled(at) ? at : order.slice(start + 1, index).reverse().find(block => filled(block) && !holders.some(holder => holder.id === block.id))
  const text = textOf(at)
  const blocks = [...new Set([at, ...holders].flatMap(block => projection.owners.get(block.id) ?? []))]
  return {
    sectionId: projection.pages.get(page.id) ?? page.props.sectionId, blocks, ...text ? { text } : {},
    ...anchor ? { after: textOf(anchor) } : {}, end: !order.slice(index + 1, next < 0 ? undefined : next).some(filled),
  }
}
