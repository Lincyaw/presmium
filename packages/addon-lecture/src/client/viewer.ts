import type { ViewerPlugin } from '@lincyaw/viewer'
import { currentLocale } from '@lincyaw/host'
import { LECTURE_MESSAGES } from '../domain/index.ts'
import LectureView from './LectureView.vue'
import PlayerPanel from './PlayerPanel.vue'
import RecorderPanel from './RecorderPanel.vue'
import { exporting, lecturesAvailable, setViewerContext, watchLectureList } from './state.ts'

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
    get hidden() {
      return !lecturesAvailable.value
    },
  })
  ctx.registerLayer({ id: 'presmium.lecture.player', component: PlayerPanel, views: ['present'], scope: 'viewport' })
  ctx.registerLayer({ id: 'presmium.lecture.recorder', component: RecorderPanel, views: ['present'], scope: 'view' })
}

export default plugin
