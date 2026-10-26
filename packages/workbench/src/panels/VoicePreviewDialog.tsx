import { useEffect, useRef, useState } from 'react'
import type { VoicePreviewQuote } from '@lincyaw/kernel'
import { Audition } from '../audition.ts'
import type { AuditionState } from '../audition.ts'
import { PmButton, PmDialog, PmField, PmNotice } from '../components.tsx'
import { useWorkbench, useWorkbenchState } from '../context.tsx'
import { VOICE_MESSAGES, voiceFailure } from '../voice-messages.ts'
import { voiceSnapshotCurrent } from '../voice-snapshot.ts'
import type { VoiceSnapshot } from '../voice-snapshot.ts'

/** A quote authorizes one explicit audition, never a setting change or automatic synthesis. */
export function VoicePreviewDialog({ quote, snapshot, onClose, onRecheck }: { quote: VoicePreviewQuote, snapshot: VoiceSnapshot, onClose(): void, onRecheck?(): void }) {
  const workbench = useWorkbench(), locale = useWorkbenchState(state => state.locale), t = VOICE_MESSAGES[locale]
  const current = useWorkbenchState(() => voiceSnapshotCurrent(workbench, snapshot))
  const audition = useRef<Audition>(), owner = useRef(0), closed = useRef(false)
  const [state, setState] = useState<AuditionState>({ status: 'idle' }), [error, setError] = useState<string>(), [invalid, setInvalid] = useState(false)
  const matches = quote.revision === snapshot.revision && quote.source.documentId === snapshot.source.documentId && quote.source.version === snapshot.source.version && quote.source.fingerprint === snapshot.source.fingerprint

  useEffect(() => {
    const version = ++owner.current, player = new Audition(workbench)
    closed.current = false; audition.current = player
    setState(player.snapshot()); setError(undefined); setInvalid(false)
    const stop = player.subscribe(() => { if (owner.current === version && !closed.current) setState(player.snapshot()) })
    return () => { owner.current++; stop(); player.dispose(); if (audition.current === player) audition.current = undefined }
  }, [workbench, quote, snapshot])

  useEffect(() => {
    if (current && matches) return
    setInvalid(true); audition.current?.stop()
  }, [current, matches])

  const close = () => { if (closed.current) return; closed.current = true; owner.current++; audition.current?.dispose(); onClose() }
  const recheck = () => { audition.current?.stop(); onRecheck?.() }
  const confirm = () => {
    const player = audition.current, version = owner.current
    if (!player || closed.current || invalid || !matches || !voiceSnapshotCurrent(workbench, snapshot)) return
    setError(undefined)
    void player.play(async signal => {
      try {
        if (!voiceSnapshotCurrent(workbench, snapshot)) throw new Error('voice-context-changed')
        const answer = await workbench.client.previewVoice(snapshot.directory, { revision: quote.revision, source: quote.source, voice: quote.voice, mode: quote.mode, ...quote.target ? { target: quote.target } : {}, quote: quote.quote, confirmed: true }, signal)
        signal.throwIfAborted()
        if (owner.current !== version || closed.current || !voiceSnapshotCurrent(workbench, snapshot) || answer.revision !== quote.revision
          || answer.source.documentId !== quote.source.documentId || answer.source.version !== quote.source.version || answer.source.fingerprint !== quote.source.fingerprint) throw new Error('voice-context-changed')
        return { audio: answer.audio }
      } catch (failure) {
        if (owner.current === version && !closed.current && !signal.aborted) {
          setError(voiceFailure(failure, locale))
          if (failure instanceof Error && ['voice-context-changed', 'voice-source-changed', 'voice-source-unavailable', 'voice-revision-changed', 'voice-preview-changed'].includes(failure.message)) setInvalid(true)
        }
        throw failure
      }
    })
  }
  const changed = invalid || !current || !matches, active = state.status === 'loading' || state.status === 'playing'
  return <PmDialog open label={quote.mode === 'step' ? t.currentScript : t.standard} description={t.previewHint} closeLabel={t.close} onClose={close} footer={<>
    <PmButton small onClick={close}>{t.close}</PmButton>
    {changed && onRecheck && <PmButton small onClick={recheck}>{t.recheck}</PmButton>}
    {active ? <PmButton small onClick={() => audition.current?.stop()}>{t.stop}</PmButton>
      : <PmButton small variant="accent" disabled={changed || !audition.current} onClick={confirm}>{t.confirmPreview}</PmButton>}
  </>}>
    <div className="pmw-operation">
    <PmField label={t.provider}><span>{quote.provider}</span></PmField>
    <PmField label={t.currentVoice}><span>{quote.voice.voice}</span></PmField>
    {quote.target && <PmField label={t.scope}><span>{snapshot.ir.sections.find(page => page.id === quote.target?.section)?.title} · {t.step(snapshot.ir.sections.findIndex(page => page.id === quote.target?.section) + 1, quote.target.step + 1)}</span></PmField>}
    <PmField label={quote.mode === 'step' ? t.currentScript : t.sampleText}><p className="pmw-voice__sample">{quote.text}</p></PmField>
    <PmNotice>{quote.cached ? t.cachedPreview : t.disclosure(quote.provider, quote.local)}</PmNotice>
    {changed && <PmNotice tone="warn">{t.changed}</PmNotice>}
    {state.status === 'loading' && <PmNotice>{t.auditionLoading}</PmNotice>}
    {state.status === 'playing' && <PmNotice tone="accent">{t.auditioning}</PmNotice>}
    {(error || state.status === 'failed') && <PmNotice tone="danger">{error ?? voiceFailure(new Error(state.error), locale)}</PmNotice>}
    </div>
  </PmDialog>
}
