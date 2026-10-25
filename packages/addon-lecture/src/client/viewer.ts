import type { ViewerPlugin } from '@lincyaw/viewer'
import { currentLocale } from '@lincyaw/host'
import { LECTURE_MESSAGES } from '../domain/index.ts'
import LectureView from './LectureView.tsx'
import PlayerPanel from './PlayerPanel.tsx'
import PlayLectureButton from './PlayLectureButton.tsx'
import RecorderPanel from './RecorderPanel.tsx'
import { exporting, setViewerContext, watchLectureList } from './state.ts'

const plugin: ViewerPlugin = (ctx) => {
  setViewerContext(ctx)
  watchLectureList()
  if (exporting) document.documentElement.classList.add('pm-lecture-exporting')
  ctx.registerView({
    id: 'lecture',
    get label() {
      return LECTURE_MESSAGES[currentLocale()].view
    },
    kind: 'overlay',
    component: LectureView,
    // Kept for lecture links and choosing a recorded track; playback is part of the presentation's controls.
    hidden: true,
  })
  ctx.registerLayer({ id: 'presmium.lecture.player', component: PlayerPanel, views: ['present'], scope: 'view' })
  ctx.registerLayer({ id: 'presmium.lecture.play', component: PlayLectureButton, views: ['present'], scope: 'bar' })
  ctx.registerLayer({ id: 'presmium.lecture.recorder', component: RecorderPanel, views: ['present'], scope: 'view' })
}

export default plugin
