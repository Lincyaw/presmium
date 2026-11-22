import { createStore } from '@lincyaw/host'
import type { IRDocument } from '@lincyaw/kernel'

/** The audience's lecture as the presenter view sees it: whether it plays, and whether its captions show (with a lecture). */
export interface LectureControl {
  playing: boolean
  captions?: boolean
}

/** The windows' channel of the presentation's lecture control (`useAudienceControl`). */
export const lectureControl = (doc: IRDocument) => `presmium.lecture.remote:${doc.meta.title}`

/** The presenter view's way to play or pause the audience's lecture, which Space takes while it has one. */
export const presenterPlay = createStore<{ playPause(): void } | undefined>(undefined)
