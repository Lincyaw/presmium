import { forwardRef, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { ForwardRefExoticComponent, ReactNode, RefAttributes } from 'react'
import { randomUUID } from '@lincyaw/kernel'
import { TextSelection } from '@tiptap/pm/state'
import { BlockNoteView, components } from '@blocknote/mantine'
import { AddCommentButton, BasicTextStyleButton, BlockNoteViewEditor, BlockTypeSelect, ComponentsContext, CreateLinkButton, FormattingToolbar, FormattingToolbarController, getDefaultReactSlashMenuItems, LinkToolbarController, NestBlockButton, RenderInPortalElement, SideMenuController, SuggestionMenuController, TableCellMergeButton, TableHandlesController, TextAlignButton, UnnestBlockButton, useBlockNoteEditor, useCreateBlockNote, useEditorState } from '@blocknote/react'
import type { ComponentProps, FormattingToolbarProps } from '@blocknote/react'
import { useMediaQuery } from '@mantine/hooks'
import type { Locale } from '../messages.ts'
import { PmIcon, PmIconButton, PmNotice, PmTooltip } from '../components.tsx'
import { DOCUMENT_NODE_VIEWS, documentEditorSchema } from './schema.tsx'
import type { DocumentEditorBlock, DocumentEditorInput, DocumentNodeViews, NativeDocumentEditor } from './schema.tsx'
import { documentSelection, nativeBlockText, nativeTextPoint } from './selection.ts'
import type { NativeDocumentSelection } from './selection.ts'
import { DOCUMENT_EDITOR_MESSAGES, IMAGE_IMPORT_MESSAGES, slashAliases } from './messages.ts'
import { blockNoteDictionary } from './blocknote-messages.ts'
import { IMPORT_MESSAGES } from '../import-messages.ts'
import { imageFileInput, pickingImages } from './file-input.ts'
import type { ImageImportFailure } from './file-input.ts'
import { nativeTextClipboard } from './clipboard.ts'
import { documentPageBodies, focusDocumentEnd } from './page-body.ts'
import { documentBlockColors } from './colors.ts'
import { DOCUMENT_EDITOR_LOCALE, MATH_EDITOR } from './math.tsx'
import { DOCUMENT_LINKS, DocumentColorButton, DocumentLinkToolbar, DocumentSideMenu, DocumentTableCellButton, DocumentTableHandle, documentSlashMenu, FormulaToolbarButton, formulaSlashItems, openDocumentLink, slashItemsAt } from './authoring.tsx'
import type { DocumentLinks } from './authoring.tsx'
import { excludeCommentMarkHistory, nativeComments, nativeCommentSelection } from './comments.ts'
import type { DocumentThreadStore } from './comments.ts'
import { DocumentMenuRoot, linkToolbarFloating } from './popover.tsx'
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
// The formatting toolbar's icon buttons name themselves and their shortcut in the workbench's own tooltip.
const DocumentToolbarButton = forwardRef<HTMLButtonElement, ComponentProps['Generic']['Toolbar']['Button']>(function DocumentToolbarButton({ mainTooltip, secondaryTooltip, ...props }, ref) {
  const label = props.label ?? mainTooltip
  const button = label === undefined ? <MantineToolbarButton {...props} ref={ref} /> : <MantineToolbarButton {...props} ref={ref} label={label} />
  return mainTooltip ? <PmTooltip label={mainTooltip} shortcut={secondaryTooltip}>{button}</PmTooltip> : button
})

const DOCUMENT_EDITOR_COMPONENTS = { ...components, FormattingToolbar: { ...components.FormattingToolbar, Button: DocumentToolbarButton }, LinkToolbar: { ...components.LinkToolbar, Button: DocumentToolbarButton }, Generic: { ...components.Generic, Menu: { ...components.Generic.Menu, Root: DocumentMenuRoot }, Badge: { ...components.Generic.Badge, Root: DocumentReactionBadge }, Toolbar: { ...components.Generic.Toolbar, Button: DocumentToolbarButton } }, Comments: { ...components.Comments, Comment: DocumentComment, Editor: DocumentCommentEditor } }

export interface BlockNoteSurfaceProps {
  identity: string
  /** Explicit replacement of an external source; an own save acknowledgement must not change it. */
  reset?: number
  initialContent: DocumentEditorInput[]
  locale: Locale
  /** The language the document is written in (its `lang`), so the browser shapes its text and punctuation for it. */
  contentLang?: string
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
  /** The author asked to see the comments pane, e.g. after saving a place comment. */
  onOpenComments?(): void
  onReady?(editor: NativeDocumentEditor | undefined): void
  onComposition?(composing: boolean): void
  /** Shows a page of this document from an in-document link; false when none matches. */
  onSectionLink?(sectionId: string): boolean
  /** The slash menu's request to the AI for an animation where it was opened: it inserts nothing itself. */
  animationRequest?: { available(): boolean, request(editor: NativeDocumentEditor): void }
  children?: ReactNode
}

/** Text comments require a text range; opaque blocks use their preview's place-comment entry. */
function DocumentAddCommentButton() {
  const editor = useBlockNoteEditor(documentEditorSchema)
  const selectedText = useEditorState({ editor, selector: ({ editor }) => {
    const { selection } = editor.prosemirrorState
    return !selection.empty && Boolean(nativeTextPoint(editor, selection.from) && nativeTextPoint(editor, selection.to))
  } })
  return selectedText ? <AddCommentButton /> : null
}

function EditorToolbar(props: FormattingToolbarProps) {
  const editor = useBlockNoteEditor(documentEditorSchema)
  const title = useEditorState({ editor, selector: ({ editor }) => editor.getSelection()?.blocks.some(block => block.type === 'presmiumPage') ?? false })
  if (title) return <FormattingToolbar {...props}><DocumentAddCommentButton /></FormattingToolbar>
  return <FormattingToolbar {...props}>
    <BlockTypeSelect items={props.blockTypeSelectItems} />
    <BasicTextStyleButton basicTextStyle="bold" /><BasicTextStyleButton basicTextStyle="italic" />
    <BasicTextStyleButton basicTextStyle="underline" /><BasicTextStyleButton basicTextStyle="strike" /><BasicTextStyleButton basicTextStyle="code" />
    <TextAlignButton textAlignment="left" /><TextAlignButton textAlignment="center" /><TextAlignButton textAlignment="right" />
    <DocumentColorButton /><NestBlockButton /><UnnestBlockButton /><CreateLinkButton /><FormulaToolbarButton />
    <TableCellMergeButton />
    <DocumentAddCommentButton />
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
  return show && editor.getExtension('comments') ? <div className="pm-document-editor__comment-tools"><FormattingToolbar><DocumentAddCommentButton /></FormattingToolbar></div> : null
}

// Added items join the end of their group (formulas the one that holds tables, the animation request the one that holds
// pictures) so the menu keeps one heading per group.
function withGroupItems<Item extends { group?: string }>(items: Item[], added: Item[]): Item[] {
  const index = items.findLastIndex(item => item.group === added[0]?.group)
  return index < 0 ? [...items, ...added] : [...items.slice(0, index + 1), ...added, ...items.slice(index + 1)]
}

/** One native editor owns selection, transactions and history across the complete document. */
export function BlockNoteSurface(props: BlockNoteSurfaceProps) {
  const current = useRef(props)
  const uploads = useMemo(() => ({ controllers: new Set<AbortController>(), pending: Promise.resolve() }), [props.identity, props.reset ?? 0])
  const [fileErrors, setFileErrors] = useState<{ identity: string, failures: ImageImportFailure[] }>()
  current.current = props
  const dictionary = blockNoteDictionary(props.locale)
  const t = DOCUMENT_EDITOR_MESSAGES[props.locale]
  const linkToolbarOptions = useMemo(linkToolbarFloating, [])
  const slashBlocksOnly = useRef(false)
  const slashMenu = useMemo(() => documentSlashMenu(() => slashBlocksOnly.current), [])
  const links = useMemo<DocumentLinks>(() => ({ openSection: sectionId => current.current.onSectionLink?.(sectionId) ?? false }), [])
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
      const text = event.clipboardData?.getData('text/plain')
      if (text && !event.clipboardData?.getData('text/html') && current.current.nodeViews?.pasteText?.(text, editor as NativeDocumentEditor)) return true
      const files = [...event.clipboardData?.files ?? []]
      if (files.length && !event.clipboardData?.getData('text/html')) {
        editor.getExtension(imageFileInput)?.insert(files)
        return true
      }
      return defaultPasteHandler({ prioritizeMarkdownOverHTML: false })
    },
    dictionary, tables: { splitCells: true, cellBackgroundColor: true, cellTextColor: true, headers: true },
    // The surface's own click handler opens links in editable and read-only states alike.
    links: { onClick: () => true },
    extensions: [nativeTextClipboard, documentBlockColors, documentPageBodies(), imageFileInput({
      onStart: () => { if (current.current.identity === props.identity) setFileErrors(undefined) },
      onFailure: failure => { if (current.current.identity === props.identity) setFileErrors(value => ({ identity: props.identity, failures: [...(value?.identity === props.identity ? value.failures : []), failure] })) },
    }), ...props.comments ? [nativeCommentSelection(), nativeComments(props.comments, t.author, IMPORT_MESSAGES[props.locale].commentAuthor)] : []],
    domAttributes: { block: { 'data-document-editor-block': '' }, editor: { lang: props.contentLang ?? props.locale } },
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
  return <DOCUMENT_EDITOR_LOCALE.Provider value={props.locale}><MATH_EDITOR.Provider value={props.nodeViews?.mathEditor}><DOCUMENT_LINKS.Provider value={links}><DOCUMENT_NODE_VIEWS.Provider value={props.nodeViews ?? {}}><COMMENT_EDITOR_CONTEXT.Provider value={props.comments ? { store: props.comments, locale: props.locale, sidebar: Boolean(props.commentsPortal), readOnly: Boolean(props.readOnly), getPositionToken: () => current.current.getPositionToken?.(), onDraftRestore: () => current.current.onCommentDraftRestore?.(), openComments: () => current.current.onOpenComments?.() } : undefined}>
    <div className="pm-document-editor pm-ui-block-editor pm-ui" data-document-editor={props.identity}
      onDragEnter={event => { if (event.dataTransfer.types.includes('Files')) event.stopPropagation() }}
      onDragOver={event => { if (event.dataTransfer.types.includes('Files')) event.stopPropagation() }}
      onClick={event => {
        const link = event.target instanceof Element ? event.target.closest('a[data-inline-content-type="link"]') : null
        const href = link?.getAttribute('href')
        if (!href || event.button !== 0) return
        event.preventDefault()
        openDocumentLink(href, links)
      }}
      onCompositionStart={() => current.current.onComposition?.(true)}
      onCompositionEnd={() => queueMicrotask(() => current.current.onComposition?.(false))}>
      {fileErrors?.identity === props.identity && <PmNotice tone="danger" action={<PmIconButton small icon="close" label={fileMessages.dismiss} onClick={() => setFileErrors(undefined)} />}><ul className="pm-document-editor__file-errors">{fileErrors.failures.map((failure, index) => <li key={index}>{failure.name} · {fileMessages[failure.kind]}</li>)}</ul></PmNotice>}
      <BlockNoteView editor={editor} editable={!props.readOnly} theme={DOCUMENT_EDITOR_THEME} formattingToolbar={false} slashMenu={false} linkToolbar={false} sideMenu={false} tableHandles={false} renderEditor={false} comments={false}
        onChange={() => current.current.onChange(editor.document, editor)}
        onSelectionChange={() => current.current.onSelection?.(documentSelection(editor))}>
        <ComponentsContext.Provider value={DOCUMENT_EDITOR_COMPONENTS}>
        <PlainContentComments editor={editor} />
        <BlockNoteViewEditor><NewCommentDraftProvider>
        <DocumentNewCommentController />{!props.commentsPortal && <DocumentFloatingThreadController />}{props.commentsPortal && <><RenderInPortalElement target={props.commentsPortal}><DocumentThreadsSidebar><DocumentNewCommentRecovery /></DocumentThreadsSidebar></RenderInPortalElement></>}
        <FormattingToolbarController formattingToolbar={EditorToolbar} />
        <LinkToolbarController linkToolbar={DocumentLinkToolbar} floatingUIOptions={linkToolbarOptions} />
        <SideMenuController sideMenu={DocumentSideMenu} />
        <TableHandlesController tableHandle={DocumentTableHandle} tableCellHandle={DocumentTableCellButton} />
        <SuggestionMenuController triggerCharacter="/" suggestionMenuComponent={slashMenu} getItems={async query => { slashBlocksOnly.current = false; if (editor.getTextCursorPosition().block.type === 'presmiumPage') return []; const offered = slashItemsAt(editor, [...withGroupItems(withGroupItems(pickingImages(editor, getDefaultReactSlashMenuItems(editor)), formulaSlashItems(editor, props.locale, dictionary.slash_menu.table.group)), current.current.animationRequest?.available() ? [{
          title: t.animateWithAI, subtext: t.animateWithAIHint, group: dictionary.slash_menu.image.group, icon: <PmIcon name="sparkle" />, aliases: slashAliases('animateWithAIAliases'),
          // The menu has already taken back the typed “/” and query; the AI is asked, the document stays as it was.
          onItemClick: () => current.current.animationRequest?.request(editor),
        }] : []), ...current.current.nodeViews?.slashItems?.(editor) ?? [], {
          title: t.page, aliases: slashAliases('pageAliases'), group: t.document,
          // As with the page bar's +, the new page's default title is selected: the author's next words name it.
          onItemClick: () => {
            const { block: current, prevBlock } = editor.getTextCursorPosition()
            // The line the “/” was typed on, left empty, moves to the new page as its first line, unless it is all the old page has.
            const moveLine = current.type === 'paragraph' && Array.isArray(current.content) && !current.content.length && !current.children.length && prevBlock && prevBlock.type !== 'presmiumPage'
            const [page] = editor.insertBlocks([{ type: 'presmiumPage', props: { sectionId: randomUUID() }, content: t.untitledPage }], current, moveLine ? 'before' : 'after')
            const title = page && nativeBlockText(editor, page.id)
            if (!title) return
            editor.transact(transaction => transaction.setSelection(TextSelection.create(transaction.doc, title.from, title.to)).scrollIntoView())
            editor.focus()
          },
        }], query); slashBlocksOnly.current = offered.blocksOnly; return offered.items }} />
        {props.nodeViews?.editorChildren?.(editor)}
        {props.children}
        </NewCommentDraftProvider></BlockNoteViewEditor>
        </ComponentsContext.Provider>
      </BlockNoteView>
      <div className="pm-document-editor__end" aria-hidden="true" data-editable={props.readOnly ? undefined : ''} onMouseDown={event => {
        if (event.button !== 0 || !editor.isEditable || editor.prosemirrorView.composing) return
        event.preventDefault()
        focusDocumentEnd(editor)
      }} />
    </div>
  </COMMENT_EDITOR_CONTEXT.Provider></DOCUMENT_NODE_VIEWS.Provider></DOCUMENT_LINKS.Provider></MATH_EDITOR.Provider></DOCUMENT_EDITOR_LOCALE.Provider>
}
