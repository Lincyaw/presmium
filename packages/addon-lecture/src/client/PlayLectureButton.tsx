import { PmIconButton, useMessages, useStore } from '@lincyaw/host'
import { LECTURE_MESSAGES } from '../domain/index.ts'
import { playing, useLecturesAvailable, useViewer } from './state.ts'
export default function PlayLectureButton() {
  const t = useMessages(LECTURE_MESSAGES)
  const viewer = useViewer()
  const available = useLecturesAvailable()
  const track = useStore(playing)
  return available && !track ? (
    <PmIconButton
      icon="play"
      label={t.player.play}
      hint={t.player.play}
      small
      onClick={() => viewer.setView('lecture')}
    />
  ) : null
}
