import { createContext, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import type { ReactNode } from 'react'
import { CommentEditorSubmitExtension, CommentsExtension } from '@blocknote/core/comments'
import { components } from '@blocknote/mantine'
import { ComponentsContext, FloatingComposer, PositionPopover, useBlockNoteEditor, useComponentsContext, useCreateBlockNote, useDictionary, useEditorState, useExtension, useExtensionState } from '@blocknote/react'
import type { ComponentProps } from '@blocknote/react'
import type { BlockNoteEditor } from '@blocknote/core'
import { isDocumentPlaceAnchor, randomUUID } from '@lincyaw/kernel'
import { TextSelection } from '@tiptap/pm/state'
import { COMMENT_EDITOR_CONTEXT, DraftChoices } from './DocumentComments.tsx'
import { isNewCommentDraft, sameCommentDraftTarget } from './comment-drafts.ts'
import { discardNativeCommentDraft } from './comment-draft-actions.ts'
import { waitForDraft } from '../document-draft-store.ts'
import { isApprovalTarget } from '../approvals.tsx'
import { enterSubmits } from './comments.ts'
import type { CommentDraftCandidate, CommentDraftRecord, CommentDraftReference, CommentDraftOperation, NewCommentDraftTarget } from './comment-drafts.ts'
import { createRichProjection, nativeRichTextToProduct, productRichTextToNative } from './rich-text.ts'
import type { DocumentEditorBlock, NativeDocumentEditor } from './schema.tsx'
import { PmNotice } from '../components.tsx'
import { DOCUMENT_EDITOR_MESSAGES } from './messages.ts'
import { commentFloating } from './popover.tsx'

type CommentEditor = BlockNoteEditor<any, any, any>
interface ComposerBinding {
  target: NewCommentDraftTarget
  editor: CommentEditor
  record?: CommentDraftRecord
  origin?: CommentDraftReference
  input: number
  composing: boolean
  active: boolean
  submitting: boolean
  adopting?: boolean
  previous?: ComposerBinding
  adoption?: { guard(): void, finish(record?: CommentDraftRecord): void }
}
interface PreparedDraft { record: CommentDraftRecord, origin?: CommentDraftReference, previous?: ComposerBinding, doc: NativeDocumentEditor['prosemirrorState']['doc'], selection: NativeDocumentEditor['prosemirrorState']['selection'], version: string, adoption?: ComposerBinding['adoption'], canUse(editor: CommentEditor): boolean }
interface NewDraftOwner {
  editor: NativeDocumentEditor
  latest: { current: ComposerBinding | undefined }
  prepared: { current: PreparedDraft | undefined }
  generation: number
  restore(candidate: CommentDraftCandidate, current?: () => boolean, operation?: CommentDraftOperation): Promise<CommentDraftRecord | undefined>
  failure?: boolean
}
const NEW_DRAFT_OWNER = createContext<NewDraftOwner | undefined>(undefined)
const emptySubscribe = () => () => {}
const emptyState = { candidates: [], pending: false, failed: false, reading: false } as const

/** One owner connects the public composer instance to a source-bound creation intent. */
export function NewCommentDraftProvider({ children }: { children?: ReactNode }) {
  const context = useContext(COMMENT_EDITOR_CONTEXT), editor = useBlockNoteEditor() as NativeDocumentEditor, comments = useExtension(CommentsExtension)
  const latest = useRef<ComposerBinding>(), prepared = useRef<PreparedDraft>(), active = useRef(true), operation = useRef(0)
  const composerId = useRef(randomUUID()), handoff = useRef<() => void>()
  const [failure, setFailure] = useState(false), [generation, setGeneration] = useState(0)
  useEffect(() => { active.current = true; return () => { active.current = false; ++operation.current; handoff.current?.(); prepared.current = undefined; latest.current = undefined } }, [editor])
  const restore = async (candidate: CommentDraftCandidate, current = () => true, action?: CommentDraftOperation): Promise<CommentDraftRecord | undefined> => {
    const store = context?.store, drafts = store?.drafts, target = candidate.target
    if (!store || !drafts || !isNewCommentDraft(target) || candidate.storage !== 'durable' || editor.prosemirrorView.isDestroyed || editor.prosemirrorView.composing) return
    const binding = latest.current?.active ? latest.current : undefined
    if (binding?.record && !drafts.owns(binding.record)) binding.record = undefined
    handoff.current?.()
    const request = ++operation.current, input = binding?.input, record = binding?.record
    try {
      store.beforeAction?.()
      if (!store.auth.canCreateThread() || store.draftTargetState(target) !== 'current' || !store.newDraftPositions(target, editor)) { setFailure(true); return }
      const version = store.version, native = editor.prosemirrorState, extensionState = comments.store.state, position = context.getPositionToken?.(), form = binding?.editor.prosemirrorState
      if (!version || binding?.composing || binding?.submitting || binding?.editor.prosemirrorView.composing) return
      const owns = () => active.current && current() && request === operation.current && !editor.prosemirrorView.isDestroyed && !editor.prosemirrorView.composing && store.version === version
        && context.getPositionToken?.() === position
        && editor.prosemirrorState.doc === native.doc && editor.prosemirrorState.selection === native.selection && comments.store.state === extensionState
        && (!binding || latest.current === binding && binding.input === input && binding.record === record && !binding.composing)
      const guard = () => { action?.signal?.throwIfAborted(); action?.guard?.(); if (!owns()) throw new Error('client-comment-composer-changed') }
      guard()
      if (record && !await waitForDraft(drafts.confirm(record), action?.signal)) return
      guard()
      const nextTarget = { ...target, intentId: randomUUID() }, next = await drafts.recover(candidate, nextTarget, version, { signal: action?.signal, guard })
      store.beforeAction?.()
      if (!next) return
      guard()
      const positions = store.newDraftPositions(nextTarget, editor)
      if (!positions) { setFailure(true); return }
      comments.stopPendingComment()
      // ProseMirror scrolls to a selection only while the DOM selection is in the editor, and the pressed button is gone.
      editor.focus()
      editor.transact(transaction => transaction.setSelection(TextSelection.create(transaction.doc, positions.from, positions.to)).scrollIntoView())
      // The public controller creates the actual editor; this is only its strictly committed handoff.
      let finish!: (record?: CommentDraftRecord) => void
      const adopted = new Promise<CommentDraftRecord | undefined>(resolve => { finish = resolve })
      const pending: PreparedDraft = { record: next, previous: binding, ...!action ? { origin: candidate } : {}, doc: editor.prosemirrorState.doc, selection: editor.prosemirrorState.selection, version,
        canUse: actual => (!binding || binding.input === input && binding.record === record && !binding.composing && !binding.submitting)
          && (actual === binding?.editor ? !actual.prosemirrorView.isDestroyed && actual.prosemirrorState.doc === form?.doc && actual.prosemirrorState.selection === form?.selection : actual.isEmpty) }
      if (action) {
        let settled = false
        const complete = (value?: CommentDraftRecord) => { if (settled) return; settled = true; if (handoff.current === cancel) handoff.current = undefined; finish(value) }
        const cancel = () => complete()
        handoff.current = cancel
        pending.adoption = { finish: complete, guard: () => {
          action.signal?.throwIfAborted(); store.beforeAction?.()
          const actual = latest.current
          if (!active.current || !current() || request !== operation.current || store.version !== version || editor.prosemirrorView.isDestroyed || editor.prosemirrorView.composing
            || editor.prosemirrorState.doc !== pending.doc || editor.prosemirrorState.selection !== pending.selection || !actual?.active || actual.record !== next || actual.input !== 0
            || actual.composing || actual.submitting || !store.newDraftPositions(nextTarget, editor)) throw new Error('client-comment-composer-changed')
        } }
      }
      prepared.current = pending
      comments.startPendingComment()
      pending.selection = editor.prosemirrorState.selection
      setGeneration(value => value + 1)
      setFailure(false)
      context.onDraftRestore?.()
      if (action) return await waitForDraft(adopted, action.signal)
    } catch (error) { if (active.current && request === operation.current) setFailure(true); if (action) throw error }
    finally { if (request === operation.current) handoff.current?.() }
  }
  useLayoutEffect(() => {
    const store = context?.store, drafts = store?.drafts
    if (!store || !drafts) return
    return drafts.registerComposer({ id: composerId.current, target: { kind: 'create', intentId: composerId.current, documentId: store.document.id },
      accepts: target => isNewCommentDraft(target) && Boolean(store.newDraftPositions(target, editor)),
      snapshot: () => { const binding = latest.current?.active ? latest.current : undefined; return { record: binding?.record,
        composing: editor.prosemirrorView.composing || Boolean(binding?.composing || binding?.editor.prosemirrorView.composing),
        available: active.current && !context.readOnly && !editor.prosemirrorView.isDestroyed && !binding?.submitting && store.auth.canCreateThread() } },
      targetState: target => target && isNewCommentDraft(target) && store.newDraftPositions(target, editor) ? 'current' : 'unavailable',
      restore: (candidate, action) => restore(candidate, () => active.current, action) })
  }, [context?.store, context?.readOnly, editor])
  return <NEW_DRAFT_OWNER.Provider value={{ editor, latest, prepared, generation, restore, failure }}>{children}</NEW_DRAFT_OWNER.Provider>
}

/**
 * BlockNote's FloatingComposerController, assembled from the same public parts but without its modal focus manager.
 * That manager marks everything outside the form with `aria-hidden`, and when the document holds a live region (a
 * block's notice) it walks into the document and marks the blocks themselves: ProseMirror reads those attributes as
 * an edit and redraws every block, which collapses the canvas (it scrolls away) and takes the focus from the form.
 * The comment editor focuses itself (`autoFocus`, without scrolling), as in a thread's reply form.
 * Closing hides the native form; permanent discard is an exact backup action.
 */
export function DocumentNewCommentController() {
  const owner = useContext(NEW_DRAFT_OWNER), context = useContext(COMMENT_EDITOR_CONTEXT), comments = useExtension(CommentsExtension)
  const editor = useBlockNoteEditor(), dict = useDictionary()
  const pendingComment = useExtensionState(CommentsExtension, { editor, selector: state => state.pendingComment })
  const newCommentEditor = useCreateBlockNote({
    trailingBlock: false,
    dictionary: { ...dict, placeholders: { ...dict.placeholders, emptyDocument: dict.placeholders.new_comment } },
    schema: comments.commentEditorSchema,
    extensions: [CommentEditorSubmitExtension({ submitOnEnter: comments.submitOnEnter, onSubmit: async commentEditor => {
      await comments.createThread({ initialComment: { body: commentEditor.document } })
      comments.stopPendingComment()
      editor.transact(transaction => { transaction.setSelection(TextSelection.create(transaction.doc, transaction.selection.to)) })
      editor.focus()
    } })],
  }, [pendingComment])
  const position = useEditorState({ editor, selector: ({ editor }) => pendingComment ? { from: editor.prosemirrorState.selection.from, to: editor.prosemirrorState.selection.to } : undefined })
  const floating = useMemo(() => commentFloating(), [])
  return <PositionPopover position={position} focusManagerProps={{ disabled: true }} elementProps={{ style: { zIndex: COMPOSER_LAYER } }}
    useFloatingOptions={{ placement: 'bottom', ...floating, open: pendingComment, onOpenChange(open, event?: Event) {
      if (!open && isApprovalTarget(event?.target ?? document.activeElement)) return
      if (open || !owner || owner.latest.current?.composing || owner.latest.current?.editor.prosemirrorView.composing) return
      try { context?.store.beforeAction?.() } catch { return }
      comments.stopPendingComment()
      if (!owner.editor.prosemirrorView.isDestroyed) owner.editor.focus()
    } }}>
    <DocumentNewCommentComposer newCommentEditor={newCommentEditor} />
  </PositionPopover>
}
// BlockNote's layer for the new-comment form, above its toolbars and thread cards.
const COMPOSER_LAYER = 60

function DocumentNewCommentComposer({ newCommentEditor }: { newCommentEditor: CommentEditor }) {
  const owner = useContext(NEW_DRAFT_OWNER), context = useContext(COMMENT_EDITOR_CONTEXT), nativeComponents = useComponentsContext()!
  const [binding, setBinding] = useState<ComposerBinding>(), [, render] = useState(0)
  useLayoutEffect(() => {
    if (!owner || !context) return
    try {
      context.store.beforeAction?.()
      const restored = owner.prepared.current, prepared = restored && restored.version === context.store.version
        && restored.doc === owner.editor.prosemirrorState.doc && restored.selection === owner.editor.prosemirrorState.selection && restored.canUse(newCommentEditor)
        && isNewCommentDraft(restored.record.target) && context.store.newDraftPositions(restored.record.target, owner.editor) ? restored : undefined
      if (restored && !prepared && owner.latest.current?.editor === newCommentEditor) {
        const retained = owner.latest.current
        retained.active = true; owner.prepared.current = undefined; restored.adoption?.finish(); setBinding(retained)
        return () => { retained.active = false }
      }
      const target = prepared && isNewCommentDraft(prepared.record.target) ? prepared.record.target : context.store.newDraftTarget(owner.editor)
      const value: ComposerBinding = { target, editor: newCommentEditor, record: prepared?.record, origin: prepared?.origin, adoption: prepared?.adoption, previous: prepared?.previous, adopting: Boolean(prepared), input: 0, composing: false, active: true, submitting: false }
      if (restored) { if (!prepared) restored.adoption?.finish(); owner.prepared.current = undefined }
      owner.latest.current = value; setBinding(value)
      return () => { value.active = false }
    } catch { /* The unchanged native form remains available when no authoritative target can be confirmed. */ }
  }, [newCommentEditor, context?.store, owner?.editor, owner?.generation])
  const value = useMemo(() => ({ ...nativeComponents, Comments: { ...nativeComponents.Comments, Editor: NewCommentEditor } }), [nativeComponents])
  return <NEW_COMPOSER_BINDING.Provider value={{ binding, ready: () => render(value => value + 1) }}><ComponentsContext.Provider value={value}>
    <FloatingComposer newCommentEditor={newCommentEditor} />
  </ComponentsContext.Provider></NEW_COMPOSER_BINDING.Provider>
}
const NEW_COMPOSER_BINDING = createContext<{ binding?: ComposerBinding, ready(): void } | undefined>(undefined)

function NewCommentEditor(props: ComponentProps['Comments']['Editor']) {
  const context = useContext(COMMENT_EDITOR_CONTEXT), owner = useContext(NEW_DRAFT_OWNER), composer = useContext(NEW_COMPOSER_BINDING), binding = composer?.binding
  const rich = useMemo(() => createRichProjection(), [props.editor]), suppress = useRef(false), submitting = useRef(false)
  const [failure, setFailure] = useState(false)
  const drafts = context?.store.drafts, state = useSyncExternalStore(drafts?.subscribe ?? emptySubscribe, drafts?.snapshot ?? (() => emptyState))
  useLayoutEffect(() => {
    if (!binding || !drafts || !context || !owner) return
    if (binding.record && (props.editor.isEmpty || binding.adopting)) {
      let replaced = false
      try {
        binding.adoption?.guard()
        props.editor.replaceBlocks(props.editor.document, productRichTextToNative(binding.record.content, rich))
        replaced = true
        if (JSON.stringify(nativeRichTextToProduct(props.editor.document as DocumentEditorBlock[], rich)) !== JSON.stringify(binding.record.content)) throw new Error('client-comment-native-unverified')
        binding.adoption?.finish(binding.record); binding.adoption = undefined; binding.adopting = false
        if (binding.origin) { void drafts.discard(binding.origin); binding.origin = undefined }
      } catch {
        binding.adoption?.finish(); binding.adoption = undefined; binding.adopting = false
        const previous = binding.previous
        if (!replaced && previous?.editor === props.editor) {
          binding.target = previous.target; binding.record = previous.record; binding.origin = previous.origin; binding.input = previous.input
        } else binding.record = undefined
        setFailure(true)
      }
      binding.previous = undefined
    }
    const original = props.editor.getExtension(CommentEditorSubmitExtension)
    let guarded: typeof original, stopEnter = () => {}
    if (original) {
      props.editor.replaceExtension(original, CommentEditorSubmitExtension({ onSubmit: async () => {
        if (!binding.active || binding.composing || props.editor.prosemirrorView.composing) return
        try {
          context.store.beforeAction?.()
          const positions = context.store.newDraftPositions(binding.target, owner.editor), selection = owner.editor.prosemirrorState.selection
          if (!context.store.auth.canCreateThread() || !positions || selection.from !== positions.from || selection.to !== positions.to) { setFailure(true); return }
          const before = new Set(context.store.getThreads().keys()), record = binding.record
          submitting.current = true; binding.submitting = true
          try {
            const result = original.submit(), thread = [...context.store.getThreads().values()].find(thread => !before.has(thread.id))
            const actual = thread && context.store.threadSnapshot(thread.id)
            if (actual) { drafts.submitted(record, actual.comments[0], actual); binding.record = undefined }
            await result
          } finally { submitting.current = false; binding.submitting = false }
        } catch { setFailure(true) }
      } }))
      guarded = props.editor.getExtension(CommentEditorSubmitExtension); composer.ready()
      const extension = guarded
      stopEnter = enterSubmits(props.editor, () => extension?.submit())
    }
    const stop = props.editor.onChange(() => {
      if (!binding.active || suppress.current || submitting.current || !context.store.version) return
      ++binding.input
      if (props.editor.isEmpty) { if (binding.record) { void drafts.clearOwn(binding.record); binding.record = undefined }; return }
      binding.record = drafts.write(binding.record?.target ?? binding.target, binding.record?.version ?? context.store.version,
        nativeRichTextToProduct(props.editor.document as DocumentEditorBlock[], rich), binding.composing, binding.record) ?? binding.record
    })
    return () => { stop(); stopEnter(); if (original && guarded && !props.editor.prosemirrorView.isDestroyed && props.editor.getExtension(CommentEditorSubmitExtension) === guarded) props.editor.replaceExtension(guarded, original) }
  }, [binding, drafts, props.editor])
  const composerId = useRef(randomUUID())
  const discardActive = async (candidate: CommentDraftCandidate, action?: CommentDraftOperation): Promise<boolean> => {
    if (!binding || !drafts || !context || !owner || !binding.record || binding.record.id !== candidate.id || binding.record.revision !== candidate.revision) return false
    const record = binding.record, input = binding.input, native = props.editor.prosemirrorState, version = context.store.version, position = context.getPositionToken?.()
    const guard = () => {
      context.store.beforeAction?.()
      if (!binding.active || owner.latest.current !== binding || binding.record !== record || binding.input !== input || context.store.version !== version
        || context.getPositionToken?.() !== position || binding.composing || submitting.current || props.editor.prosemirrorView.isDestroyed
        || props.editor.prosemirrorView.composing || props.editor.prosemirrorState.doc !== native.doc || props.editor.prosemirrorState.selection !== native.selection) throw new Error('client-comment-composer-changed')
    }
    return discardNativeCommentDraft(drafts, candidate, action, guard, () => {
      suppress.current = true
      try { props.editor.replaceBlocks(props.editor.document, [{ type: 'paragraph', content: [] }]); binding.record = undefined; binding.origin = undefined; binding.input++ }
      finally { suppress.current = false }
    })
  }
  useLayoutEffect(() => {
    if (!binding || !drafts || !context) return
    return drafts.registerComposer({ id: composerId.current, target: binding.target,
      snapshot: () => { const available = binding.active && !submitting.current && !props.editor.prosemirrorView.isDestroyed; return { record: binding.record, composing: binding.composing || available && props.editor.prosemirrorView.composing, available } },
      targetState: () => context.store.draftTargetState(binding.target), discard: discardActive })
  }, [binding, drafts, props.editor])
  const t = DOCUMENT_EDITOR_MESSAGES[context?.locale ?? 'en']
  const composition = (value: boolean) => {
    if (!binding) return
    binding.composing = value
    if (binding.record && drafts) binding.record = drafts.write(binding.record.target, binding.record.version,
      nativeRichTextToProduct(props.editor.document as DocumentEditorBlock[], rich), value, binding.record) ?? binding.record
  }
  return <div onCompositionStart={() => composition(true)} onCompositionEnd={() => composition(false)}>
    <components.Comments.Editor {...props} />
    {failure && <PmNotice tone="warn">{t.commentTargetUnavailable}</PmNotice>}
    {state.failed && <PmNotice tone="warn">{t.commentBackupFailed}</PmNotice>}
  </div>
}

export function DocumentNewCommentRecovery() {
  const context = useContext(COMMENT_EDITOR_CONTEXT), owner = useContext(NEW_DRAFT_OWNER), drafts = context?.store.drafts
  const active = useRef(true)
  useLayoutEffect(() => { active.current = true; return () => { active.current = false } }, [owner?.editor])
  const state = useSyncExternalStore(drafts?.subscribe ?? emptySubscribe, drafts?.snapshot ?? (() => emptyState)), t = DOCUMENT_EDITOR_MESSAGES[context?.locale ?? 'en']
  const candidates = state.candidates.filter(value => isNewCommentDraft(value.target) && !(value.target.anchor && isDocumentPlaceAnchor(value.target.anchor)))
  if (!drafts || !owner) return null
  return <>{owner.failure && <PmNotice tone="warn">{t.commentTargetUnavailable}</PmNotice>}<DraftChoices candidates={candidates} preview
    canRecover={candidate => isNewCommentDraft(candidate.target) && Boolean(context?.store.newDraftPositions(candidate.target, owner.editor))}
    unavailableMessage={t.commentTargetUnavailable} onRecover={async candidate => { await owner.restore(candidate, () => active.current) }} onDiscard={async candidate => {
      const binding = owner.latest.current, record = binding?.record, input = binding?.input
      const { token, storage, ...value } = candidate
      if (await drafts.discardProposal(candidate) && binding && owner.latest.current === binding && binding.input === input && binding.record === record
        && record && JSON.stringify(record) === JSON.stringify(value)) binding.record = undefined
    }} /></>
}
