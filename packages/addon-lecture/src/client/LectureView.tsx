import { useMessages, useServer, useStore } from '@lincyaw/host'
import { isPreviewEmbedded } from '@lincyaw/kernel'
import { useEffect, useState } from 'react'
import {
  clockText,
  defaultTrack,
  LECTURE_ID,
  LECTURE_MESSAGES,
} from '../domain/index.ts'
import type { LectureSummary } from './source.ts'
import { lectureSource } from './source.ts'
import { play, playing, useViewer } from './state.ts'
import './LectureView.css'
export default function LectureView() {
  const t = useMessages(LECTURE_MESSAGES),
    viewer = useViewer(),
    server = useServer()
  const current = useStore(playing),
    doc = useStore(viewer.doc)
  const [lectures, setLectures] = useState<LectureSummary[]>(),
    [failed, setFailed] = useState(false)
  function open(id: string) {
    play(id)
    viewer.setView('present')
  }
  useEffect(() => {
    let active = true
    if (playing.getSnapshot()) {
      viewer.setView('present')
      return
    }
    void lectureSource(server, doc.config.presmium[LECTURE_ID])
      .list()
      .then((list) => {
        if (!active) return
        setLectures(list)
        const shown = isPreviewEmbedded()
          ? defaultTrack(list.map((item) => item.id))
          : undefined
        if (shown) open(shown)
      })
      .catch(() => {
        if (active) setFailed(true)
      })
    return () => {
      active = false
    }
  }, [server.available, doc])
  return current ? null : (
    <div className="pm-lecture-view" role="dialog" aria-label={t.list.title}>
      <h1>{t.list.title}</h1>
      {failed ? (
        <p>{t.list.unavailable}</p>
      ) : lectures?.length === 0 ? (
        <p>{t.list.empty}</p>
      ) : (
        lectures && (
          <ul className="pm-lecture-view__list">
            {lectures.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  className="pm-lecture-button pm-ui-button pm-ui-button--small"
                  aria-label={t.list.open(item.id)}
                  onClick={() => open(item.id)}
                >
                  {item.id}
                  {item.duration ? ` · ${clockText(item.duration)}` : ''}
                </button>
              </li>
            ))}
          </ul>
        )
      )}
      <button
        type="button"
        className="pm-lecture-button pm-ui-button pm-ui-button--small"
        onClick={() => viewer.setView(viewer.pageView.getSnapshot())}
      >
        {t.player.close}
      </button>
    </div>
  )
}
