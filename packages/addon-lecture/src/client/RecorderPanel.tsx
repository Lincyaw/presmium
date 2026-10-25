import {
  blockAt,
  linesText,
  OPERATIONS,
  PmIcon,
  useMessages,
  useServer,
  useService,
  useStore,
} from '@lincyaw/host'
import type { BlockPoint } from '@lincyaw/host'
import { useEffect, useRef, useState } from 'react'
import { clockText, LECTURE_MESSAGES, simplifyPath } from '../domain/index.ts'
import type { PointerEvent as ReactPointerEvent } from 'react'
import type { PathPoint } from '../domain/index.ts'
import { applyInk } from './pointer-ink.ts'
import { LectureRecorder } from './recorder.ts'
import { serverSource } from './source.ts'
import { playing, refreshLectures, useViewer } from './state.ts'
import './RecorderPanel.css'
const cls = 'pm-lecture-button pm-ui-button pm-ui-button--small'
export default function RecorderPanel(_props: { view?: string }) {
  const t = useMessages(LECTURE_MESSAGES),
    viewer = useViewer(),
    server = useServer(),
    operations = useService(OPERATIONS)
  const id = useStore(playing),
    member = useStore(server.member, undefined)
  const [recorder, setRecorder] = useState<LectureRecorder>(),
    [trackIds, setTrackIds] = useState<string[]>([]),
    [trackId, setTrackId] = useState(''),
    [camera, setCamera] = useState(false),
    [screen, setScreen] = useState(false),
    [tool, setTool] = useState<'laser' | 'marker'>()
  const state = useStore(recorder?.state, undefined),
    elapsed = useStore(recorder?.elapsed, 0),
    failure = useStore(recorder?.error, undefined)
  const shown = server.available && !id,
    recording = state === 'recording',
    busy = ['starting', 'recording', 'saving'].includes(state ?? '')
  const surface = useRef<HTMLDivElement>(null),
    stroke = useRef<BlockPoint>()
  const loadTrackIds = async () =>
    setTrackIds(
      (
        await serverSource(server)
          .list()
          .catch(() => [])
      ).map((item) => item.id),
    )
  useEffect(() => {
    if (shown) void loadTrackIds()
  }, [shown])
  async function start() {
    if (!operations || busy) return
    const next = new LectureRecorder({
      server,
      operations,
      doc: () => viewer.doc.getSnapshot(),
      position: () => viewer.position.getSnapshot(),
      speaker: member?.name,
      camera,
      screen,
      track: trackId || undefined,
    })
    setRecorder(next)
    await next.start()
  }
  async function stop() {
    await recorder?.stop()
    await Promise.all([loadTrackIds(), refreshLectures()])
  }
  useEffect(() => {
    let path:
      | { block: string; line?: number; from: number; points: PathPoint[] }
      | undefined
    let sampled = 0,
      idle: ReturnType<typeof setTimeout> | undefined
    function flush() {
      clearTimeout(idle)
      const done = path
      path = undefined
      if (!done || !operations) return
      const data = {
        block: done.block,
        path: simplifyPath(done.points),
        ...(done.line ? { line: done.line } : {}),
      }
      recorder?.notePointerPathStart(data, done.from)
      operations.report({ type: 'point', data })
    }
    function pointer(event: PointerEvent) {
      if (!recording || event.timeStamp - sampled < 50) return
      sampled = event.timeStamp
      const at = blockAt(event.clientX, event.clientY, {
        skip: surface.current ?? undefined,
        within: '.pm-present',
      })
      if (!at || (path && path.block !== at.key)) flush()
      if (!at) return
      path ??= { block: at.key, from: event.timeStamp, points: [] }
      path.points.push([event.timeStamp - path.from, at.x, at.y])
      if (at.line) path.line = at.line
      clearTimeout(idle)
      idle = setTimeout(flush, 400)
      if (event.timeStamp - path.from >= 1000) flush()
    }
    window.addEventListener('pointermove', pointer, { passive: true })
    return () => {
      window.removeEventListener('pointermove', pointer)
      flush()
    }
  }, [recording, recorder, operations])
  useEffect(
    () => () => {
      void recorder?.stop()
    },
    [recorder],
  )
  function onUp(event: ReactPointerEvent) {
    const start = stroke.current
    stroke.current = undefined
    if (!start || !tool) return
    const box = start.element.getBoundingClientRect()
    const clamp = (n: number) =>
      Math.round(Math.max(0, Math.min(1, n)) * 1000) / 1000
    const last = blockAt(event.clientX, event.clientY, {
      skip: surface.current ?? undefined,
      within: '.pm-present',
    })
    const lines =
      start.line && last && last.key === start.key && last.line
        ? linesText(
            Array.from(
              { length: Math.abs(last.line - start.line) + 1 },
              (_, k) => Math.min(start.line!, last.line!) + k,
            ),
          )
        : undefined
    const data = {
      block: start.key,
      tool,
      ...(lines
        ? { lines }
        : {
            range: [
              clamp(start.x),
              clamp(start.y),
              clamp((event.clientX - box.left) / box.width),
              clamp((event.clientY - box.top) / box.height),
            ],
          }),
    }
    applyInk(data, false)
    operations?.report({ type: 'ink', data })
  }
  function clear() {
    const data = { clear: true }
    applyInk(data, false)
    operations?.report({ type: 'ink', data })
  }
  const status =
    state === 'recording'
      ? t.recorder.recording(clockText(elapsed))
      : state === 'saving'
        ? t.recorder.saving
        : state === 'saved'
          ? t.recorder.saved(recorder?.id ?? '')
          : state === 'failed'
            ? t.recorder.failed(failure ?? '')
            : ''
  return shown ? (
    <div
      className="pm-lecture-recorder"
      role="region"
      aria-label={t.recorder.region}
      data-state={state}
    >
      {tool && (
        <div
          ref={surface}
          className="pm-lecture-surface"
          data-tool={tool}
          onPointerDown={(event) => {
            stroke.current = blockAt(event.clientX, event.clientY, {
              skip: surface.current ?? undefined,
              within: '.pm-present',
            })
          }}
          onPointerUp={onUp}
        />
      )}
      <div className="pm-lecture-recorder__row">
        {!busy ? (
          <>
            {!!trackIds.length && (
              <label className="pm-lecture-recorder__field">
                {t.recorder.track}
                <select
                  value={trackId}
                  onChange={(e) => setTrackId(e.target.value)}
                  className="pm-ui-select"
                >
                  <option value="">{t.recorder.newTrack}</option>
                  {trackIds.map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label className="pm-lecture-recorder__field">
              <input
                checked={camera}
                onChange={(e) => setCamera(e.target.checked)}
                className="pm-ui-checkbox"
                type="checkbox"
              />{' '}
              {t.recorder.camera}
            </label>
            <label className="pm-lecture-recorder__field">
              <input
                checked={screen}
                onChange={(e) => setScreen(e.target.checked)}
                className="pm-ui-checkbox"
                type="checkbox"
              />{' '}
              {t.recorder.screen}
            </label>
            <button
              type="button"
              className={`${cls} pm-ui-button--primary pm-lecture-recorder__record`}
              onClick={() => void start()}
            >
              {trackId ? t.recorder.rerecord : t.recorder.record}
            </button>
          </>
        ) : recording ? (
          <button
            type="button"
            className={`${cls} pm-ui-button--danger pm-lecture-recorder__stop`}
            onClick={() => void stop()}
          >
            {t.recorder.stop}
          </button>
        ) : null}
        <button
          type="button"
          className={cls}
          aria-pressed={tool === 'laser'}
          onClick={() =>
            setTool((value) => (value === 'laser' ? undefined : 'laser'))
          }
        >
          {t.recorder.laser}
        </button>
        <button
          type="button"
          className={cls}
          aria-pressed={tool === 'marker'}
          onClick={() =>
            setTool((value) => (value === 'marker' ? undefined : 'marker'))
          }
        >
          {t.recorder.marker}
        </button>
        <button type="button" className={cls} onClick={clear}>
          {t.recorder.clear}
        </button>
      </div>
      {status && (
        <p className="pm-lecture-recorder__status" role="status">
          {recording && (
            <PmIcon className="pm-lecture-recorder__dot" name="record" />
          )}
          {status}
        </p>
      )}
    </div>
  ) : null
}
