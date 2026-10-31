import { useEffect, useRef, useState } from 'react'
import type { SpeechSettingsAnswer } from '@lincyaw/kernel'
import { PmBadge, PmButton, PmCard, PmDialog, PmField, PmInput, PmNotice, PmPanelHeader } from '../components.tsx'
import { useWorkbench, useWorkbenchState } from '../context.tsx'
import { SPEECH_SETTINGS_MESSAGES } from '../speech-settings-messages.ts'
import { WorkspaceServerError } from '../workspace-client.ts'

/** Write-only credentials: values stay in this mounted form until an acknowledged save or close. */
export function SpeechSettingsPanel() {
  const workbench = useWorkbench(), locale = useWorkbenchState(state => state.locale), t = SPEECH_SETTINGS_MESSAGES[locale]
  const [settings, setSettings] = useState<SpeechSettingsAnswer>(), [key, setKey] = useState(''), [appId, setAppId] = useState('')
  const [loading, setLoading] = useState(true), [busy, setBusy] = useState(false), [failure, setFailure] = useState<string>(), [status, setStatus] = useState<string>(), [confirm, setConfirm] = useState(false)
  const owner = useRef(true), request = useRef<AbortController>(), dirty = useRef(false)
  const load = async (checked = false) => {
    request.current?.abort(); const controller = new AbortController(); request.current = controller
    setLoading(true); setFailure(undefined); setStatus(undefined)
    try {
      if (!workbench.client.readSpeechSettings) throw new Error('unsupported')
      const value = await workbench.client.readSpeechSettings(controller.signal)
      if (!owner.current || controller.signal.aborted) return
      setSettings(value)
      if (checked) setStatus(value.configured ? t.checked : t.unconfigured)
    } catch { if (owner.current && !controller.signal.aborted) setFailure(t.unavailable) }
    finally { if (owner.current && !controller.signal.aborted) setLoading(false) }
  }
  useEffect(() => { owner.current = true; void load(); return () => { owner.current = false; request.current?.abort() } }, [workbench])
  const save = async (clear = false) => {
    if (!settings || !workbench.client.changeSpeechSettings) return
    request.current?.abort(); const controller = new AbortController(); request.current = controller
    setBusy(true); setFailure(undefined); setStatus(undefined)
    try {
      const value = await workbench.client.changeSpeechSettings(clear ? { action: 'clear', revision: settings.revision } : { action: 'save', revision: settings.revision, ...key.trim() ? { apiKey: key.trim() } : {}, ...appId.trim() ? { appId: appId.trim() } : {} }, controller.signal)
      if (!owner.current || controller.signal.aborted) return
      setSettings(value); setKey(''); setAppId(''); dirty.current = false; setConfirm(false)
      setStatus(clear ? t.cleared : t.saved); workbench.refreshVoiceServices()
    } catch (error) {
      if (owner.current && !controller.signal.aborted) {
        const code = error instanceof WorkspaceServerError ? error.answer.error : undefined
        setFailure(code === 'speech-settings-conflict' ? t.conflict : code === 'speech-settings-invalid' ? t.invalid : code === 'speech-settings-busy' ? t.busy : t.failed)
      }
    } finally { if (owner.current && !controller.signal.aborted) setBusy(false) }
  }
  const disabled = busy || loading || !settings?.writable
  return <section className="pmw-speech-settings pm-ui" aria-label={t.title}>
    <PmPanelHeader title={t.title} />
    <div className="pmw-speech-settings__content">
      <p>{t.description}</p>
      {loading && <PmNotice>{t.loading}</PmNotice>}
      {failure && <PmNotice tone="danger">{failure} <PmButton small disabled={busy || loading} onClick={() => void load()}>{t.retry}</PmButton></PmNotice>}
      {status && <PmNotice tone="accent">{status}</PmNotice>}
      <PmCard><div className="pmw-speech-settings__fields">
        <PmField label={t.service}><span>{t.provider} · {t.model}</span><PmBadge tone={settings?.configured ? 'accent' : 'neutral'}>{settings?.configured ? t.configured : t.unconfigured}</PmBadge></PmField>
        {settings && <p>{t.source[settings.source]}</p>}
        <PmInput type="password" label={t.key} hint={t.keyHint} placeholder={settings?.configured ? t.keySaved : t.keyPlaceholder} value={key} disabled={disabled} autoComplete="new-password" spellCheck={false} maxLength={8192} onChange={event => { dirty.current = Boolean(event.target.value.trim() || appId.trim()); setKey(event.target.value); setStatus(undefined) }} />
        <PmInput label={t.appId} hint={t.appIdHint} placeholder={settings?.appIdConfigured ? t.keySaved : t.appIdPlaceholder} value={appId} disabled={disabled} autoComplete="off" inputMode="numeric" spellCheck={false} maxLength={32} onChange={event => { dirty.current = Boolean(event.target.value.trim() || key.trim()); setAppId(event.target.value); setStatus(undefined) }} />
        <div className="pmw-speech-settings__actions"><PmButton variant="accent" loading={busy} disabled={disabled || !key.trim() && !settings?.configured} onClick={() => void save()}>{t.save}</PmButton><PmButton disabled={busy || loading || dirty.current} onClick={() => void load(true)}>{t.check}</PmButton></div>
      </div></PmCard>
      <PmNotice>{t.verification}</PmNotice>
      <p>{t.privacy}</p>
      <div className="pmw-speech-settings__actions"><a className="pm-ui-link" href="https://console.volcengine.com/speech/new/setting/apikeys" target="_blank" rel="noreferrer">{t.console}</a>{settings?.stored && <PmButton small variant="ghost" disabled={disabled} onClick={() => setConfirm(true)}>{t.remove}</PmButton>}</div>
    </div>
    <PmDialog open={confirm} label={t.removeTitle} closeLabel={t.cancel} busy={busy} onClose={() => setConfirm(false)} description={t.removeHint} footer={<><PmButton disabled={busy} onClick={() => setConfirm(false)}>{t.cancel}</PmButton><PmButton variant="danger" loading={busy} onClick={() => void save(true)}>{t.remove}</PmButton></>} />
  </section>
}
