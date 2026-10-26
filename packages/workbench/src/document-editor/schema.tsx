import { createContext, createElement, useContext } from 'react'
import type { ReactNode } from 'react'
import { BlockNoteSchema, defaultBlockSpecs, defaultInlineContentSpecs, defaultStyleSpecs } from '@blocknote/core'
import type { Block, BlockNoteEditor, PartialBlock } from '@blocknote/core'
import { createReactBlockSpec, createReactInlineContentSpec } from '@blocknote/react'
import { tableIdentityExtension } from './table-identities.ts'

export interface DocumentNodeViews {
  renderBlock?(id: string, kind: string): ReactNode
  renderInline?(id: string, kind: string, label: string): ReactNode
}
export const DOCUMENT_NODE_VIEWS = createContext<DocumentNodeViews>({})

const page = createReactBlockSpec({
  type: 'presmiumPage',
  propSchema: { sectionId: { default: '' }, level: { default: 1, values: [1, 2, 3, 4, 5, 6] as const } },
  content: 'inline',
}, {
  render: ({ block, contentRef }) => createElement(`h${block.props.level}`, { className: 'pm-document-editor__page-title', 'data-document-section': block.props.sectionId, ref: contentRef }),
})()

const atom = createReactBlockSpec({
  type: 'presmiumAtom',
  propSchema: { entityId: { default: '' }, kind: { default: '' }, label: { default: '' } },
  content: 'none',
}, {
  render: ({ block }) => {
    const views = useContext(DOCUMENT_NODE_VIEWS)
    return <div className="pm-document-editor__atom" contentEditable={false}>
      {views.renderBlock?.(block.props.entityId, block.props.kind) ?? (block.props.label || block.props.kind)}
    </div>
  },
})()

const container = createReactBlockSpec({
  type: 'presmiumContainer',
  propSchema: { entityId: { default: '' }, layout: { default: 'stack', values: ['stack', 'columns', 'tabs'] as const }, title: { default: '' } },
  content: 'none',
}, {
  render: ({ block }) => <div className="pm-document-editor__container-label" contentEditable={false}>{block.props.title || block.props.layout}</div>,
})()

const inline = createReactInlineContentSpec({
  type: 'presmiumInline',
  propSchema: { entityId: { default: '' }, kind: { default: '' }, label: { default: '' } },
  content: 'none',
}, {
  render: ({ inlineContent }) => {
    const views = useContext(DOCUMENT_NODE_VIEWS)
    const { entityId, kind, label } = inlineContent.props
    return <span className="pm-document-editor__inline" contentEditable={false}>
      {views.renderInline?.(entityId, kind, label) ?? (label || kind)}
    </span>
  },
})

const table = { ...defaultBlockSpecs.table, extensions: [...defaultBlockSpecs.table.extensions ?? [], tableIdentityExtension] }

/** An editing projection. The product document schema remains owned by the kernel. */
export const documentEditorSchema = BlockNoteSchema.create({
  blockSpecs: {
    paragraph: defaultBlockSpecs.paragraph, heading: defaultBlockSpecs.heading,
    bulletListItem: defaultBlockSpecs.bulletListItem, numberedListItem: defaultBlockSpecs.numberedListItem,
    checkListItem: defaultBlockSpecs.checkListItem, quote: defaultBlockSpecs.quote,
    codeBlock: defaultBlockSpecs.codeBlock, table, image: defaultBlockSpecs.image,
    presmiumPage: page, presmiumAtom: atom, presmiumContainer: container,
  },
  inlineContentSpecs: { ...defaultInlineContentSpecs, presmiumInline: inline },
  styleSpecs: defaultStyleSpecs,
})
export const commentEditorSchema = BlockNoteSchema.create({
  blockSpecs: {
    paragraph: defaultBlockSpecs.paragraph, heading: defaultBlockSpecs.heading,
    bulletListItem: defaultBlockSpecs.bulletListItem, numberedListItem: defaultBlockSpecs.numberedListItem,
    checkListItem: defaultBlockSpecs.checkListItem, quote: defaultBlockSpecs.quote,
    codeBlock: defaultBlockSpecs.codeBlock, table, presmiumAtom: atom,
  },
  inlineContentSpecs: { ...defaultInlineContentSpecs, presmiumInline: inline }, styleSpecs: defaultStyleSpecs,
})
export type DocumentEditorBlock = Block<typeof documentEditorSchema.blockSchema, typeof documentEditorSchema.inlineContentSchema, typeof documentEditorSchema.styleSchema>
export type DocumentEditorInput = PartialBlock<typeof documentEditorSchema.blockSchema, typeof documentEditorSchema.inlineContentSchema, typeof documentEditorSchema.styleSchema>
export type NativeDocumentEditor = BlockNoteEditor<typeof documentEditorSchema.blockSchema, typeof documentEditorSchema.inlineContentSchema, typeof documentEditorSchema.styleSchema>
