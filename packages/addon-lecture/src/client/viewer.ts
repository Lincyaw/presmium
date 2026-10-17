/**
 * The lecture plugin in the web form's IR runtime (docs/ir.md 8.2): the view
 * `lecture`, which plays a lecture (`?view=lecture&track=<id>`) on the
 * present view, in the view menu when the deck has lectures (`offered`), and
 * two layers over the present view: the player, and the recorder (under
 * `presmium dev` and `presmium serve`). For `presmium-lecture export` the
 * present view's own controls are hidden (`exporting`).
 */
import type { ViewerPlugin } from '@presmium/viewer'
import { currentLocale } from '@presmium/host'
import { LECTURE_MESSAGES } from '../domain/index.ts'
import LectureView from './LectureView.vue'
import PlayerPanel from './PlayerPanel.vue'
import RecorderPanel from './RecorderPanel.vue'
import { exporting, followLectures, offered, setViewerContext } from './state.ts'

const plugin: ViewerPlugin = (ctx) => {
  setViewerContext(ctx)
  followLectures()
  if (exporting) document.documentElement.classList.add('pm-lecture-exporting')
  ctx.registerView({
    id: 'lecture',
    get label() {
      return LECTURE_MESSAGES[currentLocale()].view
    },
    kind: 'overlay',
    component: LectureView,
    get hidden() {
      return !offered.value
    },
  })
  ctx.registerLayer({ id: 'presmium.lecture.player', component: PlayerPanel, views: ['present'] })
  ctx.registerLayer({ id: 'presmium.lecture.recorder', component: RecorderPanel, views: ['present'] })
}

export default plugin
