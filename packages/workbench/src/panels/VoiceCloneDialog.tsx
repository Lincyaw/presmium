import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import type { SpeechEngineInfo, VoiceCloneStatus } from '@lincyaw/kernel'
import { AudioRecording, recordingUnavailable } from '../audio-recording.ts'
import { AUDIO_RECORDING_MESSAGES } from '../audio-recording-messages.ts'
import { toWav } from '../audio-wav.ts'
import type { WavAudio } from '../audio-wav.ts'
import { Audition } from '../audition.ts'
import type { AuditionState } from '../audition.ts'
import { PmButton, PmDialog, PmField, PmInput, PmNotice } from '../components.tsx'
import { useWorkbench, useWorkbenchState } from '../context.tsx'
import { cloneFailure, VOICE_CLONE_MESSAGES } from '../voice-clone-messages.ts'

type Take = WavAudio & { name: string }

/** One recording of the clone form: from the microphone or a file, kept as WAV so every provider takes it. */
function RecordingSlot({ label, hint, value, disabled, onChange }: { label: string, hint: string, value?: Take, disabled: boolean, onChange(value?: Take): void }) {
  const workbench = useWorkbench(), locale = useWorkbenchState(state => state.locale)
  const t = VOICE_CLONE_MESSAGES[locale], r = AUDIO_RECORDING_MESSAGES[locale]
  const [recording] = useState(() => new AudioRecording())
  const state = useSyncExternalStore(recording.subscribe, recording.snapshot)
  const [unavailable] = useState(recordingUnavailable)
  const [preparing, setPreparing] = useState(false), [failure, setFailure] = useState<string>()
  const [listening, setListening] = useState<AuditionState>({ status: 'idle' })
  const audition = useRef<Audition>(), file = useRef<HTMLInputElement>(null), mounted = useRef(true)
  useEffect(() => () => { mounted.current = false; recording.dispose(); audition.current?.dispose() }, [recording])
  const accept = async (blob: Blob, name: string) => {
    setPreparing(true); setFailure(undefined); audition.current?.stop()
    try {
      const wav = await toWav(blob)
      if (mounted.current) onChange({ ...wav, name })
    } catch { if (mounted.current) setFailure(t.decodeFailed) }
    finally { if (mounted.current) setPreparing(false) }
  }
  // A finished take becomes the slot's WAV; the take itself is not kept.
  const take = state.candidate?.file
  useEffect(() => {
    if (!take) return
    void accept(take, r.title).finally(() => recording.discard())
  }, [take])
  const capturing = ['requesting', 'recording', 'stopping'].includes(state.phase)
  const start = () => {
    setFailure(undefined)
    void recording.start(async () => {
      workbench.stopAuditions()
      await workbench.pausePlayback()
      return workbench.registerAudioCapture(() => recording.stop())
    })
  }
  const listen = () => {
    if (!value) return
    if (!audition.current) {
      const player = audition.current = new Audition(workbench)
      player.subscribe(() => { if (mounted.current) setListening(player.snapshot()) })
    }
    if (listening.status === 'playing' || listening.status === 'loading') audition.current.stop()
    else void audition.current.play(async () => ({ audio: value.blob }))
  }
  const status = state.phase === 'requesting' ? r.requesting : state.phase === 'recording' ? r.recording : preparing ? t.preparing : value ? `${value.name} · ${t.seconds(value.seconds)}` : t.empty
  return <PmField label={label} hint={hint} group>
    <span className="pm-ui-hint" role="status">{status}</span>
    {(state.error || unavailable) && !capturing && <PmNotice tone="warn">{r.failures[state.error ?? unavailable!] ?? r.failures['recording-failed']}</PmNotice>}
    {failure && <PmNotice tone="danger">{failure}</PmNotice>}
    <div className="pmw-voice__actions">
      {state.phase === 'recording' ? <PmButton small variant="primary" onClick={() => recording.stop()}>{t.stop}</PmButton>
        : <PmButton small disabled={disabled || capturing || preparing || Boolean(unavailable)} onClick={start}>{t.record}</PmButton>}
      <PmButton small disabled={disabled || capturing || preparing} onClick={() => file.current?.click()}>{t.choose}</PmButton>
      {value && <PmButton small icon="audio" disabled={capturing || preparing} loading={listening.status === 'loading'} onClick={listen}>{listening.status === 'playing' ? t.stopListening : t.listen}</PmButton>}
      {value && <PmButton small disabled={disabled || capturing || preparing} onClick={() => { audition.current?.stop(); onChange(undefined) }}>{t.clear}</PmButton>}
    </div>
    <input ref={file} hidden type="file" accept="audio/*,.wav,.mp3,.m4a,.ogg,.webm" onChange={(event) => {
      const chosen = event.currentTarget.files?.[0]
      event.currentTarget.value = ''
      if (chosen) void accept(chosen, chosen.name)
    }} />
  </PmField>
}

interface Props { directory: string, engine: SpeechEngineInfo, lang: string, onUse(voice: string): void, onClose(): void }

/**
 * Trains a cloned voice: who speaks, their consent read aloud, a sample; then a confirmation that names the cost,
 * since the provider charges for training; then the training, polled until it ends. The server registers the
 * consent before it sends anything to the provider.
 */
