import { PmCaption, PmDrawer, PmIconButton, PmMenu, PmTabs, PRODUCTION_PLAYBACK, TIMED_CAPTIONS, useMessages, useServer, useService, useStore } from '@lincyaw/host'
import type { MenuItem } from '@lincyaw/host'
import { isPreviewEmbedded, notifyEmbedder } from '@lincyaw/kernel'
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import {
  captionChunkAt,
  captionLanguages,
  captionGroups,
  captionGroupAt,
  captionText,
  clockText,
  isStale,
  LECTURE_ID,
  LECTURE_MESSAGES,
  SCRIPT_TRACK,
  trackChapters,
  utteranceAt,
} from '../domain/index.ts'
import type { CaptionGroup, Utterance } from '../domain/index.ts'
import ChapterList from './ChapterList.tsx'
import { useLecturePlayback } from './playback.ts'
import { lectureSource } from './source.ts'
import { PLAYBACK_RATES, ProductionPlaybackController } from './production-playback.ts'
import {
  autoplay,
  burnedCaptions,
  exporting,
  keyboardPlayer,
  play,
  playing,
  useLecturesAvailable,
  useViewer,
} from './state.ts'
import TranscriptList from './TranscriptList.tsx'
import './PlayerPanel.css'
/** `&autoplay` starts the first lecture that becomes ready on this page, once. */
let autoplayPending = autoplay
/** A burned caption takes at most this many lines; a longer one is shown in pieces across its time. */
const BURNED_LINES = 2
/** Line breaks fall between words and before punctuation, so a line holds a little less than its width. */
const BURNED_FILL = 0.9

/** The caption an export burns into the picture: never more than two lines, its room read from its own styles. */
function BurnedCaption({ caption, time, lang }: { caption: { text: string, t: number, d: number }, time: number, lang: string }) {
  const element = useRef<HTMLParagraphElement>(null)
  const [budget, setBudget] = useState<number>()
  // The frame and the document's caption size set the font and the width; the budget is how many em two lines hold.
  useLayoutEffect(() => {
    const style = element.current && getComputedStyle(element.current)
    if (!style) return
    const size = parseFloat(style.fontSize), room = parseFloat(style.maxWidth) - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight)
    if (size > 0 && room > 0) setBudget(BURNED_LINES * room / size * BURNED_FILL)
  })
  return <p ref={element} className="pm-lecture-caption" lang={lang}>{budget ? captionChunkAt(caption, time, budget) : caption.text}</p>
}

