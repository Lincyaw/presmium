import { useEffect, useRef } from 'react'
import { PmButton, PmNotice } from '../components.tsx'
import { useMessages, useWorkbench, useWorkbenchState } from '../context.tsx'
import { DocumentEditor } from '../document-editor/DocumentEditor.tsx'
import { DOCUMENT_EDITOR_MESSAGES } from '../document-editor/messages.ts'
import { isAgentChanging } from '../workbench.ts'

/** Source editing is available before the first successful runtime compilation. */
export function SourceDocumentPanel({ commentsPortal }: { commentsPortal?: HTMLElement | null }) {
  const workbench = useWorkbench(), t = useMessages()
  const source = useWorkbenchState(state => state.authoring)
  const locale = useWorkbenchState(state => state.locale), messages = DOCUMENT_EDITOR_MESSAGES[locale]
  const section = useWorkbenchState(state => state.position?.section)
  const readOnly = useWorkbenchState(isAgentChanging)
  const container = useRef<HTMLElement>(null)
  useEffect(() => {
    if (section) container.current?.querySelector(`[data-document-section="${CSS.escape(section)}"]`)?.scrollIntoView({ block: 'start' })
  }, [section, source?.identity])
  const error = source?.error === 'document-version-changed' || source?.error === 'document-identity-changed' ? messages.conflict
    : source?.error ? messages.saveFailure : undefined
  return <section ref={container} className="pmw-source-document" aria-label={t.documentEditor} aria-busy={source?.loading || undefined}>
    {source?.storageFailure && <PmNotice tone="warn">{t.narrationRecoveryUnavailable}</PmNotice>}
    {source?.restored && <PmNotice tone="accent"><span>{messages.restored}</span><span className="pmw-notice__actions"><PmButton small onClick={() => void workbench.retryDocument()}>{t.retry}</PmButton><PmButton small onClick={() => void workbench.discardDocument()}>{t.narrationDiscard}</PmButton></span></PmNotice>}
    {error && <PmNotice tone="danger"><span>{error}</span><span className="pmw-notice__actions"><PmButton small onClick={() => void workbench.retryDocument()}>{t.retry}</PmButton>{source?.dirty && <PmButton small onClick={() => void workbench.discardDocument()}>{t.narrationDiscard}</PmButton>}</span></PmNotice>}
    {source?.issues.length ? <PmNotice tone="warn"><details><summary>{messages.diagnostics(source.issues.length)}</summary><ul>{source.issues.map((issue, index) => <li key={`${issue.path}:${index}`}><code>{issue.path}</code> {issue.message}</li>)}</ul></details></PmNotice> : null}
    {!source?.content || !source.identity ? <p className="pmw-muted">{source?.loading ? messages.loading : messages.unavailable}</p> : <div className="pmw-source-document__sheet">
      <DocumentEditor identity={source.identity} document={source.content} reset={source.reset} locale={locale} readOnly={readOnly}
        commentsPortal={commentsPortal} onChange={document => workbench.recordDocument(document)} onReady={editor => workbench.attachDocumentEditor(editor)}
        onComposition={composing => workbench.documentComposition(composing)} onError={() => workbench.documentError(new Error(messages.adapterError))} />
    </div>}
  </section>
}