export function VoiceCloneDialog({ directory, engine, lang, onUse, onClose }: Props) {
  const workbench = useWorkbench(), locale = useWorkbenchState(state => state.locale), t = VOICE_CLONE_MESSAGES[locale]
  const volcengine = engine.id === 'volcengine'
  const [voice, setVoice] = useState(''), [speaker, setSpeaker] = useState(''), [scope, setScope] = useState(t.defaultScope)
  const [statement, setStatement] = useState<Take>(), [sample, setSample] = useState<Take>()
  const [confirming, setConfirming] = useState(false), [busy, setBusy] = useState(false), [failure, setFailure] = useState<string>()
  const [status, setStatus] = useState<VoiceCloneStatus>(), [waited, setWaited] = useState(0)
  const request = useRef<AbortController>()
  useEffect(() => () => request.current?.abort(), [])
  const name = voice.trim()
  const nameInvalid = Boolean(name) && !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(name)
  const trained = status?.state === 'ready'
  const locked = busy || trained
  const ready = Boolean(name && !nameInvalid && speaker.trim() && scope.trim() && statement && sample) && !locked
  const train = async () => {
    const controller = new AbortController()
    request.current?.abort(); request.current = controller
    setConfirming(false); setBusy(true); setFailure(undefined); setStatus(undefined); setWaited(0)
    const pause = (ms: number) => new Promise<void>((resolve, reject) => {
      const timer = setTimeout(resolve, ms)
      controller.signal.addEventListener('abort', () => { clearTimeout(timer); reject(controller.signal.reason) }, { once: true })
    })
    try {
      let answer = await workbench.client.cloneVoice(directory, { engine: engine.id, voice: name, lang, speaker: speaker.trim(), scope: scope.trim(), sample: sample!.blob, statement: statement!.blob }, controller.signal)
      setStatus(answer)
      const started = Date.now()
      // Training takes seconds to minutes; poll every three seconds for at most ten minutes.
      while (answer.state === 'training' && Date.now() - started < 10 * 60_000) {
        await pause(3000)
        answer = await workbench.client.readCloneStatus(directory, name, engine.id, controller.signal)
        setStatus(answer); setWaited(Date.now() - started)
      }
    } catch (error) { if (!controller.signal.aborted) setFailure(cloneFailure(error, locale)) }
    finally { if (request.current === controller) { request.current = undefined; setBusy(false) } }
  }
  const close = () => { request.current?.abort(); onClose() }
  return <>
    <PmDialog open label={t.title} closeLabel={t.close} description={t.description} onClose={close} footer={<>
      <PmButton onClick={close}>{t.close}</PmButton>
      {trained ? <PmButton variant="primary" onClick={() => onUse(name)}>{t.use}</PmButton>
        : <PmButton variant="primary" loading={busy} disabled={!ready} onClick={() => setConfirming(true)}>{t.train}</PmButton>}
    </>}>
      <div className="pmw-voice__form">
        {failure && <PmNotice tone="danger">{failure}</PmNotice>}
        {status && <PmNotice tone={status.state === 'ready' ? 'ok' : status.state === 'failed' ? 'danger' : 'accent'}><span role="status">{t.state(status, waited)}</span></PmNotice>}
        <PmInput label={t.voice} hint={t.voiceHint(volcengine)} error={nameInvalid ? t.voiceInvalid : undefined} value={voice} maxLength={128} spellCheck={false} autoComplete="off" disabled={locked} onChange={event => setVoice(event.target.value)} />
        <PmInput label={t.speaker} hint={t.speakerHint} value={speaker} maxLength={80} disabled={locked} onChange={event => setSpeaker(event.target.value)} />
        <PmInput label={t.scope} hint={t.scopeHint} value={scope} maxLength={200} disabled={locked} onChange={event => setScope(event.target.value)} />
        <PmField label={t.statementLabel}><p className="pmw-voice__sample">{t.statementText(speaker.trim() || t.someone, scope.trim() || t.defaultScope)}</p></PmField>
        <RecordingSlot label={t.statement} hint={t.statementHint} value={statement} disabled={locked} onChange={setStatement} />
        <PmField label={t.passageLabel}><p className="pmw-voice__sample">{t.passage}</p></PmField>
        <RecordingSlot label={t.sample} hint={t.sampleHint} value={sample} disabled={locked} onChange={setSample} />
        {sample && (sample.seconds < 10 || sample.seconds > 30) && <PmNotice tone="warn">{t.sampleLength(sample.seconds)}</PmNotice>}
      </div>
    </PmDialog>
    <PmDialog open={confirming} label={t.confirmTitle} closeLabel={t.cancel} description={t.confirmHint} onClose={() => setConfirming(false)} footer={<>
      <PmButton onClick={() => setConfirming(false)}>{t.cancel}</PmButton>
      <PmButton variant="primary" onClick={() => void train()}>{t.confirm}</PmButton>
    </>}>
      <div className="pmw-voice__form">
        <PmField label={t.voice}><span>{name}</span></PmField>
        <PmField label={t.speaker}><span>{speaker.trim()}</span></PmField>
        <PmField label={t.scope}><span>{scope.trim()}</span></PmField>
        <PmNotice tone="warn">{t.costs(engine.provider, volcengine)}</PmNotice>
      </div>
    </PmDialog>
  </>
}
