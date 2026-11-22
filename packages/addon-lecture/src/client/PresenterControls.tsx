import { PmIconButton, useAudienceRemote, useMessages, useStore } from '@lincyaw/host'
import { useEffect } from 'react'
import { LECTURE_MESSAGES } from '../domain/index.ts'
import { lectureControl, presenterPlay } from './remote.ts'
import type { LectureControl } from './remote.ts'
import { useViewer } from './state.ts'

/** The presenter view's lecture controls: play and pause, and the captions, of the audience's window. */
export default function PresenterControls() {
  const t = useMessages(LECTURE_MESSAGES)
  const doc = useStore(useViewer().doc)
  const [control, send] = useAudienceRemote<LectureControl>(lectureControl(doc))
  const available = control !== undefined
  useEffect(() => {
    if (!available) return
    const own = { playPause: () => send('play-pause') }
    presenterPlay.set(own)
    return () => { if (presenterPlay.getSnapshot() === own) presenterPlay.set(undefined) }
  }, [available, send])
  if (!control) return null
  const label = control.playing ? t.player.pause : t.player.play
  return <>
    <PmIconButton small icon={control.playing ? 'pause' : 'play'} label={label} hint={`${label} · Space`} aria-keyshortcuts="Space" onClick={() => send('play-pause')} />
    {control.captions !== undefined && <PmIconButton small icon="captions" label={t.player.captions} aria-pressed={control.captions} onClick={() => send('captions')} />}
  </>
}
