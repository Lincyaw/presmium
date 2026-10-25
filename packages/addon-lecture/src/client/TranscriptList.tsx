import { PmIcon, useMessages } from '@lincyaw/host'
import { useEffect, useState } from 'react'
import { clockText, LECTURE_MESSAGES, textPieces } from '../domain/index.ts'
import type { LectureTrack, Utterance } from '../domain/index.ts'
import type { EngineChoice, LectureEditing } from './source.ts'
import TrackEditor from './TrackEditor.tsx'
const cls = 'pm-lecture-button pm-ui-button pm-ui-button--small'
export default function TranscriptList({
  track,
  editing,
  language,
  current,
  stale,
  onSeek,
  onChanged,
}: {
  track: LectureTrack
  editing?: LectureEditing
  language?: string
  current?: string
  stale: ReadonlySet<string>
  onSeek(t: number): void
  onChanged(track: LectureTrack): void
}) {
  const t = useMessages(LECTURE_MESSAGES)
  const [editingUtterance, setEditingUtterance] = useState<string>(),
    [draft, setDraft] = useState(''),
    [saving, setSaving] = useState(false),
    [failure, setFailure] = useState<string>(),
    [confirming, setConfirming] = useState(false),
    [choice, setChoice] = useState<EngineChoice>()
  const engine =
    track.voice.kind === 'synthetic' ? track.voice.engine : undefined
  useEffect(() => {
    let active = true
    setChoice(undefined)
    if (engine && editing)
      void editing
        .speech(engine)
        .then((result) => {
          if (active) setChoice(result.synthesize)
        })
        .catch(() => {})
    return () => {
      active = false
    }
  }, [engine, editing])
  const provider =
    track.voice.kind === 'synthetic'
      ? choice?.provider || track.voice.provider || track.voice.engine
      : undefined
  const text = (u: Utterance) =>
    language && language !== track.lang
      ? (u.translations?.[language]?.text ?? u.text)
      : u.text
  async function save() {
    setConfirming(false)
    if (!editingUtterance || !editing || saving) return
    setSaving(true)
    try {
      onChanged(await editing.editUtterance(track.id, editingUtterance, draft))
      setEditingUtterance(undefined)
    } catch (error) {
      setFailure(t.editor.failed(String(error)))
    } finally {
      setSaving(false)
    }
  }
  return (
    <>
      {editing && (
        <TrackEditor
          key={track.id}
          track={track}
          editing={editing}
          onChanged={onChanged}
        />
      )}
      <ol className="pm-lecture-transcript" lang={language}>
        {track.utterances.map((u) => (
          <li
            key={u.id}
            className="pm-lecture-transcript__item"
            data-utterance={u.id}
            data-stale={stale.has(u.id) ? 'true' : undefined}
            aria-current={current === u.id ? 'true' : undefined}
          >
            <button
              type="button"
              className="pm-lecture-transcript__time"
              aria-label={t.player.jump(clockText(u.t))}
              onClick={() => onSeek(u.t)}
            >
              {clockText(u.t)}
            </button>
            {editingUtterance === u.id ? (
              <form
                className="pm-lecture-transcript__edit"
                onSubmit={(e) => {
                  e.preventDefault()
                  if (provider) setConfirming(true)
                  else void save()
                }}
              >
                <input
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  className="pm-ui-input"
                  type="text"
                  aria-label={t.editor.edit(u.id)}
                  disabled={saving}
                />
                <button
                  type="submit"
                  className={cls}
                  disabled={saving || confirming}
                >
                  {saving
                    ? t.editor.saving
                    : provider
                      ? t.editor.saveSay(provider)
                      : t.editor.save}
                </button>
                <button
                  type="button"
                  className={cls}
                  disabled={saving}
                  onClick={() => setEditingUtterance(undefined)}
                >
                  {t.editor.cancel}
                </button>
                {confirming && provider && (
                  <div
                    className="pm-lecture-editor__confirm"
                    role="alertdialog"
                    aria-label={t.editor.saveSayConfirm(
                      provider,
                      choice?.local === true,
                    )}
                  >
                    <p>
                      {t.editor.saveSayConfirm(
                        provider,
                        choice?.local === true,
                      )}
                    </p>
                    <button
                      type="button"
                      className={cls}
                      onClick={() => void save()}
                    >
                      {t.editor.confirm}
                    </button>
                    <button
                      type="button"
                      className={cls}
                      onClick={() => setConfirming(false)}
                    >
                      {t.editor.cancel}
                    </button>
                  </div>
                )}
                {failure && <span role="alert">{failure}</span>}
              </form>
            ) : (
              <>
                <span
                  className="pm-lecture-transcript__text"
                  onClick={() => onSeek(u.t)}
                >
                  {language === track.lang
                    ? (textPieces(u)?.map((piece, i) =>
                        piece.t !== undefined ? (
                          <span
                            key={i}
                            className="pm-lecture-word"
                            onClick={(e) => {
                              e.stopPropagation()
                              onSeek(piece.t!)
                            }}
                          >
                            {piece.text}
                          </span>
                        ) : (
                          piece.text
                        ),
                      ) ?? text(u))
                    : text(u)}
                </span>
                {stale.has(u.id) && (
                  <span
                    className="pm-lecture-stale"
                    role="img"
                    title={t.player.stale}
                    aria-label={t.player.stale}
                  >
                    <PmIcon name="warning" />
                  </span>
                )}
                {editing && language === track.lang && (
                  <button
                    type="button"
                    className="pm-lecture-transcript__edit-button"
                    aria-label={t.editor.edit(u.id)}
                    onClick={() => {
                      setEditingUtterance(u.id)
                      setDraft(u.text)
                      setFailure(undefined)
                      setConfirming(false)
                    }}
                  >
                    <PmIcon name="edit" />
                  </button>
                )}
              </>
            )}
          </li>
        ))}
      </ol>
    </>
  )
}
