import { useEffect, useRef } from 'react'
import type { ReactNode } from 'react'
import { filterSuggestionItems } from '@blocknote/core'
import { en, zh } from '@blocknote/core/locales'
import { BlockNoteView } from '@blocknote/mantine'
import { AddCommentButton, BasicTextStyleButton, BlockNoteViewEditor, BlockTypeSelect, ColorStyleButton, CreateLinkButton, FloatingComposerController, FormattingToolbar, FormattingToolbarController, getDefaultReactSlashMenuItems, NestBlockButton, RenderInPortalElement, SuggestionMenuController, TextAlignButton, ThreadsSidebar, UnnestBlockButton, useBlockNoteEditor, useCreateBlockNote, useEditorState } from '@blocknote/react'
import type { FormattingToolbarProps } from '@blocknote/react'
import type { Locale } from '../messages.ts'
import { DOCUMENT_NODE_VIEWS, documentEditorSchema } from './schema.tsx'
import type { DocumentEditorBlock, DocumentEditorInput, DocumentNodeViews, NativeDocumentEditor } from './schema.tsx'
import { documentSelection } from './selection.ts'
import type { NativeDocumentSelection } from './selection.ts'
import { DOCUMENT_EDITOR_MESSAGES } from './messages.ts'
import { nativeComments } from './comments.ts'
import type { DocumentThreadStore } from './comments.ts'

export const DOCUMENT_EDITOR_THEME = {
  colors: {
    editor: { background: 'var(--pm-color-surface)', text: 'var(--pm-color-ink)' },
    menu: { background: 'var(--pm-color-surface)', text: 'var(--pm-color-ink)' },
    tooltip: { background: 'var(--pm-color-surface)', text: 'var(--pm-color-ink)' },
    hovered: { background: 'var(--pm-color-sunk)', text: 'var(--pm-color-ink)' },
    selected: { background: 'var(--pm-color-accent-soft)', text: 'var(--pm-color-accent)' },
    disabled: { background: 'var(--pm-color-sunk)', text: 'var(--pm-color-muted)' },
    border: 'var(--pm-color-line)', shadow: 'var(--pm-color-backdrop)', sideMenu: 'var(--pm-color-muted)',
  },
  fontFamily: 'var(--pm-font-sans)',
}

export interface BlockNoteSurfaceProps {
  identity: string
  /** Explicit replacement of an external source; an own save acknowledgement must not change it. */
  reset?: number
  initialContent: DocumentEditorInput[]
  locale: Locale
  readOnly?: boolean
  resolveAssetURL?(location: string): Promise<string>
  nodeViews?: DocumentNodeViews
  onChange(blocks: DocumentEditorBlock[], editor: NativeDocumentEditor): void
  onSelection?(selection: NativeDocumentSelection | undefined): void
  comments?: DocumentThreadStore
  commentsPortal?: HTMLElement | null
  onReady?(editor: NativeDocumentEditor | undefined): void
  onComposition?(composing: boolean): void
  children?: ReactNode
}

function EditorToolbar(props: FormattingToolbarProps) {
  const editor = useBlockNoteEditor(documentEditorSchema)
  const title = useEditorState({ editor, selector: ({ editor }) => editor.getSelection()?.blocks.some(block => block.type === 'presmiumPage') ?? false })
  if (title) return <FormattingToolbar {...props}><AddCommentButton /></FormattingToolbar>
  return <FormattingToolbar {...props}>
    <BlockTypeSelect items={props.blockTypeSelectItems} />
    <BasicTextStyleButton basicTextStyle="bold" /><BasicTextStyleButton basicTextStyle="italic" />
    <BasicTextStyleButton basicTextStyle="underline" /><BasicTextStyleButton basicTextStyle="strike" /><BasicTextStyleButton basicTextStyle="code" />
    <TextAlignButton textAlignment="left" /><TextAlignButton textAlignment="center" /><TextAlignButton textAlignment="right" />
    <ColorStyleButton /><NestBlockButton /><UnnestBlockButton /><CreateLinkButton />
    <AddCommentButton />
  </FormattingToolbar>
}

function PlainContentComments({ editor }: { editor: NativeDocumentEditor }) {
  const show = useEditorState({ editor, selector: ({ editor }) => {
    if (editor.prosemirrorState.selection.empty) return false
    let plain = false
    editor.prosemirrorState.selection.content().content.descendants(node => { if (node.type.spec.content === 'text*') plain = true; return !plain })
    return plain
  } })
  // BlockNote hides formatting controls over code; its own comment action still applies.
  return show && editor.getExtension('comments') ? <div className="pm-document-editor__comment-tools"><FormattingToolbar><AddCommentButton /></FormattingToolbar></div> : null
}

/** One native editor owns selection, transactions and history across the complete document. */
export function BlockNoteSurface(props: BlockNoteSurfaceProps) {
  const current = useRef(props)
  current.current = props
  const dictionary = props.locale === 'zh-CN' ? zh : en
  const t = DOCUMENT_EDITOR_MESSAGES[props.locale]
  const editor = useCreateBlockNote({ schema: documentEditorSchema, initialContent: props.initialContent,
    resolveFileUrl: location => current.current.resolveAssetURL?.(location) ?? Promise.resolve(location),
    dictionary, tables: { splitCells: true, cellBackgroundColor: true, cellTextColor: true, headers: true },
    extensions: props.comments ? [nativeComments(props.comments, t.author)] : [],
    domAttributes: { block: { 'data-document-editor-block': '' } },
  }, [props.identity, props.reset ?? 0])
  useEffect(() => {
    current.current.onReady?.(editor)
    return () => current.current.onReady?.(undefined)
  }, [editor])
  return <DOCUMENT_NODE_VIEWS.Provider value={props.nodeViews ?? {}}>
    <div className="pm-document-editor pm-ui-block-editor pm-ui" data-document-editor={props.identity}
      onCompositionStart={() => current.current.onComposition?.(true)}
      onCompositionEnd={() => queueMicrotask(() => current.current.onComposition?.(false))}>
      <BlockNoteView editor={editor} editable={!props.readOnly} theme={DOCUMENT_EDITOR_THEME} formattingToolbar={false} slashMenu={false} renderEditor={false} comments={props.commentsPortal ? false : undefined}
        onChange={() => current.current.onChange(editor.document, editor)}
        onSelectionChange={() => current.current.onSelection?.(documentSelection(editor))}>
        <PlainContentComments editor={editor} />
        <BlockNoteViewEditor>
        {props.commentsPortal && <><FloatingComposerController /><RenderInPortalElement target={props.commentsPortal}><ThreadsSidebar filter="all" /></RenderInPortalElement></>}
        <FormattingToolbarController formattingToolbar={EditorToolbar} />
        <SuggestionMenuController triggerCharacter="/" getItems={async query => editor.getTextCursorPosition().block.type === 'presmiumPage' ? [] : filterSuggestionItems([...getDefaultReactSlashMenuItems(editor), {
          title: t.page, aliases: ['page', 'section', '页面', '章节'], group: t.document,
          onItemClick: () => { const current = editor.getTextCursorPosition().block; editor.insertBlocks([{ type: 'presmiumPage', props: { sectionId: crypto.randomUUID() }, content: t.untitledPage }], current, 'after') },
        }], query)} />
        {props.children}
        </BlockNoteViewEditor>
      </BlockNoteView>
    </div>
  </DOCUMENT_NODE_VIEWS.Provider>
}
