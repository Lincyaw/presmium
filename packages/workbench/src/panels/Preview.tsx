import { useEffect, useRef, useState } from 'react'
import { connectPreview } from '../preview.ts'
import { PmButton, PmIconButton, PmNotice, PmSegmented } from '../components.tsx'
import { useMessages, useWorkbench, useWorkbenchStore } from '../react.tsx'
import type { PreviewView } from '../store.ts'

const READY_MS = 45_000
const RELOADS = 3

export function PreviewPanel() {
  const t = useMessages()
  const workbench = useWorkbenchStore()
  const document = useWorkbench(state => state.document)
  const documents = useWorkbench(state => state.documents)
  const preview = useWorkbench(state => state.preview)
  const failure = useWorkbench(state => state.previewFailure)
  const view = useWorkbench(state => state.view)
  const picking = useWorkbench(state => state.picking)
  const frame = useRef<HTMLIFrameElement>(null)
  const [loads, setLoads] = useState(0)
  const [ready, setReady] = useState(false)
  const [mismatch, setMismatch] = useState(false)
  const address = view === 'slides' ? preview?.slides : preview?.web

  useEffect(() => {
    if (!address || !frame.current) return
    setReady(false)
    const connection = connectPreview(() => frame.current, address, {
      report(report) {
        if (report.type === 'ready') setReady(true)
        workbench.previewReport(report)
      },
      mismatch: () => setMismatch(true),
    })
    frame.current.src = connection.src
    const detach = workbench.attachPreview(connection)
    let reloads = 0
    const timer = setInterval(() => {
      if (connection.ready || reloads >= RELOADS || !frame.current) return
      reloads++
      frame.current.src = connection.src
    }, READY_MS)
    return () => {
      clearInterval(timer)
      detach()
      connection.dispose()
    }
  }, [address, workbench, loads])

  if (document === undefined) return null
  const title = documents?.documents.find(doc => doc.dir === document)?.title ?? document
  const views: { value: PreviewView, label: string }[] = [{ value: 'web', label: t.views.web }, ...preview?.slides ? [{ value: 'slides' as const, label: t.views.slides }] : []]
  return (
    <section className="pmw-preview" aria-label={t.preview} data-ready={ready || undefined}>
      <div className="pmw-preview__bar">
        {views.length > 1 && <PmSegmented value={view} options={views} label={t.view} onChange={value => workbench.setView(value)} />}
        <span className="pmw-spacer" />
        <PmButton small icon="edit" variant={picking ? 'accent' : 'ghost'} aria-pressed={picking} title={t.pickHint} onClick={() => workbench.setPicking(!picking)}>{t.pick}</PmButton>
        <PmIconButton icon="redo" label={t.reloadPreview} small onClick={() => (preview ? setLoads(n => n + 1) : workbench.retryPreview())} />
      </div>
      {mismatch && <PmNotice tone="warn">{t.versionMismatch}</PmNotice>}
      {failure && <PmNotice tone="danger">{t.previewFailed(failure)}</PmNotice>}
      {!preview && !failure && <p className="pmw-muted pmw-preview__loading">{t.previewLoading}</p>}
      {view === 'slides' && preview && !preview.slides && <p className="pmw-muted">{t.noSlides}</p>}
      <iframe ref={frame} className="pmw-preview__frame" title={t.previewTitle(title)} hidden={!address} />
    </section>
  )
}
