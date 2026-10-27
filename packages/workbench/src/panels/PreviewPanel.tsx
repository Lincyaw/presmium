import { useLayoutEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { createPreviewPool } from '../preview-pool.ts'
import type { PresentationAction, PreviewFrameStatus } from '../preview-pool.ts'
import { PmButton, PmNotice } from '../components.tsx'
import { useMessages, useWorkbench, useWorkbenchState } from '../context.tsx'
import { slideAspect } from '../workbench.ts'

/** The open document as its readers see it (the web form or the slides), with the tools for what the author points at. */
export function PreviewPanel({ active = true, onPresentationAction }: { active?: boolean, onPresentationAction?(action: PresentationAction): void }) {
  const presentationAction = useRef(onPresentationAction)
  presentationAction.current = onPresentationAction
  const t = useMessages()
  const workbench = useWorkbench()
  const document = useWorkbenchState(state => state.document)
  const documents = useWorkbenchState(state => state.documents)
  const preview = useWorkbenchState(state => state.preview)
  const failure = useWorkbenchState(state => state.previewFailure)
  const renderer = useWorkbenchState(state => state.previewRenderer)
  const snapshotMatches = useWorkbenchState(state => !state.presentationSnapshot || state.webView !== 'present' || state.presentationSnapshot.revision === state.previewIrRevision)
  const reload = useWorkbenchState(state => state.previewReload)
  const aspect = useWorkbenchState(state => (state.previewRenderer === 'slides' ? slideAspect(state.ir) : undefined))
  const container = useRef<HTMLDivElement>(null)
  const pool = useRef<ReturnType<typeof createPreviewPool>>()
  const [loads, setLoads] = useState(0)
  const [{ ready, mismatch, identityFailure, handshakeFailure }, setStatus] = useState<PreviewFrameStatus>({ ready: false })
  const address = renderer === 'slides' ? preview?.slides : preview?.web
  const title = documents?.documents.find(doc => doc.dir === document)?.title ?? document ?? ''

  useLayoutEffect(() => {
    if (!container.current) return
    const current = createPreviewPool(container.current, workbench, setStatus, document => {
      setLoads(n => n + 1)
      void workbench.openDocument(document)
    }, action => presentationAction.current?.(action))
    pool.current = current
    return () => { current.dispose(); pool.current = undefined }
  }, [workbench])
  useLayoutEffect(() => {
    pool.current?.select(active && document !== undefined && !failure && !(renderer === 'slides' && preview && !preview.slides)
      ? { document, renderer, address, title: t.previewTitle(title), reload: loads + reload }
      : undefined)
  }, [active, document, renderer, address, title, loads, reload, failure, t, workbench])

  return (
    <section className="pmw-preview" aria-label={t.preview} data-ready={(active && document !== undefined && ready && snapshotMatches) || undefined}>
      {mismatch && <PmNotice tone="warn">{t.versionMismatch}</PmNotice>}
      {identityFailure && <PmNotice tone="danger"><span>{t.previewIdentityMismatch}</span><PmButton small onClick={() => workbench.reloadPreview()}>{t.reloadPreview}</PmButton></PmNotice>}
      {handshakeFailure && <PmNotice tone="danger"><span>{t.previewStalled}</span><PmButton small onClick={() => workbench.reloadPreview()}>{t.reloadPreview}</PmButton></PmNotice>}
      {failure && <PmNotice tone="danger"><span>{t.previewFailed(failure)}</span><PmButton small onClick={() => workbench.retryPreview()}>{t.retry}</PmButton></PmNotice>}
      {(!ready || !snapshotMatches) && !failure && !handshakeFailure && !(renderer === 'slides' && preview && !preview.slides) && <p className="pmw-muted pmw-preview__loading">{address ? t.previewLoading : t.previewPreparing}</p>}
      {renderer === 'slides' && preview && !preview.slides && <p className="pmw-muted pmw-preview__loading">{t.noSlides}</p>}
      <div className="pmw-preview__stage">
        <div ref={container} className="pmw-preview__frames" data-renderer={renderer} data-pending-snapshot={!snapshotMatches || undefined} style={aspect === undefined ? undefined : { '--pmw-slide-aspect': aspect } as CSSProperties} />
      </div>
    </section>
  )
}
