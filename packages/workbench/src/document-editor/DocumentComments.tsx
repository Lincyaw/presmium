import { createContext, useContext, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import type { FocusEvent, ReactNode } from 'react'
import { CommentEditorSubmitExtension, CommentsExtension } from '@blocknote/core/comments'
import { components } from '@blocknote/mantine'
import { getReferenceText, Thread, useBlockNoteEditor, useCreateBlockNote, useExtension, useExtensionState, useThreads } from '@blocknote/react'
import type { ComponentProps, ThreadProps } from '@blocknote/react'
import type { Locale } from '../messages.ts'
import { PmButton, PmNotice, PmSelect } from '../components.tsx'
import type { DocumentCommentEditorHandle, DocumentThreadStore } from './comments.ts'
import type { CommentDrafts, CommentDraftCandidate, CommentDraftRecord, CommentDraftReference } from './comment-drafts.ts'
import { isNewCommentDraft, sameCommentDraftTarget } from './comment-drafts.ts'
import { createRichProjection, nativeRichTextToProduct, productRichTextToNative } from './rich-text.ts'
import { commentEditorSchema } from './schema.tsx'
import type { DocumentEditorBlock } from './schema.tsx'
import { DOCUMENT_EDITOR_MESSAGES } from './messages.ts'

export const COMMENT_EDITOR_CONTEXT = createContext<{ store: DocumentThreadStore, locale: Locale, sidebar: boolean, getPositionToken?(): string | undefined, onDraftRestore?(): void } | undefined>(undefined)
const THREAD_CONTEXT = createContext<string | undefined>(undefined)
const emptySubscribe = () => () => {}
const emptyState = { candidates: [], pending: false, failed: false, reading: false } as const
const referenceKey = (value: CommentDraftReference) => JSON.stringify([value.id, value.revision, value.token])
const MantineCommentEditor = components.Comments.Editor
// A native Thread retains its reply editor while another thread is selected.
const composerDrafts = new WeakMap<object, { owner: CommentDrafts | undefined, current?: CommentDraftRecord, rich: ReturnType<typeof createRichProjection> }>()

/** The public Thread boundary supplies identity; an editor never guesses the selected thread. */
export function DocumentCommentThread(props: ThreadProps) {
  return <THREAD_CONTEXT.Provider value={props.thread.id}><Thread {...props} /></THREAD_CONTEXT.Provider>
}

/** Native Thread composition, with the same public focus/blur and position ordering as the sidebar. */
export function DocumentThreadsSidebar({ children }: { children?: ReactNode }) {
  const editor = useBlockNoteEditor(), comments = useExtension(CommentsExtension), threads = useThreads()
  const { selectedThreadId, threadPositions } = useExtensionState(CommentsExtension)
  const ordered = [...threads.values()].sort((a, b) => (threadPositions.get(a.id)?.from ?? Number.MAX_VALUE) - (threadPositions.get(b.id)?.from ?? Number.MAX_VALUE))
  const focus = (id: string, event: FocusEvent) => { if (!(event.target as HTMLElement).closest('.bn-action-toolbar')) comments.selectThread(id) }
  const blur = (event: FocusEvent) => {
    const next = event.relatedTarget
    if (!next || next.closest('.bn-action-toolbar')) return
    const parent = next.closest('.bn-thread')
    if (!parent || !(event.target instanceof Node) || !parent.contains(event.target)) comments.selectThread(undefined)
  }
  return <div className="bn-threads-sidebar">{children}<CommentDraftRetrieval />{ordered.map(thread => <DocumentCommentThread key={thread.id} thread={thread}
    selected={selectedThreadId === thread.id} orphaned={!threadPositions.has(thread.id)} referenceText={getReferenceText(editor, threadPositions.get(thread.id))}
    onFocus={event => focus(thread.id, event)} onBlur={blur} tabIndex={0} />)}</div>
}

function DraftPreview({ candidate }: { candidate: CommentDraftCandidate }) {
  const projection = useRef(createRichProjection())
  const editor = useCreateBlockNote({ schema: commentEditorSchema, trailingBlock: false, initialContent: productRichTextToNative(candidate.content, projection.current) }, [candidate.id, candidate.revision, candidate.token])
  return <MantineCommentEditor editor={editor} editable={false} autoFocus={false} />
}

export function DraftChoices({ candidates, disabled, onRecover, onDiscard, preview = false, canRecover, unavailableMessage }: {
  candidates: readonly CommentDraftCandidate[], disabled?: boolean, onRecover?(candidate: CommentDraftCandidate): Promise<void>,
  onDiscard(candidate: CommentDraftCandidate): Promise<void>, preview?: boolean, canRecover?(candidate: CommentDraftCandidate): boolean, unavailableMessage?: string,
}) {
  const context = useContext(COMMENT_EDITOR_CONTEXT), t = DOCUMENT_EDITOR_MESSAGES[context?.locale ?? 'en']
  const [selected, setSelected] = useState(''), [busy, setBusy] = useState(false)
  const candidate = candidates.find(value => referenceKey(value) === selected)
  const act = async (action: (candidate: CommentDraftCandidate) => Promise<void>) => {
    if (!candidate || busy || disabled) return
    setBusy(true)
    try { await action(candidate) } finally { setBusy(false) }
  }
  if (!candidates.length) return null
  return <PmNotice tone="accent"><PmSelect label={t.commentDrafts} value={candidate ? selected : ''} disabled={disabled || busy} onChange={event => setSelected(event.target.value)}>
    <option value="">{t.commentChooseDraft}</option>{candidates.map(value => <option key={referenceKey(value)} value={referenceKey(value)}>{new Date(value.updatedAt).toLocaleString(context?.locale)} · {isNewCommentDraft(value.target) ? t.commentNewDraft : value.target.commentId ? t.commentEditDraft : t.commentReplyDraft}{value.storage === 'session' ? ` · ${t.commentSessionOnly}` : ''}</option>)}
  </PmSelect>{candidate && preview && <DraftPreview candidate={candidate} />}
    {candidate && unavailableMessage && canRecover && !canRecover(candidate) && <PmNotice tone="warn">{unavailableMessage}</PmNotice>}
    <span className="pmw-notice__actions">{onRecover && <PmButton small variant="primary" disabled={!candidate || disabled || busy || candidate.storage === 'session' || canRecover && !canRecover(candidate)} loading={busy} onClick={() => void act(onRecover)}>{t.commentRecover}</PmButton>}
    <PmButton small disabled={!candidate || disabled || busy} onClick={() => void act(onDiscard)}>{t.commentDiscard}</PmButton></span>
  </PmNotice>
}

function CommentDraftRetrieval() {
  const context = useContext(COMMENT_EDITOR_CONTEXT), drafts = context?.store.drafts
  const state = useSyncExternalStore(drafts?.subscribe ?? emptySubscribe, drafts?.snapshot ?? (() => emptyState))
  const candidates = state.candidates.filter(value => !isNewCommentDraft(value.target) && (value.storage === 'session' || context?.store.draftTargetState(value.target) === 'unavailable'))
  if (!drafts) return null
  return <>{state.failed && <PmNotice tone="warn">{DOCUMENT_EDITOR_MESSAGES[context?.locale ?? 'en'].commentBackupFailed}</PmNotice>}<DraftChoices candidates={candidates} preview onDiscard={async candidate => { await drafts.discard(candidate) }} /></>
}

export function DocumentCommentEditor(props: ComponentProps['Comments']['Editor']) {
  const context = useContext(COMMENT_EDITOR_CONTEXT), threadId = useContext(THREAD_CONTEXT)
  const [handle, setHandle] = useState<DocumentCommentEditorHandle>(), [, setRevision] = useState(0)
  const current = useRef(props), active = useRef(true), input = useRef(0), composing = useRef(false), submitting = useRef(false), suppress = useRef(false)
  current.current = props
  const drafts = context?.store.drafts
  const record = useMemo(() => {
    let value = composerDrafts.get(props.editor)
    if (!value || value.owner !== drafts) { value = { owner: drafts, rich: createRichProjection() }; composerDrafts.set(props.editor, value) }
    return value
  }, [props.editor, drafts])
  const rich = useMemo(() => ({ current: record.rich }), [record])
  const state = useSyncExternalStore(drafts?.subscribe ?? emptySubscribe, drafts?.snapshot ?? (() => emptyState))
  useLayoutEffect(() => {
    if (!context || !threadId) return
    active.current = true; ++input.current
    const value = context.store.bindEditor(props.editor, props.editable, threadId)
    setHandle(value)
    const original = props.editor.getExtension(CommentEditorSubmitExtension)
    let guarded: typeof original
    if (original && value.target && drafts) {
      props.editor.replaceExtension(original, CommentEditorSubmitExtension({ onSubmit: async () => {
        if (composing.current || !active.current) return
        const target = value.target!, before = context.store.threadSnapshot(target.threadId), ids = new Set(before?.comments.map(comment => comment.id))
        const own = record.current
        submitting.current = true
        try {
          const result = original.submit(), thread = context.store.threadSnapshot(target.threadId)
          const comment = target.commentId ? thread?.comments.find(comment => comment.id === target.commentId) : thread?.comments.find(comment => !ids.has(comment.id))
          if (comment && thread !== before) { drafts.submitted(own, comment); record.current = undefined; setRevision(value => value + 1) }
          await result
        } finally { submitting.current = false }
      } }))
      guarded = props.editor.getExtension(CommentEditorSubmitExtension)
      context.store.refreshEditorCallbacks()
    }
    const stop = props.editor.onChange(() => {
      if (!active.current || !current.current.editable || suppress.current || submitting.current) return
      ++input.current
      const version = context.store.version
      if (!value.target || !drafts || !version) return
      // Empty reply and native Cancel are not new unpublished content.
      if (props.editor.isEmpty && !value.target.commentId) { if (record.current) { void drafts.clearOwn(record.current); record.current = undefined }; return }
      const content = nativeRichTextToProduct(props.editor.document as DocumentEditorBlock[], rich.current)
      record.current = drafts.write(record.current?.target ?? value.target, record.current?.version ?? version, content, composing.current, record.current) ?? record.current
      setRevision(value => value + 1)
    })
    return () => {
      active.current = false; ++input.current; stop()
      if (original && guarded && !props.editor.prosemirrorView.isDestroyed && props.editor.getExtension(CommentEditorSubmitExtension) === guarded) props.editor.replaceExtension(guarded, original)
      value.close()
    }
  }, [context?.store, props.editor, threadId])
  const editable = useRef(props.editable)
  useLayoutEffect(() => {
    handle?.setEditable(props.editable)
    if (editable.current && !props.editable && record.current && drafts) { const value = record.current; record.current = undefined; void drafts.clearOwn(value) }
    editable.current = props.editable
  }, [handle, props.editable, drafts])
  const failure = useSyncExternalStore(handle?.subscribe ?? emptySubscribe, handle?.failure ?? (() => undefined))
  const target = handle?.target, t = DOCUMENT_EDITOR_MESSAGES[context?.locale ?? 'en']
  const candidates = target ? state.candidates.filter(value => sameCommentDraftTarget(value.target, target) && value.id !== record.current?.id) : []
  const recover = async (candidate: CommentDraftCandidate) => {
    if (!drafts || !target || !context?.store.version || !props.editable || composing.current || submitting.current) return
    const before = input.current, version = context.store.version
    const own = record.current
    if (own && !await drafts.confirm(own)) return
    if (!active.current || input.current !== before || context.store.version !== version || composing.current || !current.current.editable) return
    const value = await drafts.recover(candidate, target, version)
    if (!value || !active.current || input.current !== before || context.store.version !== version || composing.current || !current.current.editable) return
    suppress.current = true
    try { props.editor.replaceBlocks(props.editor.document, productRichTextToNative(value.content, rich.current)); record.current = value; handle?.restoreBaseline(!isNewCommentDraft(candidate.target) ? candidate.target.baseline : undefined); ++input.current; setRevision(value => value + 1) }
    finally { suppress.current = false }
    await drafts.discard(candidate)
  }
  const composition = (value: boolean) => {
    composing.current = value
    if (record.current && target && drafts && context?.store.version) {
      record.current = drafts.write(record.current.target, record.current.version, nativeRichTextToProduct(props.editor.document as DocumentEditorBlock[], rich.current), value, record.current) ?? record.current
      setRevision(value => value + 1)
    }
  }
  return <div data-comment-draft-editor={target ? JSON.stringify([target.threadId, target.commentId ?? null]) : undefined} aria-busy={state.pending || undefined}
    onCompositionStart={() => composition(true)} onCompositionEnd={() => composition(false)}>
    <MantineCommentEditor {...props} />
    {failure && <PmNotice tone="danger">{failure === 'changed' ? t.commentChanged : t.commentUnavailable}</PmNotice>}
    {drafts && props.editable && <DraftChoices candidates={candidates} disabled={composing.current || submitting.current} onRecover={recover} onDiscard={async candidate => { await drafts.discard(candidate) }} />}
    {drafts && props.editable && state.failed && !context?.sidebar && <PmNotice tone="warn">{t.commentBackupFailed}</PmNotice>}
  </div>
}
