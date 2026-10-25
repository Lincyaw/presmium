import { useMessages } from '@lincyaw/host'
import { useEffect, useState } from 'react'
import { LECTURE_MESSAGES } from '../domain/index.ts'
import type { LectureTrack } from '../domain/index.ts'
import type { LectureEditing, SpeechChoices } from './source.ts'
import './TrackEditor.css'
const cls = 'pm-lecture-button pm-ui-button pm-ui-button--small'
export default function TrackEditor({
  track,
  editing,
  onChanged,
}: {
  track: LectureTrack
  editing: LectureEditing
  onChanged(track: LectureTrack): void
}) {
  const t = useMessages(LECTURE_MESSAGES)
  const [choices, setChoices] = useState<SpeechChoices>(),
    [voice, setVoice] = useState(''),
    [asking, setAsking] = useState<'transcribe' | 'synthesize'>(),
    [status, setStatus] = useState<string>(),
    [failure, setFailure] = useState<string>(),
    [busy, setBusy] = useState(false)
  useEffect(() => {
    let active = true
    void editing
      .speech()
      .then((result) => {
        if (active) {
          setChoices(result)
          setVoice(
            result.synthesize?.voices.find((v) => !v.cloned)?.id ??
              result.synthesize?.voices[0]?.id ??
              '',
          )
        }
      })
      .catch((error) => {
        if (active) setFailure(t.editor.failed(String(error)))
      })
    return () => {
      active = false
    }
  }, [editing])
  const provider = (
    choice: { provider: string; local: boolean } | undefined,
  ) =>
    choice
      ? choice.local
        ? `${choice.provider}（${t.editor.local}）`
        : choice.provider
      : ''
  const voiceLabel =
    choices?.synthesize?.voices.find((v) => v.id === voice)?.label ?? voice
  const question =
    asking === 'transcribe'
      ? t.editor.transcribeConfirm(
          track.id,
          provider(choices?.transcribe),
          choices?.transcribe?.local === true,
        )
      : asking === 'synthesize'
        ? t.editor.synthesizeConfirm(
            provider(choices?.synthesize),
            voiceLabel,
            track.utterances.length,
            choices?.synthesize?.local === true,
          )
        : ''
  const confirm = async () => {
    const action = asking
    setAsking(undefined)
    if (!action || busy) return
    setBusy(true)
    setFailure(undefined)
    setStatus(
      action === 'transcribe' ? t.editor.transcribing : t.editor.synthesizing,
    )
    try {
      const changed =
        action === 'transcribe'
          ? await editing.transcribe(track.id)
          : await editing.synthesize(
              track.id,
              voice,
              choices?.synthesize?.engine,
            )
      setStatus(
        action === 'transcribe'
          ? t.editor.transcribed(changed.utterances.length)
          : t.editor.synthesized,
      )
      onChanged(changed)
    } catch (error) {
      setStatus(undefined)
      setFailure(
        t.editor.failed(error instanceof Error ? error.message : String(error)),
      )
    } finally {
      setBusy(false)
    }
  }
  return (
    <div
      className="pm-lecture-editor"
      role="group"
      aria-label={t.editor.region}
    >
      <div className="pm-lecture-editor__row">
        {choices?.transcribe && !!track.audio?.length && (
          <button
            type="button"
            className={`${cls} pm-lecture-editor__transcribe`}
            disabled={busy}
            onClick={() => setAsking('transcribe')}
          >
            {t.editor.transcribe(choices.transcribe.provider)}
          </button>
        )}
        {choices?.synthesize && !!track.utterances.length && (
          <>
            <label className="pm-lecture-player__field">
              {t.editor.voice}
              <select
                value={voice}
                className="pm-ui-select"
                disabled={busy}
                onChange={(e) => setVoice(e.target.value)}
              >
                {choices.synthesize.voices.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.label}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              className={`${cls} pm-lecture-editor__synthesize`}
              disabled={busy || !voice}
              onClick={() => setAsking('synthesize')}
            >
              {t.editor.synthesize(choices.synthesize.provider)}
            </button>
          </>
        )}
      </div>
      {asking && (
        <div
          className="pm-lecture-editor__confirm"
          role="alertdialog"
          aria-label={question}
        >
          <p>{question}</p>
          <button type="button" className={cls} onClick={() => void confirm()}>
            {t.editor.confirm}
          </button>
          <button
            type="button"
            className={cls}
            onClick={() => setAsking(undefined)}
          >
            {t.editor.cancel}
          </button>
        </div>
      )}
      {status && (
        <p className="pm-lecture-editor__status" role="status">
          {status}
        </p>
      )}
      {failure && (
        <p className="pm-lecture-editor__status" role="alert">
          {failure}
        </p>
      )}
    </div>
  )
}
