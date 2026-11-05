import { useContext, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import type { ContextType } from 'react'
import type { BlockNoteEditor } from '@blocknote/core'
import { CommentEditorSubmitExtension } from '@blocknote/core/comments'
import { components } from '@blocknote/mantine'
import { useCreateBlockNote, useDictionary, useEditorState, useThreads } from '@blocknote/react'
import { isDocumentPlaceAnchor, randomUUID } from '@lincyaw/kernel'
import { PmButton, PmIconButton, PmNotice, PmPopover, PmSelect } from '../components.tsx'
import { useWorkbench, useWorkbenchState } from '../context.tsx'
import { COMMENT_EDITOR_CONTEXT, DraftChoices } from './DocumentComments.tsx'
import { isNewCommentDraft, newCommentDraftSignature, sameCommentDraftTarget } from './comment-drafts.ts'
import type { CommentDraftCandidate, CommentDraftRecord, CommentDraftOperation, CommentDraftComposer, NewCommentDraftTarget } from './comment-drafts.ts'
import { discardNativeCommentDraft } from './comment-draft-actions.ts'
import { waitForDraft } from '../document-draft-store.ts'
import { isApprovalTarget } from '../approvals.tsx'
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
  const drafts = context.store.drafts, native = useRef<CommentDraftComposer>(), composerId = useRef(randomUUID()), revision = useRef(0)
  const draftState = useSyncExternalStore(drafts?.subscribe ?? subscribeEmpty, drafts?.snapshot ?? (() => emptyDrafts))
  const needed = open || draftState.candidates.some(candidate => isNewCommentDraft(candidate.target) && candidate.target.anchor && isDocumentPlaceAnchor(candidate.target.anchor) && candidate.target.anchor.blockId === blockId)
  const opening = useRef<{ previous?: CommentDraftRecord, ready?(owner?: CommentDraftComposer): void }>()
  const alive = useRef(true)
  const accept = (target: CommentDraftCandidate['target']) => isNewCommentDraft(target) && Boolean(target.anchor && isDocumentPlaceAnchor(target.anchor) && target.anchor.blockId === blockId
    && (target.anchor.stepId === undefined || context.store.document.sections[sectionId]?.stepOrder.includes(target.anchor.stepId)) && context.store.draftTargetState(target) === 'current')
  const ready = useMemo(() => (owner: CommentDraftComposer | undefined) => { native.current = owner; if (owner) opening.current?.ready?.(owner) }, [])
  useLayoutEffect(() => {
    alive.current = true
    if (!drafts || !needed) return
    const restore = async (candidate: CommentDraftCandidate, action: CommentDraftOperation): Promise<CommentDraftRecord | undefined> => {
      if (!accept(candidate.target) || !isNewCommentDraft(candidate.target) || !candidate.target.anchor || !isDocumentPlaceAnchor(candidate.target.anchor)) return
      const before = native.current, previous = before?.snapshot().record, version = context.store.version, request = ++revision.current, targetStep = candidate.target.anchor.stepId
      const guard = () => {
        action.signal?.throwIfAborted(); action.guard?.(); context.store.beforeAction?.()
        if (!alive.current || revision.current !== request || context.store.version !== version || !accept(candidate.target)) throw new Error('client-comment-composer-changed')
      }
      guard()
      if (previous && !await waitForDraft(drafts.confirm(previous), action.signal)) return
      guard()
      let resolve!: (owner?: CommentDraftComposer) => void
      const mounted = new Promise<CommentDraftComposer | undefined>(yes => { resolve = yes })
      const transition = { previous, ready: resolve }; opening.current = transition
      try {
        onPause(); setSelected(targetStep); setOpen(true)
        if (targetStep !== undefined) workbench.observeDocumentStep(sectionId, targetStep)
        // A mounted matching form can be reused; otherwise the keyed native form supplies readiness.
        const same = before && sameCommentDraftTarget(before.target, candidate.target)
        const actual = same ? before : await waitForDraft(mounted, action.signal)
        guard()
        if (!actual?.restore || native.current !== actual || !actual.snapshot().available || actual.snapshot().composing || !same && actual.snapshot().record) return
        const value = await actual.restore(candidate, { signal: action.signal, guard })
        return value
      } finally { if (opening.current === transition) opening.current = undefined }
    }
    const stop = drafts.registerComposer({ id: composerId.current, target: { kind: 'create', intentId: composerId.current, documentId: context.store.document.id }, accepts: accept,
      snapshot: () => { const current = native.current?.snapshot(); return { record: opening.current ? opening.current.previous : current?.record,
        composing: current?.composing ?? false, available: alive.current && !context.readOnly && context.store.auth.canCreateThread() && (current?.available ?? true) } },
      targetState: target => target && accept(target) ? 'current' : 'unavailable', restore })
    return () => { alive.current = false; revision.current++; opening.current?.ready?.(); opening.current = undefined; stop() }
  }, [drafts, context.store, blockId, sectionId, needed])
  const count = useMemo(() => [...threads.values()].filter(thread => {
    if (thread.deletedAt || thread.resolved) return false
    const anchor = context.store.placeAnchorOf(thread.id)
    return anchor?.blockId === blockId && anchor.stepId === stepId
  }).length, [threads, context, blockId, stepId])
  const change = (next: boolean) => {
    revision.current++; opening.current?.ready?.()
    setOpen(next)
    if (next) setSelected(stepId)
  }
  return <PmPopover open={open} label={t.stepComment(stepIndex)} name="pm-document-place-comment" placement="below-end" onOpenChange={change}
    onInteractOutside={event => { if (isApprovalTarget(event.detail.originalEvent.target)) event.preventDefault() }}
    trigger={<PmIconButton tooltip={false} small icon="comment-add" label={t.stepCommentHint(stepIndex, count)} onClick={onPause} />}>
    {open && <PlaceCommentComposer key={selected ?? 'block'} context={context} blockId={blockId} sectionId={sectionId} stepId={selected}
      onReady={ready} onSelect={next => { revision.current++; setSelected(next); if (next !== undefined) workbench.observeDocumentStep(sectionId, next) }} onClose={() => change(false)} />}
  </PmPopover>
}

