import { PmIconButton, PRODUCTION_PLAYBACK, useMessages, useService, useStore } from '@lincyaw/host'
import { LECTURE_MESSAGES } from '../domain/index.ts'
import { playing, useLecturesAvailable, useViewer } from './state.ts'
import { ProductionPlaybackController } from './production-playback.ts'
export default function PlayLectureButton() {
  const t = useMessages(LECTURE_MESSAGES)
  const viewer = useViewer()
  const available = useLecturesAvailable()
  const track = useStore(playing)
  const production = useService(PRODUCTION_PLAYBACK)
  const controlled = useStore(production instanceof ProductionPlaybackController ? production.engaged : undefined, false)
  return available && !track && !controlled ? (
    <PmIconButton
      icon="play"
      label={t.player.play}
      hint={t.player.play}
      small
      onClick={() => viewer.setView('lecture')}
    />
  ) : null
}
