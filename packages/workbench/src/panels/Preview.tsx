import { useLayoutEffect, useRef, useState } from 'react'
import { createPreviewPool } from '../preview-pool.ts'
import type { PreviewState } from '../preview-pool.ts'
import { PmButton, PmIconButton, PmNotice, PmSegmented } from '../components.tsx'
import { useMessages, useWorkbench, useWorkbenchStore } from '../react.tsx'
import type { PreviewView } from '../store.ts'

export function PreviewPanel({ active = true }: { active?: boolean }) {
  const t = useMessages()
  const workbench = useWorkbenchStore()
  const document = useWorkbench(state => state.document)
  const documents = useWorkbench(state => state.documents)
  const preview = useWorkbench(state => state.preview)
  const failure = useWorkbench(state => state.previewFailure)
  const view = useWorkbench(state => state.view)
  const picking = useWorkbench(state => state.picking)
  const container = useRef<HTMLDivElement>(null)
  const pool = useRef<ReturnType<typeof createPreviewPool>>()
  const [loads, setLoads] = useState(0)
  const [{ ready, mismatch, identityFailure }, setStatus] = useState<PreviewState>({ ready: false })
  const address = view === 'slides' ? preview?.slides : preview?.web
  const title = documents?.documents.find(doc => doc.dir === document)?.title ?? document ?? ''

  useLayoutEffect(() => {
    if (!container.current) return
    const current = createPreviewPool(container.current, workbench, setStatus, document => {
      setLoads(n => n + 1)
      void workbench.openDocument(document)
    })
    pool.current = current
    return () => { current.dispose(); pool.current = undefined }
  }, [workbench])
  useLayoutEffect(() => {
    pool.current?.select(active && document !== undefined && !failure && !(view === 'slides' && preview && !preview.slides)
      ? { document, view, address, title: t.previewTitle(title), reload: loads }
      : undefined)
  }, [active, document, view, address, title, loads, failure, t, workbench])

  const views: { value: PreviewView, label: string }[] = [{ value: 'web', label: t.views.web }, ...(preview?.slides || view === 'slides') ? [{ value: 'slides' as const, label: t.views.slides }] : []]
  return (
    <section className="pmw-preview" aria-label={t.preview} data-ready={(active && document !== undefined && ready) || undefined}>
      <div className="pmw-preview__bar">
        {views.length > 1 && <PmSegmented value={view} options={views} label={t.view} onChange={value => workbench.setView(value)} />}
        <span className="pmw-spacer" />
        <PmButton small icon="edit" variant={picking ? 'accent' : 'ghost'} aria-pressed={picking} title={t.pickHint} onClick={() => workbench.setPicking(!picking)}>{t.pick}</PmButton>
        <PmIconButton icon="redo" label={t.reloadPreview} small onClick={() => (address ? setLoads(n => n + 1) : workbench.retryPreview())} />
      </div>
      {mismatch && <PmNotice tone="warn">{t.versionMismatch}</PmNotice>}
      {identityFailure && <PmNotice tone="danger">{t.previewIdentityMismatch}</PmNotice>}
      {failure && <PmNotice tone="danger">{t.previewFailed(failure)}</PmNotice>}
      {!ready && !preview && !failure && <p className="pmw-muted pmw-preview__loading">{t.previewLoading}</p>}
      {view === 'slides' && preview && !preview.slides && <p className="pmw-muted">{t.noSlides}</p>}
      <div ref={container} className="pmw-preview__frames" />
    </section>
  )
}
