import { createContext, createElement, useContext } from 'react'
import type { ReactNode } from 'react'
import { BlockNoteSchema, defaultBlockSpecs, defaultInlineContentSpecs, defaultStyleSpecs } from '@blocknote/core'
import type { Block, BlockNoteEditor, PartialBlock, StyleConfig, StyleSpec } from '@blocknote/core'
import { createReactBlockSpec, createReactInlineContentSpec } from '@blocknote/react'
import { DOCUMENT_IMAGE_MEDIA_TYPES } from '@lincyaw/kernel'
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
      {views.renderInline?.(entityId, kind, label) ?? label}
    </span>
  },
})

const table = { ...defaultBlockSpecs.table, extensions: [...defaultBlockSpecs.table.extensions ?? [], tableIdentityExtension] }
const image: typeof defaultBlockSpecs.image = { ...defaultBlockSpecs.image, implementation: { ...defaultBlockSpecs.image.implementation,
  meta: { ...defaultBlockSpecs.image.implementation.meta, fileBlockAccept: [...DOCUMENT_IMAGE_MEDIA_TYPES] },
  render(block, editor) {
    const nativeRender = defaultBlockSpecs.image.implementation.render!
    if (block.props.url) return nativeRender.call(this, block, editor)
    const host = document.createElement('div')
    let rendered = nativeRender.call(this, block, editor)
    host.appendChild(rendered.dom)
    // The native empty-image view starts a loader but does not restore its
    // picker after failure. Own this render boundary, retaining native controls.
    const stopUpload = editor.onUploadEnd(blockId => {
      if (blockId !== block.id) return
      const current = editor.getBlock(block.id)
      if (!current || current.type !== 'image' || current.props.url) return
      rendered.destroy?.()
      rendered = nativeRender.call(this, { ...block, props: current.props }, editor)
      host.replaceChildren(rendered.dom)
    })
    return { dom: host, destroy: () => { stopUpload(); rendered.destroy?.() } }
  },
} }

function clipboardStyle<Config extends StyleConfig>(spec: StyleSpec<Config>): StyleSpec<Config> {
  return { ...spec, implementation: { ...spec.implementation, mark: spec.implementation.mark.extend({ addPasteRules: () => [] }) } }
}

// HTML already carries formatting; its literal text must not run through inline Markdown paste rules again.
const clipboardStyles = {
  ...defaultStyleSpecs,
  bold: clipboardStyle(defaultStyleSpecs.bold), italic: clipboardStyle(defaultStyleSpecs.italic),
  strike: clipboardStyle(defaultStyleSpecs.strike), code: clipboardStyle(defaultStyleSpecs.code),
}

/** An editing projection. The product document schema remains owned by the kernel. */
export const documentEditorSchema = BlockNoteSchema.create({
  blockSpecs: {
    paragraph: defaultBlockSpecs.paragraph, heading: defaultBlockSpecs.heading,
    bulletListItem: defaultBlockSpecs.bulletListItem, numberedListItem: defaultBlockSpecs.numberedListItem,
    checkListItem: defaultBlockSpecs.checkListItem, quote: defaultBlockSpecs.quote,
    codeBlock: defaultBlockSpecs.codeBlock, table, image,
    presmiumPage: page, presmiumAtom: atom, presmiumContainer: container,
  },
  inlineContentSpecs: { ...defaultInlineContentSpecs, presmiumInline: inline },
  styleSpecs: clipboardStyles,
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
