import { useEffect, useId, useState } from 'react'
import { PmButton, PmField, PmNotice, useMessages, useStore } from '@lincyaw/host'
import { useViewer } from '../viewer-state.ts'
import { EDITOR_MESSAGES } from './messages.ts'
import { nativeTextSession } from './native-text-session.ts'
import type { NativeTextDraft, NativeTextSession } from './native-text-session.ts'
import './style.css'

function TextDraft({ session, draft }: { session: NativeTextSession; draft: NativeTextDraft }) {
  const t = useMessages(EDITOR_MESSAGES)
  const id = useId()
  const [copyFailure, setCopyFailure] = useState(false)
  const [confirmDiscard, setConfirmDiscard] = useState(false)
  useEffect(() => () => session.interrupt(draft.target), [session, draft.target.section, draft.target.block])
  const busy = session.saving(draft.target)
  const failed = Boolean(draft.error)
  const message = draft.error === 'native-composition' ? t.nativeComposition
    : draft.error === 'native-conflict' || draft.error === 'native-target' ? t.nativeConflict
    : draft.error === 'native-format' ? t.nativeFormat
    : draft.error === 'native-confirmation' ? t.nativeConfirmation
    : draft.error === 'native-unavailable' ? t.nativeUnavailable
    : draft.error === 'save-timeout' ? t.nativeTimeout
    : failed ? t.nativeFailed : draft.restored ? t.nativeRestored : busy ? t.saving : t.nativePending
  return (
    <PmNotice tone={failed ? 'danger' : 'warn'} className="pm-native-text-draft" data-native-text-key={JSON.stringify([draft.target.section, draft.target.block ?? ''])}>
      <div id={`${id}-status`}>{message}</div>
      <PmField label={draft.target.block ? t.nativeBody : t.nativeTitle}>
        <textarea className="pm-ui-textarea" data-density="compact" value={draft.after} rows={draft.target.block ? 3 : 2}
          aria-describedby={`${id}-status`} onChange={event => session.change(draft.target, event.target.value)}
          onCompositionStart={() => session.composition(draft.target, true)}
          onCompositionEnd={() => queueMicrotask(() => session.composition(draft.target, false))} />
      </PmField>
      <div className="pm-block-editor__recovery">
        <PmButton small loading={busy} disabled={draft.composing} onClick={() => { setConfirmDiscard(false); session.retry(draft.target) }}>{draft.review || draft.restored ? t.nativeConfirmSave : t.retry}</PmButton>
        <PmButton small onClick={() => {
          setCopyFailure(false)
          void navigator.clipboard.writeText(draft.after).catch(() => setCopyFailure(true))
        }}>{t.nativeCopy}</PmButton>
        <PmButton small disabled={busy} onClick={() => setConfirmDiscard(value => !value)}>{t.nativeDiscard}</PmButton>
      </div>
      {copyFailure ? <div role="alert">{t.nativeCopyFailed}</div> : null}
      {confirmDiscard ? <div className="pm-block-editor__recovery" role="group" aria-label={t.nativeDiscard}>
        <span>{t.nativeDiscardConfirm}</span>
        <PmButton small variant="danger" onClick={() => session.discard(draft.target)}>{t.nativeDiscard}</PmButton>
        <PmButton small onClick={() => setConfirmDiscard(false)}>{t.cancel}</PmButton>
      </div> : null}
    </PmNotice>
  )
}

/** The source remains visible; unconfirmed text stays editable beside its original target. */
export function NativeTextRecovery({ section, orphaned = false }: { section?: string; orphaned?: boolean }) {
  const viewer = useViewer(), session = nativeTextSession(viewer)
  const drafts = useStore(session.state), storageFailure = useStore(session.storageFailure)
  const unreadable = useStore(session.unreadableDraft)
  const [copyFailed, setCopyFailed] = useState(false)
  const [discardUnknown, setDiscardUnknown] = useState(false)
  const t = useMessages(EDITOR_MESSAGES)
  const local = Object.entries(drafts).filter(([, draft]) => orphaned ? !viewer.section(draft.target.section) : draft.target.section === section)
  const visible = local.filter(([, draft]) => !draft.editing && (draft.after !== draft.before || draft.review || draft.composing || Boolean(draft.error) || session.saving(draft.target)))
  if (!visible.length && !(storageFailure && (local.length || orphaned)) && !(orphaned && unreadable !== undefined)) return null
  return <div className="pm-native-text-recovery">
    {orphaned && unreadable !== undefined ? <PmNotice tone="danger" className="pm-native-text-draft">
      <div>{t.nativeUnreadable}</div>
      <div className="pm-block-editor__recovery">
        <PmButton small onClick={() => { setCopyFailed(false); void navigator.clipboard.writeText(unreadable).catch(() => setCopyFailed(true)) }}>{t.nativeCopyBackup}</PmButton>
        <PmButton small onClick={() => setDiscardUnknown(value => !value)}>{t.nativeDiscardBackup}</PmButton>
      </div>
      {copyFailed ? <div role="alert">{t.nativeCopyFailed}</div> : null}
      {discardUnknown ? <div className="pm-block-editor__recovery"><span>{t.nativeDiscardBackupConfirm}</span><PmButton small variant="danger" onClick={() => session.discardUnreadable()}>{t.nativeDiscardBackup}</PmButton><PmButton small onClick={() => setDiscardUnknown(false)}>{t.cancel}</PmButton></div> : null}
    </PmNotice> : null}
    {storageFailure ? <PmNotice tone="danger">{t.nativeStorage}</PmNotice> : null}
    {visible.map(([key, draft]) => <TextDraft key={key} session={session} draft={draft} />)}
  </div>
}