function PlaceCommentComposer({ context, blockId, sectionId, stepId, onSelect, onClose, onReady }: {
  context: CommentContext, blockId: string, sectionId: string, stepId: string | undefined, onSelect(stepId: string | undefined): void, onClose(): void, onReady(owner?: CommentDraftComposer): void,
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
  const active = useRef(true), input = useRef(0), suppress = useRef(false)
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
    active.current = true
    const stop = editor.onChange(() => { if (!submitting.current && !suppress.current) { input.current++; write(composing.current) } })
    return () => { active.current = false; input.current++; stop() }
  }, [drafts, editor, target, rich])
  useLayoutEffect(() => {
    if (!drafts) return
    const owner: CommentDraftComposer = { id: composer.current, target,
      snapshot: () => ({ record: record.current, composing: composing.current || editor.prosemirrorView.composing, available: active.current && !submitting.current && !editor.prosemirrorView.isDestroyed }),
      targetState: () => store.draftTargetState(target), restore: recover, discard: discardActive }
    const stop = drafts.registerComposer(owner); onReady(owner)
    return () => { onReady(); stop() }
  }, [drafts, store, target, editor])
  const composition = (value: boolean) => { composing.current = value; input.current++; write(value) }
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
  const nativeGuard = () => {
    const version = store.version, before = input.current, own = record.current, native = editor.prosemirrorState, position = context.getPositionToken?.()
    return () => {
      store.beforeAction?.()
      if (!active.current || !version || store.version !== version || input.current !== before || record.current !== own || composing.current || submitting.current
        || editor.prosemirrorView.isDestroyed || editor.prosemirrorView.composing || editor.prosemirrorState.doc !== native.doc || editor.prosemirrorState.selection !== native.selection
        || context.getPositionToken?.() !== position || !store.auth.canCreateThread()) throw new Error('client-comment-composer-changed')
    }
  }
  const recover = async (candidate: CommentDraftCandidate, operation?: CommentDraftOperation): Promise<CommentDraftRecord | undefined> => {
    const version = store.version
    if (!drafts || !version) return
    const current = nativeGuard(), guard = () => { operation?.signal?.throwIfAborted(); operation?.guard?.(); current(); if (store.draftTargetState(target) !== 'current') throw new Error('client-comment-target-changed') }
    guard()
    if (record.current && !await waitForDraft(drafts.confirm(record.current), operation?.signal)) return
    guard()
    const next = await drafts.recover(candidate, target, version, { signal: operation?.signal, guard })
    if (!next) return
    guard(); suppress.current = true
    try {
      editor.replaceBlocks(editor.document, productRichTextToNative(next.content, rich))
      if (JSON.stringify(nativeRichTextToProduct(editor.document as DocumentEditorBlock[], rich)) !== JSON.stringify(next.content)) throw new Error('client-comment-native-unverified')
      record.current = next; input.current++
    } finally { suppress.current = false }
    if (!operation) await drafts.discard(candidate)
    return next
  }
  const discardActive = async (candidate: CommentDraftCandidate, operation?: CommentDraftOperation): Promise<boolean> => {
    if (!drafts) return false
    const own = record.current
    if (!own || own.id !== candidate.id || own.revision !== candidate.revision) return false
    return discardNativeCommentDraft(drafts, candidate, operation, nativeGuard(), () => {
      suppress.current = true
      try { editor.replaceBlocks(editor.document, [{ type: 'paragraph', content: [] }]); record.current = undefined; input.current++ }
      finally { suppress.current = false }
    })
  }
  const discard = async (candidate: CommentDraftCandidate) => { await drafts?.discardProposal(candidate) }
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
      unavailableMessage={t.commentTargetUnavailable} onRecover={async candidate => { await recover(candidate) }} onDiscard={discard} />}
    <div className="pm-document-place-comment__actions">
      <PmButton small disabled={busy} onClick={onClose}>{t.stepCommentCancel}</PmButton>
      <PmButton small variant="primary" loading={busy} disabled={busy || empty} onClick={() => void submit()}>{t.stepCommentSave}</PmButton>
    </div>
  </div>
}
