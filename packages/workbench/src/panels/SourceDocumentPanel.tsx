import { useEffect, useRef, useState } from 'react'
import { hasRole } from '@lincyaw/kernel'
import { PmButton, PmNotice, PmSelect, PmSkeleton } from '../components.tsx'
import { useMessages, useWorkbench, useWorkbenchState } from '../context.tsx'
import { DocumentEditor } from '../document-editor/DocumentEditor.tsx'
import { DOCUMENT_EDITOR_MESSAGES } from '../document-editor/messages.ts'
import { DocumentBlockFallback } from '../document-editor/DocumentBlockFallback.tsx'
import { DocumentBlockPreview } from '../document-editor/DocumentBlockPreview.tsx'
import { nativeEditingCursor } from '../document-editor/selection.ts'
import { hasBlockPreview } from '../document-editor/projection.ts'
import type { NativeDocumentEditor } from '../document-editor/schema.tsx'
import { isAgentChanging } from '../workbench.ts'

/** Source editing is available before the first successful runtime compilation. */
export function SourceDocumentPanel({ commentsPortal, onCommentDraftRestore }: { commentsPortal?: HTMLElement | null, onCommentDraftRestore?(): void }) {
  const workbench = useWorkbench(), t = useMessages()
  const source = useWorkbenchState(state => state.authoring)
  const sourceAcknowledged = () => {
    const current = workbench.getState().authoring
    return Boolean(current && current.identity === source?.identity && current.reset === source?.reset
      && !current.loading && !current.dirty && !current.saving && !current.error && !current.restored && !current.recovering && !current.composing)
  }
  const positionFailure = useWorkbenchState(state => state.documentPositionFailure)
  const locale = useWorkbenchState(state => state.locale), messages = DOCUMENT_EDITOR_MESSAGES[locale]
  const navigation = useWorkbenchState(state => state.documentNavigation)
  const readOnly = useWorkbenchState(state => state.mode !== 'editing' || workbench.client.capabilities?.readOnly === true || Boolean(state.authoring?.member && !hasRole(state.authoring.member, 'editor')) || Boolean(state.authoring?.loading) || isAgentChanging(state))
  const container = useRef<HTMLElement>(null)
  const consumedNavigation = useRef<string>()
  const bodyEditor = useRef<NativeDocumentEditor>()
  const editingPosition = useRef<{ nativeBlockId: string, sectionId: string, position: number, editor: NativeDocumentEditor, identity: string, reset: number | undefined }>()
  const cancelReading = useRef<() => void>()
  const [selectedDraft, setSelectedDraft] = useState('')
  const drafts = source?.recoveryDrafts ?? []
  const draftKey = (value: { id: string, revision: number, token: string }) => JSON.stringify([value.id, value.revision, value.token])
  const draft = drafts.find(value => draftKey(value) === selectedDraft)
  useEffect(() => { setSelectedDraft('') }, [source?.identity])
  const recoveryDisabled = readOnly || source?.saving || source?.composing || source?.recovering
  useEffect(() => {
    const element = container.current
    if (element && source?.identity && source.content) return workbench.attachDocumentViewport(element, source.identity)
  }, [workbench, source?.identity, Boolean(source?.content)])
  // The editor applies `readOnly` while committing, so it is editable by the time this runs.
  useEffect(() => { if (!readOnly) workbench.documentEditorEditable() }, [workbench, readOnly])
  useEffect(() => {
    if (!navigation) return
    const request = JSON.stringify([source?.identity, navigation.request])
    if (consumedNavigation.current === request) return
    const target = navigation.block ? container.current?.querySelector(`[data-block-preview="${CSS.escape(navigation.block)}"]`) : container.current?.querySelector(`[data-document-section="${CSS.escape(navigation.section)}"]`)
    if (target) {
      consumedNavigation.current = request; target.scrollIntoView({ block: navigation.block ? 'center' : 'start' })
      if (navigation.block) target.querySelector<HTMLElement>('[data-component-properties]')?.focus({ preventScroll: true })
    }
  }, [navigation, source?.identity, source?.reset])
  useEffect(() => {
    const element = container.current
    if (!element || !source?.content) return
    let frame: number | undefined
    const measure = () => ({ top: element.scrollTop, width: element.clientWidth, height: element.clientHeight, extent: element.scrollHeight })
    type Viewport = ReturnType<typeof measure>
    const sameGeometry = (a: Viewport, b: Viewport) => a.width === b.width && a.height === b.height && a.extent === b.extent
    let baseline = measure(), reading: { generation: string, viewport: Viewport } | undefined
    const cancel = () => { reading = undefined }
    cancelReading.current = cancel
    const read = () => {
      frame = undefined
      const gesture = reading
      cancel()
      if (!gesture || !element.clientHeight) return
      const viewport = measure(), state = workbench.getState()
      if (gesture.generation !== state.documentPositionToken || !sameGeometry(gesture.viewport, viewport) || gesture.viewport.top !== viewport.top) return
      if (!state.authoring?.loading && !isAgentChanging(state)) {
        const field = workbench.focusedDocumentField(), root = field?.editor.prosemirrorView.dom.getRootNode()
        if (field && root instanceof ShadowRoot && element.contains(root.host)) {
          try {
            const point = field.editor.prosemirrorView.coordsAtPos(field.editor.prosemirrorState.selection.head), bounds = element.getBoundingClientRect()
            if (![point.left, point.right, point.top, point.bottom].every(Number.isFinite)) return
            const step = state.authoring?.content?.steps[field.stepId]
            if (step && point.bottom >= bounds.top && point.top <= bounds.bottom && point.right >= bounds.left && point.left <= bounds.right) {
              workbench.observeDocumentStep(step.sectionId, field.stepId)
              return
            }
          } catch { return }
        }
      }
      const editor = bodyEditor.current
      if (editor?.prosemirrorView.isDestroyed) return
      if (editor?.isFocused() && !state.authoring?.loading && !isAgentChanging(state)) {
        const current = editingPosition.current, source = state.authoring
        if (!source || !current || current.editor !== editor || current.identity !== source.identity || current.reset !== source.reset) return
        try {
          const cursor = nativeEditingCursor(editor)
          if (!cursor || cursor.nativeBlockId !== current.nativeBlockId || cursor.position !== current.position) return
          const node = cursor.objectSelected ? editor.prosemirrorView.nodeDOM(cursor.position) : undefined
          const point = node instanceof Element ? node.getBoundingClientRect() : editor.prosemirrorView.coordsAtPos(cursor.position), bounds = element.getBoundingClientRect()
          if (![point.left, point.right, point.top, point.bottom].every(Number.isFinite)) return
          if (point.bottom >= bounds.top && point.top <= bounds.bottom && point.right >= bounds.left && point.left <= bounds.right) {
            workbench.observeDocumentSection(current.sectionId)
            return
          }
        } catch { return }
      }
      const headings = [...element.querySelectorAll<HTMLElement>('[data-document-section]')]
      const band = element.getBoundingClientRect().top + element.clientHeight * 0.05
      let current = headings[0]
      for (const heading of headings) if (heading.getBoundingClientRect().top <= band) current = heading
      if (element.scrollTop > 0 && element.scrollTop + element.clientHeight >= element.scrollHeight - 1) current = headings.at(-1)
      if (current?.dataset.documentSection) workbench.observeDocumentSection(current.dataset.documentSection)
    }
    const queue = (viewport: Viewport) => {
      reading = { generation: workbench.getState().documentPositionToken, viewport }
      if (frame === undefined) frame = requestAnimationFrame(read)
    }
    const scroll = (event: Event) => {
      const viewport = measure(), previous = baseline
      baseline = viewport
      if (workbench.consumeDocumentReturnScroll(element)) { cancel(); return }
      // Native scroll chaining from an iframe has no parent wheel event.
      if (!event.isTrusted) return
      if (!sameGeometry(previous, viewport)) { cancel(); return }
      if (viewport.top === previous.top) return
      workbench.documentInteraction()
      queue(viewport)
    }
    const interact = (event: Event) => {
      if (!event.isTrusted) return
      workbench.documentInteraction()
      baseline = measure()
      queue(baseline)
    }
    const keys = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.isComposing || event.altKey || !['PageDown', 'PageUp', 'Home', 'End'].includes(event.key)) return
      const target = event.target instanceof Element ? event.target : undefined
      if (target?.closest('input, textarea, select, [data-narration-editor]')) return
      if (['Home', 'End'].includes(event.key) && target instanceof HTMLElement && target.isContentEditable && !event.ctrlKey && !event.metaKey) return
      interact(event)
    }
    const pointer = () => { cancel(); workbench.documentInteraction() }
    element.addEventListener('scroll', scroll, { passive: true })
    element.addEventListener('wheel', interact, { passive: true })
    element.addEventListener('touchmove', interact, { passive: true })
    element.addEventListener('pointerdown', pointer, true)
    element.addEventListener('focusin', cancel, true)
    element.addEventListener('keydown', keys)
    const resize = new ResizeObserver(() => { baseline = measure(); cancel() }); resize.observe(element)
    const sheet = element.querySelector('.pmw-source-document__sheet')
    if (sheet) resize.observe(sheet)
    return () => {
      if (cancelReading.current === cancel) cancelReading.current = undefined
      element.removeEventListener('scroll', scroll); element.removeEventListener('wheel', interact); element.removeEventListener('touchmove', interact)
      element.removeEventListener('pointerdown', pointer, true); element.removeEventListener('focusin', cancel, true); element.removeEventListener('keydown', keys)
      resize.disconnect(); if (frame !== undefined) cancelAnimationFrame(frame)
    }
  }, [workbench, navigation, source?.identity, source?.reset, Boolean(source?.content)])
  const error = source?.error === 'document-version-changed' || source?.error === 'document-identity-changed' ? messages.conflict
    : source?.error ? messages.saveFailure : undefined
  return <section ref={container} className="pmw-source-document" aria-label={t.documentEditor} aria-busy={source?.loading || undefined}>
    {Boolean(positionFailure || source?.storageFailure || source?.recoveryReadFailure || source?.restored || error || drafts.length || source?.recoveryChanged) && <div className="pmw-source-document__notices">
      {positionFailure && <PmNotice tone="warn">{t.documentPositionRemoved}</PmNotice>}
      {Boolean(source?.storageFailure || source?.recoveryReadFailure) && <PmNotice tone="warn">{source?.storageFailure ? t.narrationRecoveryUnavailable : t.documentDraftUnreadable}</PmNotice>}
      {Boolean(drafts.length || source?.recoveryChanged) && <PmNotice tone="accent"><div className="pmw-source-document__recovery">
        <span>{source?.recoveryChanged ? t.documentDraftChanged : t.documentDraftFound}</span>
        <PmSelect label={t.documentDraftSelect} value={draft ? selectedDraft : ''} disabled={Boolean(recoveryDisabled)} onChange={event => setSelectedDraft(event.currentTarget.value)}>
          <option value="">{t.documentDraftChoose}</option>
          {drafts.map((value, index) => <option key={draftKey(value)} value={draftKey(value)}>{t.documentDraftOption(index + 1, new Intl.DateTimeFormat(locale, { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(value.updatedAt), value.source)}</option>)}
        </PmSelect>
        <div className="pmw-source-document__recovery-actions">
          <PmButton small variant="primary" disabled={!draft || Boolean(recoveryDisabled)} onClick={() => { if (draft && source?.identity) void workbench.recoverDocumentDraft(draft, source.identity) }}>{t.documentDraftRestore}</PmButton>
          <PmButton small disabled={!draft || Boolean(recoveryDisabled)} onClick={() => { if (draft && source?.identity) workbench.forgetDocumentDraft(draft, source.identity) }}>{t.narrationDiscard}</PmButton>
        </div>
      </div></PmNotice>}
      {source?.restored && !error && <PmNotice tone="accent"><span>{messages.restored}</span><span className="pmw-notice__actions"><PmButton small onClick={() => void workbench.retryDocument()}>{t.retry}</PmButton><PmButton small onClick={() => void workbench.discardDocument()}>{t.narrationDiscard}</PmButton></span></PmNotice>}
      {error && <PmNotice tone="danger"><span>{error}</span><span className="pmw-notice__actions"><PmButton small onClick={() => void workbench.retryDocument()}>{t.retry}</PmButton>{source?.dirty && <PmButton small onClick={() => void workbench.discardDocument()}>{t.narrationDiscard}</PmButton>}</span></PmNotice>}
    </div>}
    {source?.issues.length ? <div className="pmw-source-document__diagnostics"><PmNotice tone="warn"><details><summary>{messages.diagnostics(source.issues.length)}</summary><ul>{source.issues.map((issue, index) => <li key={`${issue.path}:${index}`}><code>{issue.path}</code> {issue.message}</li>)}</ul></details></PmNotice></div> : null}
    {!source?.content || !source.identity ? source?.loading
      ? <div className="pmw-source-document__sheet pmw-source-document__sheet--loading"><PmSkeleton label={messages.loading} /></div>
      : <PmNotice tone="warn"><span>{messages.unavailable}</span><span className="pmw-notice__actions"><PmButton small onClick={() => void workbench.retryDocument()}>{t.retry}</PmButton></span></PmNotice> : <div className="pmw-source-document__sheet">
      <DocumentEditor acknowledged={sourceAcknowledged()} getDocumentAcknowledged={sourceAcknowledged} onCommentDraftRestore={onCommentDraftRestore} commentDrafts={workbench.documentCommentDrafts(source.identity)} identity={source.identity} document={source.content} version={source.version} member={source.member} getDocument={() => workbench.getDocument(source.identity)}
        getDocumentVersion={() => { const current = workbench.getState().authoring; return current && current.identity === source.identity && current.reset === source.reset ? current.version : undefined }} reset={source.reset} locale={locale} readOnly={readOnly}
        uploadImage={(file, signal) => workbench.importDocumentImage(file, source.identity!, signal)}
        getPositionToken={() => workbench.getState().documentPositionToken}
        onSectionLink={sectionId => {
          if (!workbench.getDocument(source.identity)?.sections[sectionId]) return false
          workbench.goToSection(sectionId); return true
        }}
        resolveAssetURL={async location => {
          if (/^(?:[a-z][a-z\d+.-]*:|\/)/i.test(location)) return location
          const asset = Object.values((workbench.getDocument(source.identity) ?? source.content)?.assets ?? {}).find(asset => asset.location === location)
          return asset ? workbench.client.documentAssetURL(source.directory, asset.id) : location
        }}
        nodeViews={{ renderBlock: id => {
          const block = source.content?.blocks[id]
          if (!block || !source.content) return undefined
          const fallback = <DocumentBlockFallback block={block} document={source.content} locale={locale} />
          return hasBlockPreview(block, source.content) ? <DocumentBlockPreview blockId={id} fallback={fallback} /> : fallback
        } }}
        commentsPortal={commentsPortal} onChange={document => workbench.recordDocument(document)} onReady={(editor, commands) => {
          bodyEditor.current = editor
          editingPosition.current = undefined
          workbench.attachDocumentEditor(editor, commands, { identity: source.identity!, reset: source.reset })
        }}
        onEditingPosition={(position, editor) => {
          const state = workbench.getState(), current = state.authoring
          if (!current?.identity || current.loading || isAgentChanging(state) || editor !== bodyEditor.current || !editor.isFocused() || current.identity !== source.identity || current.reset !== source.reset) return
          cancelReading.current?.()
          editingPosition.current = { ...position, editor, identity: current.identity, reset: current.reset }
          workbench.observeDocumentSection(position.sectionId)
        }}
        onComposition={composing => workbench.documentComposition(composing, 'body', source.identity)} onError={() => workbench.documentError(new Error(messages.adapterError))} />
    </div>}
  </section>
}
