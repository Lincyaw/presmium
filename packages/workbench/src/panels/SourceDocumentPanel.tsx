import { useEffect, useRef } from 'react'
import { PmButton, PmNotice } from '../components.tsx'
import { useMessages, useWorkbench, useWorkbenchState } from '../context.tsx'
import { DocumentEditor } from '../document-editor/DocumentEditor.tsx'
import { DOCUMENT_EDITOR_MESSAGES } from '../document-editor/messages.ts'
import { DocumentBlockFallback } from '../document-editor/DocumentBlockFallback.tsx'
import { DocumentBlockPreview } from '../document-editor/DocumentBlockPreview.tsx'
import { isAgentChanging } from '../workbench.ts'

/** Source editing is available before the first successful runtime compilation. */
export function SourceDocumentPanel({ commentsPortal }: { commentsPortal?: HTMLElement | null }) {
  const workbench = useWorkbench(), t = useMessages()
  const source = useWorkbenchState(state => state.authoring)
  const locale = useWorkbenchState(state => state.locale), messages = DOCUMENT_EDITOR_MESSAGES[locale]
  const navigation = useWorkbenchState(state => state.documentNavigation)
  const readOnly = useWorkbenchState(isAgentChanging)
  const container = useRef<HTMLElement>(null)
  const consumedNavigation = useRef<string>()
  useEffect(() => {
    if (!navigation) return
    const request = JSON.stringify([source?.identity, navigation.request])
    if (consumedNavigation.current === request) return
    const heading = container.current?.querySelector(`[data-document-section="${CSS.escape(navigation.section)}"]`)
    if (heading) { consumedNavigation.current = request; heading.scrollIntoView({ block: 'start' }) }
  }, [navigation, source?.identity, source?.reset])
  useEffect(() => {
    const element = container.current
    if (!element || !source?.content) return
    let frame: number | undefined
    let manual = !navigation
    const read = () => {
      frame = undefined
      if (!manual || !element.clientHeight) return
      const headings = [...element.querySelectorAll<HTMLElement>('[data-document-section]')]
      const band = element.getBoundingClientRect().top + element.clientHeight * 0.05
      let current = headings[0]
      for (const heading of headings) if (heading.getBoundingClientRect().top <= band) current = heading
      if (element.scrollTop > 0 && element.scrollTop + element.clientHeight >= element.scrollHeight - 1) current = headings.at(-1)
      if (current?.dataset.documentSection) workbench.observeDocumentSection(current.dataset.documentSection)
    }
    const queue = () => { if (frame === undefined) frame = requestAnimationFrame(read) }
    const interact = () => { manual = true; workbench.documentInteraction(); queue() }
    const keys = (event: KeyboardEvent) => { if (['PageDown', 'PageUp', 'Home', 'End'].includes(event.key)) interact() }
    element.addEventListener('scroll', queue, { passive: true })
    element.addEventListener('wheel', interact, { passive: true })
    element.addEventListener('touchmove', interact, { passive: true })
    element.addEventListener('pointerdown', interact, { passive: true })
    element.addEventListener('keydown', keys)
    const resize = new ResizeObserver(queue); resize.observe(element); queue()
    return () => {
      element.removeEventListener('scroll', queue); element.removeEventListener('wheel', interact); element.removeEventListener('touchmove', interact)
      element.removeEventListener('pointerdown', interact); element.removeEventListener('keydown', keys)
      resize.disconnect(); if (frame !== undefined) cancelAnimationFrame(frame)
    }
  }, [workbench, navigation, source?.identity, source?.reset, Boolean(source?.content)])
  const error = source?.error === 'document-version-changed' || source?.error === 'document-identity-changed' ? messages.conflict
    : source?.error ? messages.saveFailure : undefined
  return <section ref={container} className="pmw-source-document" aria-label={t.documentEditor} aria-busy={source?.loading || undefined}>
    {source?.storageFailure && <PmNotice tone="warn">{t.narrationRecoveryUnavailable}</PmNotice>}
    {source?.restored && <PmNotice tone="accent"><span>{messages.restored}</span><span className="pmw-notice__actions"><PmButton small onClick={() => void workbench.retryDocument()}>{t.retry}</PmButton><PmButton small onClick={() => void workbench.discardDocument()}>{t.narrationDiscard}</PmButton></span></PmNotice>}
    {error && <PmNotice tone="danger"><span>{error}</span><span className="pmw-notice__actions"><PmButton small onClick={() => void workbench.retryDocument()}>{t.retry}</PmButton>{source?.dirty && <PmButton small onClick={() => void workbench.discardDocument()}>{t.narrationDiscard}</PmButton>}</span></PmNotice>}
    {source?.issues.length ? <PmNotice tone="warn"><details><summary>{messages.diagnostics(source.issues.length)}</summary><ul>{source.issues.map((issue, index) => <li key={`${issue.path}:${index}`}><code>{issue.path}</code> {issue.message}</li>)}</ul></details></PmNotice> : null}
    {!source?.content || !source.identity ? <p className="pmw-muted">{source?.loading ? messages.loading : messages.unavailable}</p> : <div className="pmw-source-document__sheet">
      <DocumentEditor identity={source.identity} document={source.content} reset={source.reset} locale={locale} readOnly={readOnly}
        nodeViews={{ renderBlock: id => {
          const block = source.content?.blocks[id]
          if (!block || !source.content) return undefined
          const fallback = <DocumentBlockFallback block={block} document={source.content} locale={locale} />
          return block.type === 'component' ? <DocumentBlockPreview blockId={id} fallback={fallback} /> : fallback
        } }}
        commentsPortal={commentsPortal} onChange={document => workbench.recordDocument(document)} onReady={editor => workbench.attachDocumentEditor(editor)}
        onComposition={composing => workbench.documentComposition(composing)} onError={() => workbench.documentError(new Error(messages.adapterError))} />
    </div>}
  </section>
}
