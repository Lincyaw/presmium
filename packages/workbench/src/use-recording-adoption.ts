import { useEffect, useRef, useState } from 'react'
import type { DocumentRecordingAdoption } from '@lincyaw/kernel'
import type { DocumentSessionState } from './document-session.ts'
import { useWorkbench, useWorkbenchState } from './context.tsx'

const requestId = () => `recording_${[...crypto.getRandomValues(new Uint8Array(16))].map(value => value.toString(16).padStart(2, '0')).join('')}`
function applied(source: DocumentSessionState | undefined, request: DocumentRecordingAdoption): boolean {
  const document = source?.content, step = document?.steps[request.stepId]
  const voice = step && (document.production.stepOverrides[step.id]?.voiceSource ?? document.production.sectionOverrides?.[step.sectionId]?.voiceSource ?? document.production.defaults.voiceSource)
  return Boolean(document?.id === request.source.documentId && voice?.type === 'recording' && voice.assetId === request.assetId && document.assets[request.assetId]?.fingerprint === `sha256:${request.sha256}`)
}

/** Request ownership and selection only; canonical changes and recovery belong to DocumentSession. */
export function useRecordingAdoption({ identity, sectionId, stepId, active, disabled, candidateAssetId, onAdopted }: {
  identity: string, sectionId: string, stepId: string, active: boolean, disabled: boolean, candidateAssetId?: string, onAdopted(): void,
}) {
  const workbench = useWorkbench(), source = useWorkbenchState(state => state.authoring)
  const [selection, setSelection] = useState<string>(), [busy, setBusy] = useState(false), [failure, setFailure] = useState<string>()
  const owner = useRef({ active: false, revision: 0 }), request = useRef<AbortController>(), retry = useRef<DocumentRecordingAdoption>(), submitted = useRef<DocumentRecordingAdoption>(), reported = useRef<string>()
  const latest = useRef({ sectionId, stepId, active, onAdopted }); latest.current = { sectionId, stepId, active, onAdopted }
  const document = source?.identity === identity ? source.content : undefined
  const effective = document && (document.production.stepOverrides[stepId]?.voiceSource ?? document.production.sectionOverrides?.[sectionId]?.voiceSource ?? document.production.defaults.voiceSource)
  const selected = selection ?? candidateAssetId ?? (effective?.type === 'recording' ? effective.assetId : '')
  const assets = Object.values(document?.assets ?? {}).filter(asset => asset.kind === 'audio')
  const adopted = Boolean(source && !source.loading && !source.dirty && !source.saving && !source.error && effective?.type === 'recording' && effective.assetId === selected && /^sha256:[a-f\d]{64}$/.test(document?.assets[selected]?.fingerprint ?? ''))
  const current = () => owner.current.active && workbench.getState().authoring?.identity === identity
  useEffect(() => { owner.current.active = true; return () => { owner.current.active = false; request.current?.abort() } }, [])
  useEffect(() => {
    owner.current.revision++; request.current?.abort(); request.current = undefined; setBusy(false); setFailure(undefined)
  }, [sectionId, stepId, active])
  useEffect(() => {
    const sent = submitted.current
    if (!sent || source?.identity !== identity) return
    if (applied(source, sent)) {
      if (retry.current?.id === sent.id) retry.current = undefined
      if (!source.loading && !source.dirty && !source.saving && !source.composing && !source.error && reported.current !== sent.id) {
        reported.current = sent.id
        setFailure(undefined); latest.current.onAdopted()
      }
    } else if (source.version !== sent.source.version && request.current) {
      request.current.abort(); request.current = undefined; setBusy(false); setFailure('production-source-changed')
    }
  }, [identity, source?.identity, source?.version, source?.content, source?.loading, source?.dirty, source?.saving, source?.composing, source?.error])
  const choose = (assetId: string) => {
    owner.current.revision++; request.current?.abort(); request.current = undefined; retry.current = undefined
    setSelection(assetId); setBusy(false); setFailure(undefined)
  }
  const imported = (assetId: string, revision: number) => { if (current() && owner.current.revision === revision) choose(assetId) }
  const adopt = async () => {
    if (!selected || busy || disabled || !active || !current() || adopted) return
    const target = { sectionId, stepId, assetId: selected }, revision = owner.current.revision, controller = new AbortController()
    request.current = controller; setBusy(true); setFailure(undefined)
    const owns = () => current() && request.current === controller && !controller.signal.aborted && owner.current.revision === revision
      && latest.current.active && latest.current.sectionId === target.sectionId && latest.current.stepId === target.stepId
    let sent: DocumentRecordingAdoption | undefined
    try {
      await workbench.flushPendingEdits(controller.signal)
      if (!owns()) return
      const source = workbench.getState().authoring
      if (!source?.version || !source.fingerprint || !source.content || source.identity !== identity || source.dirty || source.saving || source.composing || source.restored || source.error) throw new Error('production-source-changed')
      const expected = { identity, version: source.version }, inspection = await workbench.inspectDocumentAudio(target.assetId, expected, controller.signal)
      if (!owns()) return
      const canonical = { documentId: source.content.id, version: source.version, fingerprint: source.fingerprint }, previous = retry.current
      sent = previous && previous.source.documentId === canonical.documentId && previous.source.version === canonical.version && previous.source.fingerprint === canonical.fingerprint && previous.stepId === target.stepId && previous.assetId === target.assetId && previous.sha256 === inspection.inspection.sha256
        ? previous : { id: requestId(), source: canonical, stepId: target.stepId, assetId: target.assetId, sha256: inspection.inspection.sha256 }
      retry.current = sent; submitted.current = sent
      await workbench.adoptDocumentRecording(sent, expected, controller.signal)
      if (!owns()) return
      if (retry.current === sent) retry.current = undefined
      setFailure(undefined)
      if (reported.current !== sent.id) { reported.current = sent.id; latest.current.onAdopted() }
    } catch (error) {
      if (owns()) {
        const confirmed = sent && applied(workbench.getState().authoring, sent)
        if (confirmed && retry.current === sent) retry.current = undefined
        setFailure(confirmed ? undefined : error instanceof Error ? error.message : 'recording-adoption-failed')
      }
    } finally {
      if (request.current === controller) { request.current = undefined; if (current()) setBusy(false) }
    }
  }
  const cancel = () => { owner.current.revision++; request.current?.abort(); request.current = undefined; setBusy(false); setFailure(undefined) }
  return { assets, selected, choose, imported, revision: () => owner.current.revision, adopt, cancel, busy, failure, adopted }
}
