import { forwardRef, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { ForwardRefExoticComponent, ReactNode, RefAttributes } from 'react'
import { filterSuggestionItems } from '@blocknote/core'
import { en, zh } from '@blocknote/core/locales'
import { BlockNoteView, components } from '@blocknote/mantine'
import { AddCommentButton, BasicTextStyleButton, BlockNoteViewEditor, BlockTypeSelect, ColorStyleButton, ComponentsContext, CreateLinkButton, FormattingToolbar, FormattingToolbarController, getDefaultReactSlashMenuItems, NestBlockButton, RenderInPortalElement, SuggestionMenuController, TableCellMergeButton, TextAlignButton, UnnestBlockButton, useBlockNoteEditor, useCreateBlockNote, useEditorState } from '@blocknote/react'
import type { ComponentProps, FormattingToolbarProps } from '@blocknote/react'
import { useMediaQuery } from '@mantine/hooks'
import type { Locale } from '../messages.ts'
import { PmIconButton, PmNotice, PmTooltip } from '../components.tsx'
import { DOCUMENT_NODE_VIEWS, documentEditorSchema } from './schema.tsx'
import type { DocumentEditorBlock, DocumentEditorInput, DocumentNodeViews, NativeDocumentEditor } from './schema.tsx'
import { documentSelection } from './selection.ts'
import type { NativeDocumentSelection } from './selection.ts'
import { DOCUMENT_EDITOR_MESSAGES, IMAGE_IMPORT_MESSAGES } from './messages.ts'
import { imageFileInput } from './file-input.ts'
import type { ImageImportFailure } from './file-input.ts'
import { nativeTextClipboard } from './clipboard.ts'
import { excludeCommentMarkHistory, nativeComments, nativeCommentSelection } from './comments.ts'
import type { DocumentThreadStore } from './comments.ts'
import { COMMENT_EDITOR_CONTEXT, DocumentCommentEditor, DocumentFloatingThreadController, DocumentThreadsSidebar } from './DocumentComments.tsx'
import { DocumentNewCommentController, DocumentNewCommentRecovery, NewCommentDraftProvider } from './NewCommentDrafts.tsx'

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

const MantineComment = components.Comments.Comment as ForwardRefExoticComponent<ComponentProps['Comments']['Comment'] & RefAttributes<HTMLDivElement>>
const DocumentComment = forwardRef<HTMLDivElement, ComponentProps['Comments']['Comment']>(function DocumentComment(props, ref) {
  const coarse = useMediaQuery('(pointer: coarse)', false, { getInitialValueInEffect: false })
  const className = [props.className, props.actions ? 'pm-ui-comment-actions-row' : undefined].filter(Boolean).join(' ')
  return <MantineComment {...props} ref={ref} className={className} showActions={coarse && props.showActions === 'hover' ? true : props.showActions} />
})
const MantineBadge = components.Generic.Badge.Root as ForwardRefExoticComponent<ComponentProps['Generic']['Badge']['Root'] & RefAttributes<HTMLInputElement>>
const DocumentReactionBadge = forwardRef<HTMLInputElement, ComponentProps['Generic']['Badge']['Root']>(function DocumentReactionBadge(props, ref) {
  if (!props.className?.split(/\s+/).includes('bn-comment-reaction')) return <MantineBadge {...props} ref={ref} />
  const label = [props.mainTooltip, props.secondaryTooltip?.replace(/\s+/g, ' ')].filter(Boolean).join(' · ')
  // Keep the input mounted while tooltip visibility changes; let its label own activation and focus.
  return <PmTooltip label={label}><span><MantineBadge {...props} mainTooltip={undefined} secondaryTooltip={undefined} ref={ref}
    onClick={event => { if (event.target instanceof HTMLInputElement) props.onClick?.(event) }} /></span></PmTooltip>
})

const MantineToolbarButton = components.Generic.Toolbar.Button as ForwardRefExoticComponent<ComponentProps['Generic']['Toolbar']['Button'] & RefAttributes<HTMLButtonElement>>
const DocumentToolbarButton = forwardRef<HTMLButtonElement, ComponentProps['Generic']['Toolbar']['Button']>(function DocumentToolbarButton(props, ref) {
  const label = props.label ?? props.mainTooltip
  return label === undefined ? <MantineToolbarButton {...props} ref={ref} /> : <MantineToolbarButton {...props} ref={ref} label={label} />
})

const DOCUMENT_EDITOR_COMPONENTS = { ...components, Generic: { ...components.Generic, Badge: { ...components.Generic.Badge, Root: DocumentReactionBadge }, Toolbar: { ...components.Generic.Toolbar, Button: DocumentToolbarButton } }, Comments: { ...components.Comments, Comment: DocumentComment, Editor: DocumentCommentEditor } }

export interface BlockNoteSurfaceProps {
  identity: string
  /** Explicit replacement of an external source; an own save acknowledgement must not change it. */
  reset?: number
  initialContent: DocumentEditorInput[]
  locale: Locale
  readOnly?: boolean
  resolveAssetURL?(location: string): Promise<string>
  uploadImage?(file: File, signal: AbortSignal): Promise<string>
  nodeViews?: DocumentNodeViews
  onChange(blocks: DocumentEditorBlock[], editor: NativeDocumentEditor): void
  onSelection?(selection: NativeDocumentSelection | undefined): void
  comments?: DocumentThreadStore
  commentsPortal?: HTMLElement | null
  getPositionToken?(): string | undefined
  onCommentDraftRestore?(): void
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
    <TableCellMergeButton />
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
  const uploads = useMemo(() => ({ controllers: new Set<AbortController>(), pending: Promise.resolve() }), [props.identity, props.reset ?? 0])
  const [fileErrors, setFileErrors] = useState<{ identity: string, failures: ImageImportFailure[] }>()
  current.current = props
  const dictionary = props.locale === 'zh-CN' ? zh : en
  const t = DOCUMENT_EDITOR_MESSAGES[props.locale]
  const fileMessages = IMAGE_IMPORT_MESSAGES[props.locale]
  const editor = useCreateBlockNote({ schema: documentEditorSchema, initialContent: props.initialContent,
    resolveFileUrl: location => current.current.resolveAssetURL?.(location) ?? Promise.resolve(location),
    uploadFile: props.uploadImage ? file => {
      const controller = new AbortController()
      const uploadImage = current.current.uploadImage!
      uploads.controllers.add(controller)
      const request = uploads.pending.then(async () => {
        controller.signal.throwIfAborted()
        if (current.current.identity !== props.identity) throw new DOMException('Document changed', 'AbortError')
        return uploadImage(file, controller.signal)
      })
      uploads.pending = request.then(() => {}, () => {})
      return request.finally(() => { uploads.controllers.delete(controller) })
    } : undefined,
    disableExtensions: ['dropFile'],
    pasteHandler: ({ event, editor, defaultPasteHandler }) => {
      const files = [...event.clipboardData?.files ?? []]
      if (files.length && !event.clipboardData?.getData('text/html')) {
        editor.getExtension(imageFileInput)?.insert(files)
        return true
      }
      return defaultPasteHandler({ prioritizeMarkdownOverHTML: false })
    },
    dictionary, tables: { splitCells: true, cellBackgroundColor: true, cellTextColor: true, headers: true },
    extensions: [nativeTextClipboard, imageFileInput({
      onStart: () => { if (current.current.identity === props.identity) setFileErrors(undefined) },
      onFailure: failure => { if (current.current.identity === props.identity) setFileErrors(value => ({ identity: props.identity, failures: [...(value?.identity === props.identity ? value.failures : []), failure] })) },
    }), ...props.comments ? [nativeCommentSelection(), nativeComments(props.comments, t.author)] : []],
    domAttributes: { block: { 'data-document-editor-block': '' } },
  }, [props.identity, props.reset ?? 0])
  useEffect(() => {
    const stopCommentHistory = current.current.comments ? excludeCommentMarkHistory(editor) : undefined
    current.current.onReady?.(editor)
    return () => {
      for (const controller of uploads.controllers) controller.abort()
      uploads.controllers.clear()
      stopCommentHistory?.(); current.current.onReady?.(undefined)
    }
  }, [editor])
  return <DOCUMENT_NODE_VIEWS.Provider value={props.nodeViews ?? {}}><COMMENT_EDITOR_CONTEXT.Provider value={props.comments ? { store: props.comments, locale: props.locale, sidebar: Boolean(props.commentsPortal), getPositionToken: () => current.current.getPositionToken?.(), onDraftRestore: () => current.current.onCommentDraftRestore?.() } : undefined}>
    <div className="pm-document-editor pm-ui-block-editor pm-ui" data-document-editor={props.identity}
      onDragEnter={event => { if (event.dataTransfer.types.includes('Files')) event.stopPropagation() }}
      onDragOver={event => { if (event.dataTransfer.types.includes('Files')) event.stopPropagation() }}
      onCompositionStart={() => current.current.onComposition?.(true)}
      onCompositionEnd={() => queueMicrotask(() => current.current.onComposition?.(false))}>
      {fileErrors?.identity === props.identity && <PmNotice tone="danger"><div className="pm-document-editor__file-errors"><ul>{fileErrors.failures.map((failure, index) => <li key={index}>{failure.name} · {fileMessages[failure.kind]}</li>)}</ul><PmIconButton small icon="close" label={fileMessages.dismiss} onClick={() => setFileErrors(undefined)} /></div></PmNotice>}
      <BlockNoteView editor={editor} editable={!props.readOnly} theme={DOCUMENT_EDITOR_THEME} formattingToolbar={false} slashMenu={false} renderEditor={false} comments={false}
        onChange={() => current.current.onChange(editor.document, editor)}
        onSelectionChange={() => current.current.onSelection?.(documentSelection(editor))}>
        <ComponentsContext.Provider value={DOCUMENT_EDITOR_COMPONENTS}>
        <PlainContentComments editor={editor} />
        <BlockNoteViewEditor><NewCommentDraftProvider>
        <DocumentNewCommentController />{!props.commentsPortal && <DocumentFloatingThreadController />}{props.commentsPortal && <><RenderInPortalElement target={props.commentsPortal}><DocumentThreadsSidebar><DocumentNewCommentRecovery /></DocumentThreadsSidebar></RenderInPortalElement></>}
        <FormattingToolbarController formattingToolbar={EditorToolbar} />
        <SuggestionMenuController triggerCharacter="/" getItems={async query => editor.getTextCursorPosition().block.type === 'presmiumPage' ? [] : filterSuggestionItems([...getDefaultReactSlashMenuItems(editor), {
          title: t.page, aliases: ['page', 'section', '页面', '章节'], group: t.document,
          onItemClick: () => { const current = editor.getTextCursorPosition().block; editor.insertBlocks([{ type: 'presmiumPage', props: { sectionId: crypto.randomUUID() }, content: t.untitledPage }], current, 'after') },
        }], query)} />
        {props.children}
        </NewCommentDraftProvider></BlockNoteViewEditor>
        </ComponentsContext.Provider>
      </BlockNoteView>
    </div>
  </COMMENT_EDITOR_CONTEXT.Provider></DOCUMENT_NODE_VIEWS.Provider>
}
