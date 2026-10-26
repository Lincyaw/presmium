import { PmIcon, useMessages } from '@lincyaw/host'
import { clockText, LECTURE_MESSAGES, textPieces } from '../domain/index.ts'
import type { LectureTrack, Utterance } from '../domain/index.ts'

/** Published captions are a playback view. Authoring belongs to the document transaction API. */
export default function TranscriptList({ track, language, current, stale, onSeek }: {
  track: LectureTrack
  language?: string
  current?: string
  stale: ReadonlySet<string>
  onSeek(t: number): void
}) {
  const t = useMessages(LECTURE_MESSAGES)
  const text = (utterance: Utterance) => language && language !== track.lang ? utterance.translations?.[language]?.text ?? utterance.text : utterance.text
  return (
    <ol className="pm-lecture-transcript" lang={language}>
      {track.utterances.map(utterance => (
        <li key={utterance.id} className="pm-lecture-transcript__item" data-utterance={utterance.id} data-stale={stale.has(utterance.id) ? 'true' : undefined} aria-current={current === utterance.id ? 'true' : undefined}>
          <button type="button" className="pm-lecture-transcript__time" aria-label={t.player.jump(clockText(utterance.t))} onClick={() => onSeek(utterance.t)}>{clockText(utterance.t)}</button>
          <span className="pm-lecture-transcript__text" onClick={() => onSeek(utterance.t)}>
            {language === track.lang ? textPieces(utterance)?.map((piece, index) => piece.t !== undefined ? <span key={index} className="pm-lecture-word" onClick={event => { event.stopPropagation(); onSeek(piece.t!) }}>{piece.text}</span> : piece.text) ?? text(utterance) : text(utterance)}
          </span>
          {stale.has(utterance.id) && <span className="pm-lecture-stale" role="img" title={t.player.stale} aria-label={t.player.stale}><PmIcon name="warning" /></span>}
        </li>
      ))}
    </ol>
  )
}
