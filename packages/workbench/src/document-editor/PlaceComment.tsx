import { useContext, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import type { ContextType } from 'react'
import type { BlockNoteEditor } from '@blocknote/core'
import { CommentEditorSubmitExtension } from '@blocknote/core/comments'
import { components } from '@blocknote/mantine'
import { useCreateBlockNote, useDictionary, useEditorState, useThreads } from '@blocknote/react'
import { randomUUID } from '@lincyaw/kernel'
import { PmButton, PmIconButton, PmNotice, PmPopover, PmSelect } from '../components.tsx'
import { useWorkbench, useWorkbenchState } from '../context.tsx'
import { COMMENT_EDITOR_CONTEXT, DraftChoices } from './DocumentComments.tsx'
import { isNewCommentDraft, newCommentDraftSignature, sameCommentDraftTarget } from './comment-drafts.ts'
import type { CommentDraftCandidate, CommentDraftRecord, NewCommentDraftTarget } from './comment-drafts.ts'
import { DOCUMENT_EDITOR_MESSAGES } from './messages.ts'
import { commentEditorSchema } from './schema.tsx'
import type { DocumentEditorBlock } from './schema.tsx'
import { createRichProjection, nativeRichTextToProduct, productRichTextToNative } from './rich-text.ts'

const MantineCommentEditor = components.Comments.Editor
const emptyDrafts = { candidates: [], pending: false, failed: false, reading: false } as const
const subscribeEmpty = () => () => {}
type CommentContext = NonNullable<ContextType<typeof COMMENT_EDITOR_CONTEXT>>

/** The step's place anchor: the whole block when no step is chosen. */
function placeOf(blockId: string, stepId: string | undefined) {
  return stepId === undefined ? { blockId } : { blockId, stepId }
}

/**
 * A block preview's own comment entry. The button belongs to the preview header; the composer reuses the canonical
 * comment editor and draft bank instead of inventing a second comment flow.
 */
export function PlaceCommentButton(props: {
  blockId: string, sectionId: string, stepId: string, stepIndex: number, onPause(): void,
}) {
  const context = useContext(COMMENT_EDITOR_CONTEXT)
  if (!context || context.readOnly || !context.store.auth.canCreateThread()) return null
  return <PlaceCommentButtonContent {...props} context={context} />
}

function PlaceCommentButtonContent({ blockId, sectionId, stepId, stepIndex, onPause, context }: {
  blockId: string, sectionId: string, stepId: string, stepIndex: number, onPause(): void, context: CommentContext,
}) {
  const threads = useThreads(), workbench = useWorkbench()
  const t = DOCUMENT_EDITOR_MESSAGES[context.locale]
  const [open, setOpen] = useState(false), [selected, setSelected] = useState<string | undefined>(stepId)
  const count = useMemo(() => [...threads.values()].filter(thread => {
    if (thread.deletedAt || thread.resolved) return false
    const anchor = context.store.placeAnchorOf(thread.id)
    return anchor?.blockId === blockId && anchor.stepId === stepId
  }).length, [threads, context, blockId, stepId])
  const change = (next: boolean) => {
    setOpen(next)
    if (next) setSelected(stepId)
  }
  return <PmPopover open={open} label={t.stepComment(stepIndex)} name="pm-document-place-comment" placement="below-end" onOpenChange={change}
    trigger={<PmIconButton tooltip={false} small icon="comment-add" label={t.stepCommentHint(stepIndex, count)} onClick={onPause} />}>
    {open && <PlaceCommentComposer key={selected ?? 'block'} context={context} blockId={blockId} sectionId={sectionId} stepId={selected}
      onSelect={next => { setSelected(next); if (next !== undefined) workbench.observeDocumentStep(sectionId, next) }} onClose={() => setOpen(false)} />}
  </PmPopover>
}

function PlaceCommentComposer({ context, blockId, sectionId, stepId, onSelect, onClose }: {
  context: CommentContext, blockId: string, sectionId: string, stepId: string | undefined, onSelect(stepId: string | undefined): void, onClose(): void,
}) {
  const workbench = useWorkbench()
  const fallback = context.store.document
  const document = useWorkbenchState(state => state.authoring?.content) ?? fallback
  const section = document?.sections[sectionId]
  const t = DOCUMENT_EDITOR_MESSAGES[context.locale]
  const store = context.store, drafts = store.drafts, dictionary = useDictionary()
  const rich = useMemo(() => createRichProjection(), [])
  const [target] = useState<NewCommentDraftTarget>(() => {
    const anchor = placeOf(blockId, stepId)
    return { kind: 'create', intentId: randomUUID(), documentId: document!.id, anchor, signature: newCommentDraftSignature(document!, anchor) }
  })
  const [busy, setBusy] = useState(false), [failure, setFailure] = useState(false)
  const record = useRef<CommentDraftRecord>(), composing = useRef(false), submitting = useRef(false), composer = useRef(randomUUID())
  const submitRef = useRef<() => Promise<void>>(() => Promise.resolve())
  const editor: BlockNoteEditor<any, any, any> = useCreateBlockNote({
    schema: commentEditorSchema, trailingBlock: false,
    dictionary: { ...dictionary, placeholders: { ...dictionary.placeholders, emptyDocument: t.stepCommentPlaceholder } },
    extensions: [CommentEditorSubmitExtension({ onSubmit: async () => submitRef.current() })],
  }, [blockId, stepId])
  const empty = useEditorState({ editor, selector: ({ editor }) => editor.isEmpty })
  const write = (composingNow: boolean) => {
    const version = store.version, current = record.current
    if (!drafts || !version) return
    if (editor.isEmpty) {
      if (current) { record.current = undefined; void drafts.clearOwn(current) }
      return
    }
    const next = drafts.write(current?.target ?? target, current?.version ?? version, nativeRichTextToProduct(editor.document as DocumentEditorBlock[], rich), composingNow, current)
    if (next) record.current = next
  }
  useLayoutEffect(() => {
    if (!drafts) return
    const stop = editor.onChange(() => { if (!submitting.current) write(composing.current) })
    return stop
  }, [drafts, editor, target, rich])
  useLayoutEffect(() => {
    if (!drafts) return
    return drafts.registerComposer({ id: composer.current, target,
      snapshot: () => ({ record: record.current, composing: composing.current || editor.prosemirrorView.composing, available: !editor.prosemirrorView.isDestroyed }),
      targetState: () => store.draftTargetState(target) })
  }, [drafts, store, target, editor])
  const composition = (value: boolean) => { composing.current = value; write(value) }
  const submit = async () => {
    if (submitting.current || busy || editor.isEmpty || editor.prosemirrorView.composing) return
    if (!store.auth.canCreateThread() || store.draftTargetState(target) !== 'current') { setFailure(true); return }
    setBusy(true); setFailure(false); submitting.current = true
    try {
      store.beforeAction?.()
      const thread = await store.createPlaceThread({ blockId, stepId, body: editor.document })
      const actual = store.threadSnapshot(thread.id)
      if (actual) { const current = record.current; if (current) { drafts?.submitted(current, actual.comments[0]!, actual); record.current = undefined } }
      context?.openComments?.()
      onClose()
    } catch { setFailure(true) } finally { submitting.current = false; setBusy(false) }
  }
  submitRef.current = submit
  const draftsState = useSyncExternalStore(drafts?.subscribe ?? subscribeEmpty, drafts?.snapshot ?? (() => emptyDrafts))
  const candidates = draftsState.candidates.filter(candidate => isNewCommentDraft(candidate.target) && sameCommentDraftTarget(candidate.target, target))
  const recover = async (candidate: CommentDraftCandidate) => {
    const version = store.version
    if (!drafts || !version) return
    const next = await drafts.recover(candidate, target, version)
    if (!next) return
    // Keep the recovered record current before the editor publishes its content, then retire the old copy.
    record.current = next
    void drafts.discard(candidate)
    editor.replaceBlocks(editor.document, productRichTextToNative(next.content, rich))
  }
  const discard = async (candidate: CommentDraftCandidate) => { await drafts?.discard(candidate) }
  return <div className="pm-document-place-comment__body pm-ui-block-editor">
    <PmSelect label={t.stepCommentStep} value={stepId ?? ''} disabled={busy || !empty} onChange={event => onSelect(event.currentTarget.value || undefined)}>
      <option value="">{t.stepCommentWhole}</option>
      {section?.stepOrder.map((id, index) => <option key={id} value={id}>{t.stepCommentOption(index + 1, document?.steps[id]?.title ?? '')}</option>)}
    </PmSelect>
    <div className="pm-document-place-comment__editor" onCompositionStart={() => composition(true)} onCompositionEnd={() => composition(false)}>
      <MantineCommentEditor editor={editor} editable autoFocus />
    </div>
    {failure && <PmNotice tone="warn">{t.stepCommentFailed}</PmNotice>}
    {candidates.length > 0 && <DraftChoices candidates={candidates} preview disabled={busy} canRecover={() => store.draftTargetState(target) === 'current'}
      unavailableMessage={t.commentTargetUnavailable} onRecover={recover} onDiscard={discard} />}
    <div className="pm-document-place-comment__actions">
      <PmButton small disabled={busy} onClick={onClose}>{t.stepCommentCancel}</PmButton>
      <PmButton small variant="primary" loading={busy} disabled={busy || empty} onClick={() => void submit()}>{t.stepCommentSave}</PmButton>
    </div>
  </div>
}