export default function PlayerPanel(_props: { view?: string }) {
  const t = useMessages(LECTURE_MESSAGES),
    viewer = useViewer(),
    server = useServer()
  const available = useLecturesAvailable(),
    id = useStore(playing),
    doc = useStore(viewer.doc),
    position = useStore(viewer.position)
  const { player, status, failure, language, setLanguage } =
    useLecturePlayback()
  const timedCaptions = useService(TIMED_CAPTIONS)
  const production = useService(PRODUCTION_PLAYBACK)
  const controlled = useStore(production instanceof ProductionPlaybackController ? production.engaged : undefined, false)
  // The lecture times the captions from the moment it is asked for: while it loads, the slides show none of their own.
  useEffect(() => id && !failure && status !== 'missing' ? timedCaptions?.claim() : undefined, [id, failure, status, timedCaptions])
  useEffect(() => {
    if (!player || status !== 'ready' || failure || controlled || exporting) return
    keyboardPlayer.set(player)
    if (autoplayPending) {
      autoplayPending = false
      void player.play()
    }
    return () => { if (keyboardPlayer.getSnapshot() === player) keyboardPlayer.set(undefined) }
  }, [player, status, failure, controlled])
  // The browser would not start the sound without the reader: a large Play waits for their click.
  const blocked = useStore(player?.clock.blocked, false)
  const time = useStore(player?.time, 0),
    clockPlaying = useStore(player?.clock.playing, false),
    rate = useStore(player?.clock.rate, 1)
  // The page that embeds this one learns the lecture's state: it keeps its cover while loading, offers Play when waiting.
  useEffect(() => {
    if (!id) return
    notifyEmbedder({ lecture: failure || status === 'missing' ? 'failed' : blocked ? 'waiting' : !player ? 'loading' : clockPlaying ? 'playing' : 'paused' })
  }, [id, failure, status, blocked, player, clockPlaying])
  const groupedCaptions = useMemo(() => new Map(player?.track.utterances.map(utterance => [utterance.id, captionGroups(utterance)])), [player?.track])
  const cursor = useStore(player?.cursor), positionMode = useStore(player?.positionMode, 'time')
  const [compact, setCompact] = useState(() => matchMedia('(max-width: 479px)').matches)
  useEffect(() => {
    const media = matchMedia('(max-width: 479px)')
    const changed = () => setCompact(media.matches)
    media.addEventListener('change', changed)
    return () => media.removeEventListener('change', changed)
  }, [])
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
        if (active && !playing.getSnapshot() && !(production instanceof ProductionPlaybackController && production.engaged.getSnapshot()) && tracks.some(track => track.id === SCRIPT_TRACK))
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
  }, [server.available, available, doc, production])
  const state = !player
    ? undefined
    : clockPlaying
      ? 'playing'
      : 'paused'
  const titles = new Map(
    doc.sections.map((section) => [section.id, section.title]),
  )
  const chapters = player
    ? trackChapters(player.events, (key) => titles.get(key))
    : []
  const languages = player ? captionLanguages(player.track) : []
  const timed = player ? utteranceAt(player.track, time) : undefined
  const boundary = player && cursor ? player.events.findIndex(event => event.type === 'go' && event.data.section === cursor.sectionId && Number(event.data.step ?? 0) === cursor.step) : -1
  const start = player?.events[boundary]?.t, end = player?.events.slice(boundary + 1).find(event => event.type === 'go')?.t ?? player?.duration
  // A positive utterance may continue through a cue into another step. Preserve that real timing.
  const continuing = timed && cursor && timed.d > 0 && timed.section === cursor.sectionId && (timed.step ?? 0) <= cursor.step
  const selectedZero = player && cursor && positionMode === 'step' && !clockPlaying && boundary >= 0 && start === end && time === start && !continuing
  const selectedCaptions = selectedZero ? player.track.utterances.filter(utterance => utterance.section === cursor.sectionId && (utterance.step ?? 0) === cursor.step && utterance.d === 0 && utterance.t === time) : undefined
  const current = selectedZero ? selectedCaptions?.[0] : timed
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
      : captionGroupAt(groupedCaptions.get(u.id) ?? [], time)?.text ?? u.text
  const manual = player?.track.captionOverrides?.find(own => own.startMs <= time && time < own.endMs), manualText = manual && captionGroupAt(manual.groups, time)?.text
  const originalLanguage = !lang || lang === player?.track.lang
  const caption = manual && originalLanguage ? manualText : selectedCaptions ? selectedCaptions.map(text).join(' ') : current ? text(current) : undefined
  // What the export burns in, with the time it spans: a caption group (word-aligned or manual), else the whole sentence.
  const span = (group: CaptionGroup | undefined) => group && { text: group.text, t: group.t, d: group.d }
  const burned =
    burnedCaptions && player && (current || manual)
      ? burnedCaptions === player.track.lang
        ? manual ? span(captionGroupAt(manual.groups, time)) : current && (span(captionGroupAt(groupedCaptions.get(current.id) ?? [], time)) ?? { text: current.text, t: current.t, d: current.d })
        : current && { text: captionText(player.track, current, burnedCaptions) ?? '', t: current.t, d: current.d }
      : undefined
  const stale = new Set(
    player && lang && lang !== player.track.lang
      ? player.track.utterances.filter((u) => isStale(u, lang)).map((u) => u.id)
      : [],
  )
  // A step the synthesized lecture leaves out has no sentence of its own: its preview shows no other step's caption.
  const leftOut = player?.track.id === SCRIPT_TRACK && !player.events.some(event => event.type === 'go' && event.data.section === position.section && Number(event.data.step ?? 0) === position.step)
  if (controlled) return player && (current || manual) && caption && !leftOut ? <PmCaption overlay label={t.player.captions} lines={[caption]} lang={lang} /> : null
  if (!id) return null
  if (exporting) return player ? <div className="pm-lecture-layer">
    <div className="pm-lecture-export" data-time={Math.round(time)} data-clip={current?.clip}>
      {voice?.kind === 'synthetic' && <span className="pm-lecture-player__ai pm-ui-badge pm-ui-badge--accent pm-ui-badge--pill">{synthetic}</span>}
    </div>
    {burned?.text && <BurnedCaption caption={burned} time={time} lang={burnedCaptions!} />}
  </div> : null
  const problem = failure ? t.player.failed(failure) : status === 'missing' ? t.player.missing(id) : undefined
  if (!player || problem) return <div className="pm-lecture-player__status" role={problem ? 'alert' : 'status'}>
    <span>{problem ?? t.player.loading}</span>
    {problem && <PmIconButton small icon="close" label={t.player.close} onClick={() => play(undefined)} />}
  </div>
  const options: MenuItem[] = [
    ...(compact ? [{ id: 'previous', label: t.player.previous, icon: 'chevron-left' as const }, { id: 'next', label: t.player.next, icon: 'chevron-right' as const }] : []),
    ...(compact && viewer.options.openPresenter ? [{ id: 'presenter', label: t.player.presenter, icon: 'slides' as const }] : []),
    { id: 'transcript', label: t.player.transcript, icon: 'document', checked: panel === 'transcript' },
    { id: 'chapters', label: t.player.chapters, icon: 'overview', checked: panel === 'chapters' },
    ...PLAYBACK_RATES.map((value, index) => ({ id: `rate:${value}`, label: `${t.player.rate} · ${value}×`, checked: rate === value, separator: index === 0 })),
    ...(languages.length > 1 ? languages.map((value, index) => ({ id: `language:${value}`, label: `${t.player.language} · ${value}`, checked: lang === value, separator: index === 0 })) : []),
    ...(player.dropped ? [{ id: 'dropped', label: t.player.dropped(player.dropped), disabled: true, separator: true }] : []),
    ...(unsaid.length ? [{ id: 'unsaid', label: t.player.unsaid(unsaid.length), disabled: true, separator: true }] : []),
    { id: 'close', label: t.player.close, icon: 'close', separator: true },
  ]
  const selectOption = (option: string) => {
    if (option === 'transcript' || option === 'chapters') setPanel(value => value === option ? undefined : option)
    else if (option === 'previous') viewer.prev()
    else if (option === 'next') viewer.next()
    else if (option === 'presenter') viewer.options.openPresenter?.(viewer.position.getSnapshot())
    else if (option.startsWith('rate:')) player.setRate(Number(option.slice(5)))
    else if (option.startsWith('language:')) setLanguage(option.slice(9))
    else if (option === 'close') play(undefined)
  }
  return <>
    {blocked && <div className="pm-lecture-start"><PmIconButton variant="overlay" icon="play" label={t.player.play} onClick={() => void player.play()} /></div>}
    {(captions || current?.unsaid) && (current || manual) && caption && <PmCaption overlay label={t.player.captions} lines={[caption]} lang={lang}
      data-stale={current && stale.has(current.id) ? 'true' : undefined} hint={current && stale.has(current.id) ? t.player.stale : undefined} />}
    {panel && <PmDrawer open label={panel === 'transcript' ? t.player.transcript : t.player.chapters} onClose={() => setPanel(undefined)}>
      <PmTabs value={panel} onValueChange={value => setPanel(value as 'transcript' | 'chapters')}
        tabs={[{ value: 'transcript', label: t.player.transcript }, { value: 'chapters', label: t.player.chapters }]} label={t.player.sideTabs} />
      {panel === 'transcript' ? <TranscriptList track={player.track} language={lang} current={current?.id} stale={stale} onSeek={at => player.seek(at)} />
        : <ChapterList chapters={chapters} events={player.events} time={time} onSeek={at => player.seek(at)} />}
    </PmDrawer>}
    <div className="pm-lecture-player" role="region" aria-label={t.player.region} data-state={state} data-time={Math.round(time)} data-clip={current?.clip} data-unsaid={unsaid.length || undefined}>
      <PmIconButton small className="pm-lecture-player__play" icon={clockPlaying ? 'pause' : 'play'} label={clockPlaying ? t.player.pause : t.player.play}
        hint={`${clockPlaying ? t.player.pause : t.player.play} · Space`} aria-keyshortcuts="Space"
        onClick={() => player.playing ? player.pause() : void player.play()} />
      <span className="pm-lecture-player__time" title={t.player.time(clockText(time), clockText(player.duration))}>{clockText(time)}<span className="pm-lecture-player__time-total"> / {clockText(player.duration)}</span></span>
      <input className="pm-lecture-player__seek pm-ui-range" style={{ '--pm-range-progress': `${player.duration ? Math.max(0, Math.min(100, time / player.duration * 100)) : 0}%` } as CSSProperties} type="range" min="0" max={player.duration} step="100" value={Math.round(time)}
        aria-label={t.player.seek} aria-valuetext={t.player.time(clockText(time), clockText(player.duration))} onChange={event => player.seek(Number(event.target.value))} />
      <PmIconButton small icon="captions" label={t.player.captions} aria-pressed={captions} onClick={() => setCaptions(value => !value)} />
      <PmMenu label={t.player.more} items={options} placement="above-end" onSelect={selectOption} />
    </div>
  </>
}
