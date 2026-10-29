import { useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { connectAuthoringClient, DocumentView, PmNotice, PmSkeleton, Workbench, WorkbenchApprovals, WorkbenchProvider, workspaceClient } from '@lincyaw/workbench'
import type { HistoryRevisionAction } from '@lincyaw/workbench'
import '@lincyaw/workbench/styles.css'
import { ApiError, authenticatedFetch } from './api.ts'
import type { EditorDescriptor, Locale } from './api.ts'
import { MESSAGES } from './messages.ts'
import { ErrorNotice } from './components.tsx'

interface Initialization { workbench: Workbench, document?: string, status: 'loading' | 'ready' | 'failed', error?: unknown }

/** The cloud supplies transport and identity; the existing workbench owns all editable content. */
export default function NativeEditor({ descriptor, locale, dark, registerBeforeLeave, onBack, actions, historyRevisionAction, onWorkbench }: { descriptor: EditorDescriptor, locale: Locale, dark: boolean, registerBeforeLeave(leave?: () => Promise<void>): void, onBack(): void, actions?: ReactNode, historyRevisionAction?: HistoryRevisionAction, onWorkbench?(workbench?: Workbench): void }) {
  const base = useMemo(() => {
    try {
      const url = new URL(descriptor.apiBase!, window.location.origin)
      return url.origin === window.location.origin && !url.search && !url.hash ? url.href : undefined
    } catch { return undefined }
  }, [descriptor.apiBase])
  const workbench = useMemo(() => {
    if (!base) return undefined
    const client = workspaceClient(base, undefined, { fetch: authenticatedFetch })
    client.capabilities = { diagnostics: 'none', production: false, narration: false, readOnly: descriptor.readOnly }
    return new Workbench({ client, locale, isDark: dark, preparationTimeoutMs: 120_000 })
  }, [base, descriptor.readOnly])
  const [initialization, setInitialization] = useState<Initialization>()
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    if (!workbench) return
    const disconnect = connectAuthoringClient(workbench)
    return () => { disconnect(); workbench.dispose() }
  }, [workbench])
  useEffect(() => {
    if (!workbench) return
    let disposed = false
    const directory = descriptor.document
    setInitialization({ workbench, document: directory, status: 'loading' })
    void (async () => {
      if (directory === undefined) throw new ApiError(404, 'cloud-document-missing')
      await workbench.loadDocuments()
      if (disposed) return
      if (workbench.getState().documentsFailure) throw new ApiError(503, 'cloud-editor-initialization-failed')
      if (workbench.getState().document === directory && !workbench.getState().authoring?.content) await workbench.retryDocument()
      else await workbench.openDocument(directory)
      if (disposed) return
      const state = workbench.getState(), source = state.authoring
      if (state.document !== directory || source?.directory !== directory || source.loading || !source.content || !source.version || !source.fingerprint) throw new ApiError(503, 'cloud-editor-initialization-failed')
      // Once source exists, its actual errors and recoverable drafts belong to DocumentView.
      setInitialization({ workbench, document: directory, status: 'ready' })
    })().catch(error => { if (!disposed) setInitialization({ workbench, document: directory, status: 'failed', error }) })
    return () => { disposed = true }
  }, [workbench, descriptor.document, attempt])
  useEffect(() => { workbench?.setLocale(locale) }, [workbench, locale])
  useEffect(() => { workbench?.setDark(dark) }, [workbench, dark])
  useEffect(() => { onWorkbench?.(workbench); return () => onWorkbench?.(undefined) }, [workbench, onWorkbench])
  useEffect(() => {
    if (!workbench) return
    registerBeforeLeave(async () => { await workbench.pausePlayback(); await workbench.flushPendingEdits() })
    return () => registerBeforeLeave(undefined)
  }, [workbench, registerBeforeLeave])
  if (!workbench) return <PmNotice tone="danger">{MESSAGES[locale].editorUnavailable}</PmNotice>
  const current = initialization?.workbench === workbench && initialization.document === descriptor.document ? initialization : undefined
  if (!current || current.status === 'loading') return <PmSkeleton label={MESSAGES[locale].editorConnecting} />
  if (current.status === 'failed') return <ErrorNotice error={current.error} t={MESSAGES[locale]} retry={() => setAttempt(value => value + 1)} />
  return <div className="pmc-native-editor"><WorkbenchProvider workbench={workbench}><WorkbenchApprovals /><DocumentView onBack={onBack} actions={actions} historyRevisionAction={historyRevisionAction} /></WorkbenchProvider></div>
}
