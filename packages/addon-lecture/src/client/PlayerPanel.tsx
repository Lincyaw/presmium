import { PmIcon, PmTabs, TIMED_CAPTIONS, useMessages, useServer, useService, useStore } from '@lincyaw/host'
import { isPreviewEmbedded } from '@lincyaw/kernel'
import { useEffect, useState } from 'react'
import {
  captionLanguages,
  captionText,
  clockText,
  isStale,
  LECTURE_ID,
  LECTURE_MESSAGES,
  SCRIPT_TRACK,
  trackChapters,
  utteranceAt,
} from '../domain/index.ts'
import type { Utterance } from '../domain/index.ts'
import ChapterList from './ChapterList.tsx'
import { useLecturePlayback } from './playback.ts'
import { lectureSource } from './source.ts'
import {
  burnedCaptions,
  exporting,
  play,
  playing,
  useLecturesAvailable,
  useViewer,
} from './state.ts'
import TranscriptList from './TranscriptList.tsx'
import './PlayerPanel.css'
const cls = 'pm-lecture-button pm-ui-button pm-ui-button--small'
const RATES = [0.5, 0.75, 1, 1.25, 1.5, 2]
export default function PlayerPanel(_props: { view?: string }) {
  const t = useMessages(LECTURE_MESSAGES),
    viewer = useViewer(),
    server = useServer()
  const available = useLecturesAvailable(),
    id = useStore(playing),
    doc = useStore(viewer.doc)
  const { player, status, failure, language, setLanguage } =
    useLecturePlayback()
  const timedCaptions = useService(TIMED_CAPTIONS)
  useEffect(() => player && status === 'ready' ? timedCaptions?.claim() : undefined, [player, status, timedCaptions])
  const time = useStore(player?.time, 0),
    trying = useStore(player?.trying, false),
    clockPlaying = useStore(player?.clock.playing, false),
    rate = useStore(player?.clock.rate, 1)
  const [captions, setCaptions] = useState(false),
    [panel, setPanel] = useState<'transcript' | 'chapters'>()
  useEffect(() => {
    let active = true
    if (
      playing.getSnapshot() ||
      exporting ||
      (!server.available && (isPreviewEmbedded() || !available))
    )
      return
    void lectureSource(server, doc.config.presmium[LECTURE_ID])
      .list()
      .then((tracks) => {
        if (active && !playing.getSnapshot() && tracks.some(track => track.id === SCRIPT_TRACK))
          play(SCRIPT_TRACK)
      })
      .catch((error) =>
        console.warn(
          '[presmium] the presentation could not list its lectures',
          error,
        ),
      )
    return () => {
      active = false
    }
  }, [server.available, available, doc])
  const state = !player
    ? undefined
    : trying
      ? 'trying'
      : clockPlaying
        ? 'playing'
        : 'paused'
  const titles = new Map(
    doc.sections.map((section) => [section.id, section.title]),
  )
  const chapters = player
    ? trackChapters(player.events, (key) => titles.get(key))
    : []
  const chapter = chapters.filter((item) => item.t <= time).at(-1)
  const languages = player ? captionLanguages(player.track) : []
  const current = player ? utteranceAt(player.track, time) : undefined
  const voice = player?.track.voice
  const unsaid = player?.track.utterances.filter((u) => u.unsaid) ?? []
  const synthetic =
    voice?.kind === 'synthetic' && voice.provider
      ? t.player.syntheticBy(voice.provider)
      : t.player.synthetic
  const lang = burnedCaptions ?? language
  const text = (u: Utterance) =>
    lang && lang !== player?.track.lang
      ? (u.translations?.[lang]?.text ?? u.text)
      : u.text
  const burned =
    burnedCaptions && current && player
      ? captionText(player.track, current, burnedCaptions)
      : undefined
  const stale = new Set(
    player && lang && lang !== player.track.lang
      ? player.track.utterances.filter((u) => isStale(u, lang)).map((u) => u.id)
      : [],
  )
  if (!id) return null
  return (
    <div className="pm-lecture-layer">
      {status === 'loading' ? (
        <p className="pm-lecture-player__status">{t.player.loading}</p>
      ) : failure ? (
        <p className="pm-lecture-player__status" role="alert">
          {t.player.failed(failure)}
          <button type="button" className={cls} onClick={() => play(undefined)}>
            {t.player.close}
          </button>
        </p>
      ) : status === 'missing' ? (
        <p className="pm-lecture-player__status" role="alert">
          {t.player.missing(id)}
          <button type="button" className={cls} onClick={() => play(undefined)}>
            {t.player.close}
          </button>
        </p>
      ) : player && exporting ? (
        <>
          <div
            className="pm-lecture-export"
            data-time={Math.round(time)}
            data-clip={current?.clip}
          >
            {voice?.kind === 'synthetic' && (
              <span className="pm-lecture-player__ai pm-ui-badge pm-ui-badge--accent pm-ui-badge--pill">
                {synthetic}
              </span>
            )}
          </div>
          {burned && (
            <p className="pm-lecture-caption" lang={burnedCaptions}>
              {burned}
            </p>
          )}
        </>
      ) : player ? (
        <>
          {panel && (
            <aside
              className="pm-lecture-side"
              aria-label={
                panel === 'transcript' ? t.player.transcript : t.player.chapters
              }
            >
              <PmTabs
                value={panel}
                onValueChange={(value) =>
                  setPanel(value as 'transcript' | 'chapters')
                }
                tabs={[
                  { value: 'transcript', label: t.player.transcript },
                  { value: 'chapters', label: t.player.chapters },
                ]}
                label={t.player.sideTabs}
              />
              {panel === 'transcript' ? (
                <TranscriptList
                  track={player.track}
                  language={lang}
                  current={current?.id}
                  stale={stale}
                  onSeek={(at) => player.seek(at)}
                />
              ) : (
                <ChapterList
                  chapters={chapters}
                  events={player.events}
                  time={time}
                  onSeek={(at) => player.seek(at)}
                />
              )}
            </aside>
          )}
          <div className="pm-lecture-dock">
            {(captions || current?.unsaid) && current && (
              <p
                className="pm-lecture-caption"
                lang={lang}
                aria-live="polite"
                data-stale={stale.has(current.id) ? 'true' : undefined}
              >
                {text(current)}
                {stale.has(current.id) && (
                  <span
                    className="pm-lecture-stale"
                    role="img"
                    title={t.player.stale}
                    aria-label={t.player.stale}
                  >
                    <PmIcon name="warning" />
                  </span>
                )}
              </p>
            )}
            <div
              className="pm-lecture-player"
              role="region"
              aria-label={t.player.region}
              data-state={state}
              data-time={Math.round(time)}
              data-clip={current?.clip}
            >
              {player.dropped > 0 && (
                <p className="pm-lecture-player__notice">
                  {t.player.dropped(player.dropped)}
                </p>
              )}
              {unsaid.length > 0 && (
                <p
                  className="pm-lecture-player__notice"
                  data-unsaid
                  title={unsaid[0]!.unsaid}
                >
                  {t.player.unsaid(unsaid.length)}
                </p>
              )}
              {trying && (
                <p className="pm-lecture-player__notice">{t.player.trying}</p>
              )}
              <div className="pm-lecture-player__row">
                <button
                  type="button"
                  className={`${cls} pm-lecture-player__play`}
                  onClick={() =>
                    player.playing ? player.pause() : player.play()
                  }
                >
                  {state === 'playing' ? t.player.pause : t.player.play}
                </button>
                <span className="pm-lecture-player__time">
                  {t.player.time(clockText(time), clockText(player.duration))}
                </span>
                <input
                  className="pm-lecture-player__seek pm-ui-checkbox"
                  type="range"
                  min="0"
                  max={player.duration}
                  step="100"
                  value={Math.round(time)}
                  aria-label={t.player.seek}
                  onChange={(event) => player.seek(Number(event.target.value))}
                />
                {chapter && (
                  <span className="pm-lecture-player__chapter">
                    {chapter.title}
                  </span>
                )}
                <label className="pm-lecture-player__field">
                  {t.player.rate}
                  <select
                    className="pm-ui-select"
                    value={rate}
                    onChange={(event) =>
                      player.setRate(Number(event.target.value))
                    }
                  >
                    {RATES.map((value) => (
                      <option key={value} value={value}>
                        {value}×
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  type="button"
                  className={cls}
                  aria-pressed={captions}
                  onClick={() => setCaptions((value) => !value)}
                >
                  {t.player.captions}
                </button>
                {languages.length > 1 && (
                  <label className="pm-lecture-player__field">
                    {t.player.language}
                    <select
                      value={lang}
                      className="pm-ui-select"
                      onChange={(e) => setLanguage(e.target.value)}
                    >
                      {languages.map((value) => (
                        <option key={value} value={value}>
                          {value}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                <button
                  type="button"
                  className={cls}
                  aria-pressed={panel === 'transcript'}
                  onClick={() =>
                    setPanel((value) =>
                      value === 'transcript' ? undefined : 'transcript',
                    )
                  }
                >
                  {t.player.transcript}
                </button>
                <button
                  type="button"
                  className={cls}
                  aria-pressed={panel === 'chapters'}
                  onClick={() =>
                    setPanel((value) =>
                      value === 'chapters' ? undefined : 'chapters',
                    )
                  }
                >
                  {t.player.chapters}
                </button>
                {trying ? (
                  <button
                    type="button"
                    className={`${cls} pm-lecture-player__back`}
                    onClick={() => player.back()}
                  >
                    {t.player.back}
                  </button>
                ) : (
                  <button
                    type="button"
                    className={`${cls} pm-lecture-player__try`}
                    onClick={() => player.tryIt()}
                  >
                    {t.player.tryIt}
                  </button>
                )}
                {voice?.kind === 'synthetic' && (
                  <span className="pm-lecture-player__ai pm-ui-badge pm-ui-badge--accent pm-ui-badge--pill">
                    {synthetic}
                  </span>
                )}
                <button
                  type="button"
                  className={cls}
                  aria-label={t.player.close}
                  onClick={() => play(undefined)}
                >
                  <PmIcon name="close" />
                </button>
              </div>
            </div>
          </div>
        </>
      ) : null}
    </div>
  )
}
