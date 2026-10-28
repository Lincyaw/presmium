import { createContext, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import type { ReactNode } from 'react'
import { CommentEditorSubmitExtension, CommentsExtension } from '@blocknote/core/comments'
import { components } from '@blocknote/mantine'
import { ComponentsContext, FloatingComposer, FloatingComposerController, useBlockNoteEditor, useComponentsContext, useExtension } from '@blocknote/react'
import type { ComponentProps } from '@blocknote/react'
import type { BlockNoteEditor } from '@blocknote/core'
import { TextSelection } from '@tiptap/pm/state'
import { COMMENT_EDITOR_CONTEXT, DraftChoices } from './DocumentComments.tsx'
import { isNewCommentDraft, sameCommentDraftTarget } from './comment-drafts.ts'
import type { CommentDraftCandidate, CommentDraftRecord, CommentDraftReference, NewCommentDraftTarget } from './comment-drafts.ts'
import { createRichProjection, nativeRichTextToProduct, productRichTextToNative } from './rich-text.ts'
import type { DocumentEditorBlock, NativeDocumentEditor } from './schema.tsx'
import { PmNotice } from '../components.tsx'
import { DOCUMENT_EDITOR_MESSAGES } from './messages.ts'

type CommentEditor = BlockNoteEditor<any, any, any>
interface ComposerBinding {
  target: NewCommentDraftTarget
  editor: CommentEditor
  record?: CommentDraftRecord
  origin?: CommentDraftReference
  input: number
  composing: boolean
  active: boolean
}
interface PreparedDraft { record: CommentDraftRecord, origin: CommentDraftReference, doc: NativeDocumentEditor['prosemirrorState']['doc'], selection: NativeDocumentEditor['prosemirrorState']['selection'], version: string }
interface NewDraftOwner {
  editor: NativeDocumentEditor
  latest: { current: ComposerBinding | undefined }
  prepared: { current: PreparedDraft | undefined }
  restore(candidate: CommentDraftCandidate, current?: () => boolean): Promise<void>
  failure?: boolean
}
const NEW_DRAFT_OWNER = createContext<NewDraftOwner | undefined>(undefined)
const emptySubscribe = () => () => {}
const emptyState = { candidates: [], pending: false, failed: false, reading: false } as const

/** One owner connects the public composer instance to a source-bound creation intent. */
export function NewCommentDraftProvider({ children }: { children?: ReactNode }) {
  const context = useContext(COMMENT_EDITOR_CONTEXT), editor = useBlockNoteEditor() as NativeDocumentEditor, comments = useExtension(CommentsExtension)
  const latest = useRef<ComposerBinding>(), prepared = useRef<PreparedDraft>(), active = useRef(true), operation = useRef(0)
  const [failure, setFailure] = useState(false)
  useEffect(() => { active.current = true; return () => { active.current = false; ++operation.current; prepared.current = undefined; latest.current = undefined } }, [editor])
  const restore = async (candidate: CommentDraftCandidate, current = () => true) => {
    const store = context?.store, drafts = store?.drafts, target = candidate.target
    if (!store || !drafts || !isNewCommentDraft(target) || candidate.storage !== 'durable' || editor.prosemirrorView.isDestroyed || editor.prosemirrorView.composing) return
    const binding = latest.current
    if (binding?.record && !drafts.owns(binding.record)) binding.record = undefined
    const request = ++operation.current, input = binding?.input, record = binding?.record
    try {
      store.beforeAction?.()
      if (!store.auth.canCreateThread() || store.draftTargetState(target) !== 'current' || !store.newDraftPositions(target, editor)) { setFailure(true); return }
      const version = store.version, native = editor.prosemirrorState, extensionState = comments.store.state, position = context.getPositionToken?.()
      if (!version || binding?.composing || binding?.editor.prosemirrorView.composing) return
      const owns = () => active.current && current() && request === operation.current && !editor.prosemirrorView.isDestroyed && !editor.prosemirrorView.composing && store.version === version
        && context.getPositionToken?.() === position
        && editor.prosemirrorState.doc === native.doc && editor.prosemirrorState.selection === native.selection && comments.store.state === extensionState
        && (!binding || latest.current === binding && binding.input === input && binding.record === record && !binding.composing)
      if (record && !await drafts.confirm(record) || !owns()) return
      const nextTarget = { ...target, intentId: crypto.randomUUID() }, next = await drafts.recover(candidate, nextTarget, version)
      store.beforeAction?.()
      if (!next || !owns()) return
      const positions = store.newDraftPositions(nextTarget, editor)
      if (!positions) { setFailure(true); return }
      comments.stopPendingComment()
      editor.transact(transaction => transaction.setSelection(TextSelection.create(transaction.doc, positions.from, positions.to)).scrollIntoView())
      // The public controller creates the actual editor; this is only its strictly committed handoff.
      prepared.current = { record: next, origin: candidate, doc: editor.prosemirrorState.doc, selection: editor.prosemirrorState.selection, version }
      comments.startPendingComment()
      prepared.current.selection = editor.prosemirrorState.selection
      setFailure(false)
      context.onDraftRestore?.()
    } catch { if (active.current && request === operation.current) setFailure(true) }
  }
  return <NEW_DRAFT_OWNER.Provider value={{ editor, latest, prepared, restore, failure }}>{children}</NEW_DRAFT_OWNER.Provider>
}

/** Closing hides the native form; permanent discard is an exact backup action. */
export function DocumentNewCommentController() {
  const owner = useContext(NEW_DRAFT_OWNER), context = useContext(COMMENT_EDITOR_CONTEXT), comments = useExtension(CommentsExtension)
  return <FloatingComposerController floatingComposer={DocumentNewCommentComposer} floatingUIOptions={{ useFloatingOptions: { onOpenChange(open) {
    if (open || !owner || owner.latest.current?.composing || owner.latest.current?.editor.prosemirrorView.composing) return
    try { context?.store.beforeAction?.() } catch { return }
    comments.stopPendingComment()
    if (!owner.editor.prosemirrorView.isDestroyed) owner.editor.focus()
  } } }} />
}

function DocumentNewCommentComposer({ newCommentEditor }: { newCommentEditor: CommentEditor }) {
  const owner = useContext(NEW_DRAFT_OWNER), context = useContext(COMMENT_EDITOR_CONTEXT), nativeComponents = useComponentsContext()!
  const [binding, setBinding] = useState<ComposerBinding>(), [, render] = useState(0)
  useLayoutEffect(() => {
    if (!owner || !context) return
    try {
      context.store.beforeAction?.()
      const restored = owner.prepared.current, prepared = restored && restored.version === context.store.version
        && restored.doc === owner.editor.prosemirrorState.doc && restored.selection === owner.editor.prosemirrorState.selection && newCommentEditor.isEmpty
        && isNewCommentDraft(restored.record.target) && context.store.newDraftPositions(restored.record.target, owner.editor) ? restored : undefined
      const target = prepared && isNewCommentDraft(prepared.record.target) ? prepared.record.target : context.store.newDraftTarget(owner.editor)
      const value: ComposerBinding = { target, editor: newCommentEditor, record: prepared?.record, origin: prepared?.origin, input: 0, composing: false, active: true }
      if (prepared) owner.prepared.current = undefined
      owner.latest.current = value; setBinding(value)
      return () => { value.active = false }
    } catch { /* The unchanged native form remains available when no authoritative target can be confirmed. */ }
  }, [newCommentEditor, context?.store, owner?.editor])
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
    if (binding.record && props.editor.isEmpty) {
      props.editor.replaceBlocks(props.editor.document, productRichTextToNative(binding.record.content, rich))
      if (binding.origin) { void drafts.discard(binding.origin); binding.origin = undefined }
    }
    const original = props.editor.getExtension(CommentEditorSubmitExtension)
    let guarded: typeof original
    if (original) {
      props.editor.replaceExtension(original, CommentEditorSubmitExtension({ onSubmit: async () => {
        if (!binding.active || binding.composing || props.editor.prosemirrorView.composing) return
        try {
          context.store.beforeAction?.()
          const positions = context.store.newDraftPositions(binding.target, owner.editor), selection = owner.editor.prosemirrorState.selection
          if (!context.store.auth.canCreateThread() || !positions || selection.from !== positions.from || selection.to !== positions.to) { setFailure(true); return }
          const before = new Set(context.store.getThreads().keys()), record = binding.record
          submitting.current = true
          try {
            const result = original.submit(), thread = [...context.store.getThreads().values()].find(thread => !before.has(thread.id))
            const actual = thread && context.store.threadSnapshot(thread.id)
            if (actual) { drafts.submitted(record, actual.comments[0], actual); binding.record = undefined }
            await result
          } finally { submitting.current = false }
        } catch { setFailure(true) }
      } }))
      guarded = props.editor.getExtension(CommentEditorSubmitExtension); composer.ready()
    }
    const stop = props.editor.onChange(() => {
      if (!binding.active || suppress.current || submitting.current || !context.store.version) return
      ++binding.input
      if (props.editor.isEmpty) { if (binding.record) { void drafts.clearOwn(binding.record); binding.record = undefined }; return }
      binding.record = drafts.write(binding.record?.target ?? binding.target, binding.record?.version ?? context.store.version,
        nativeRichTextToProduct(props.editor.document as DocumentEditorBlock[], rich), binding.composing, binding.record) ?? binding.record
    })
    return () => { stop(); if (original && guarded && !props.editor.prosemirrorView.isDestroyed && props.editor.getExtension(CommentEditorSubmitExtension) === guarded) props.editor.replaceExtension(guarded, original) }
  }, [binding, drafts, props.editor])
  const composerId = useRef(crypto.randomUUID())
  useLayoutEffect(() => {
    if (!binding || !drafts || !context) return
    return drafts.registerComposer({ id: composerId.current, target: binding.target,
      snapshot: () => { const available = binding.active && !submitting.current && !props.editor.prosemirrorView.isDestroyed; return { record: binding.record, composing: binding.composing || available && props.editor.prosemirrorView.composing, available } },
      targetState: () => context.store.draftTargetState(binding.target) })
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
  const candidates = state.candidates.filter(value => isNewCommentDraft(value.target))
  if (!drafts || !owner) return null
  return <>{owner.failure && <PmNotice tone="warn">{t.commentTargetUnavailable}</PmNotice>}<DraftChoices candidates={candidates} preview
    canRecover={candidate => isNewCommentDraft(candidate.target) && Boolean(context?.store.newDraftPositions(candidate.target, owner.editor))}
    unavailableMessage={t.commentTargetUnavailable} onRecover={candidate => owner.restore(candidate, () => active.current)} onDiscard={async candidate => {
      const binding = owner.latest.current, record = binding?.record, input = binding?.input
      const { token, storage, ...value } = candidate
      if (await drafts.discard(candidate) && binding && owner.latest.current === binding && binding.input === input && binding.record === record
        && record && JSON.stringify(record) === JSON.stringify(value)) binding.record = undefined
    }} /></>
}
