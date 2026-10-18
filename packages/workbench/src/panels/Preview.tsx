/**
 * The preview panel (docs/design-dsh.md 4 and 7.3): the document's web form or
 * slides, from the workspace service's dev servers (`GET preview`), in an iframe of
 * the service's origin, driven over the preview protocol (../preview.ts). It
 * follows the workbench's appearance, frames the block the cursor is in, and in
 * pick mode a click on a block opens its lines in the editor. The page updates
 * itself when the source is saved (no reload); a page that does not say `ready`
 * (a dev server still optimizing its dependencies) is loaded again.
 */
import { useEffect, useRef, useState } from 'react'
import { connectPreview } from '../preview.ts'
import { PmButton, PmIconButton, PmNotice, PmSegmented } from '../components.tsx'
import { useMessages, useWorkbench, useWorkbenchStore } from '../react.tsx'
import type { PreviewView } from '../store.ts'

/** How long a page may take to say `ready` before it is loaded again, and how often. */
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
