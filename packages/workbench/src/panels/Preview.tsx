import { useLayoutEffect, useRef, useState } from 'react'
import { createPreviewPool } from '../preview-pool.ts'
import type { PreviewState } from '../preview-pool.ts'
import { PmIconButton, PmNotice } from '../components.tsx'
import { useMessages, useWorkbench, useWorkbenchStore } from '../react.tsx'
import { EditorGroup } from './EditorGroup.tsx'
import type { EditorGroupProps } from './EditorGroup.tsx'

export function PreviewPanel({ active = true, ...props }: EditorGroupProps & { active?: boolean }) {
  const t = useMessages()
  const workbench = useWorkbenchStore()
  const document = useWorkbench(state => state.document)
  const documents = useWorkbench(state => state.documents)
  const preview = useWorkbench(state => state.preview)
  const failure = useWorkbench(state => state.previewFailure)
  const view = useWorkbench(state => state.view)
  const reload = useWorkbench(state => state.previewReload)
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
      ? { document, view, address, title: t.previewTitle(title), reload: loads + reload }
      : undefined)
  }, [active, document, view, address, title, loads, reload, failure, t, workbench])

  return (
    <section className="pmw-preview" aria-label={t.preview} data-ready={(active && document !== undefined && ready) || undefined}>
      <EditorGroup {...props} kind="preview" actions={<PreviewActions />}>
      {mismatch && <PmNotice tone="warn">{t.versionMismatch}</PmNotice>}
      {identityFailure && <PmNotice tone="danger">{t.previewIdentityMismatch}</PmNotice>}
      {failure && <PmNotice tone="danger">{t.previewFailed(failure)}</PmNotice>}
      {!ready && !preview && !failure && <p className="pmw-muted pmw-preview__loading">{t.previewLoading}</p>}
      {view === 'slides' && preview && !preview.slides && <p className="pmw-muted">{t.noSlides}</p>}
      <div ref={container} className="pmw-preview__frames" />
      </EditorGroup>
    </section>
  )
}

export function PreviewActions() {
  const t = useMessages()
  const workbench = useWorkbenchStore()
  const picking = useWorkbench(state => state.picking)
  return <>
    <PmIconButton small icon="edit" label={t.pick} aria-pressed={picking} title={t.pickHint} onClick={() => workbench.setPicking(!picking)} />
    <PmIconButton icon="redo" label={t.reloadPreview} small onClick={() => workbench.reloadPreview()} />
  </>
}
