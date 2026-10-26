import {
  NAVIGATION,
  PmIconButton,
  STEP_CLOCK,
  useAppearance,
  useCursor,
  useMessages,
  useService,
  useStep,
  useStepScope,
  useStepTime,
  useStaticRender,
  useStore,
} from '@lincyaw/host'
import { errorMessage } from '@lincyaw/kernel'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import type { SceneProps } from '../../components/PmScene.tsx'
import {
  MOTION_MESSAGES,
  stepStarts,
  timelinePosition,
} from '../domain/index.ts'
import { loadScene, preloadScenes } from './deck-scenes.ts'
import type { Scene } from './scene.ts'
import './scene.css'

export default function SceneView(props: SceneProps) {
  const t = useMessages(MOTION_MESSAGES)
  const durations = props.durations?.length ? props.durations : [0]
  const starts = stepStarts(durations)
  const total = starts.at(-1)!
  const scope = useStepScope()
  const hostStep = useStep()
  const cursor = useCursor()
  const navigation = useService(NAVIGATION)
  const navigated = useStore(navigation?.position, undefined)
  const clock = useService(STEP_CLOCK)
  const printed = useStaticRender()
  const stepTime = useStepTime({ until: Math.max(...durations) })
  const { dark } = useAppearance()
  const expanded = !Number.isFinite(hostStep)
  const [seen, setSeen] = useState(!expanded || printed)
  const enabled = seen || printed || !expanded
  const [local, setLocal] = useState<number>()
  const [playing, setPlaying] = useState(false)
  const [status, setStatus] = useState<
    'loading' | 'ready' | 'missing' | 'failed'
  >('loading')
  const [failure, setFailure] = useState('')
  const stage = useRef<HTMLDivElement>(null)
  const instance = useRef<Scene | undefined>(undefined)
  const frame = useRef(0)
  const localTime = useRef<number | undefined>(undefined)
  const shown =
    expanded && local !== undefined
      ? local
      : timelinePosition(durations, scope.localStepAt(hostStep), stepTime)
  const shownNow = useRef(shown)
  shownNow.current = shown
  const selectedStep = Math.max(
    0,
    Math.min(
      durations.length - 1,
      expanded && local !== undefined
        ? Math.max(
            0,
            starts.findIndex(
              (start, i) =>
                i < durations.length && local <= start + durations[i]!,
            ),
          )
        : scope.localStepAt(hostStep),
    ),
  )
  const stop = () => {
    cancelAnimationFrame(frame.current)
    setPlaying(false)
  }
  const seekLocal = (at: number) => {
    stop()
    localTime.current = at
    setLocal(at)
  }
  const jump = (step: number) => {
    seekLocal(starts[step]! + durations[step]!)
    const target = scope.step(step)
    if (target >= 0) navigation?.go({ slide: cursor.slide, step: target })
  }
  const fail = (error: unknown) => {
    setStatus('failed')
    setFailure(errorMessage(error))
    console.error(`[presmium.motion] the scene ${props.scene} failed`, error)
  }
  useEffect(() => {
    if (!expanded || !navigated || navigated.slide !== cursor.slide) return
    const step = scope.localStepAt(navigated.step)
    if (step >= 0 && step < durations.length)
      seekLocal(starts[step]! + durations[step]!)
  }, [navigated, expanded, cursor.slide, scope.at, props.durations])
  useEffect(() => {
    if (!playing) return
    const from =
      localTime.current === undefined || localTime.current >= total
        ? 0
        : localTime.current
    const began = performance.now() - from
    const tick = () => {
      const at = Math.min(total, performance.now() - began)
      localTime.current = at
      setLocal(at)
      if (at < total) frame.current = requestAnimationFrame(tick)
      else setPlaying(false)
    }
    frame.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame.current)
  }, [playing, total])
  useLayoutEffect(() => {
    try {
      instance.current?.seek(shown)
    } catch (error) {
      fail(error)
      const work = Promise.reject(error)
      work.catch(() => {})
      clock?.wait(work)
    }
  }, [shown, clock])
  useEffect(() => {
    if (seen) return
    if (printed || !expanded || typeof IntersectionObserver === 'undefined') {
      setSeen(true)
      return
    }
    const root = stage.current
    if (!root) return
    // Observe the scene's stage against the viewport; after first visibility,
    // retain the instance when reading past it so steps remain reversible.
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return
        setSeen(true)
        observer.disconnect()
      },
      { rootMargin: '200px' },
    )
    observer.observe(root)
    return () => observer.disconnect()
  }, [seen, printed, expanded])
  useEffect(() => {
    const root = stage.current
    if (!enabled || !root) return
    let disposed = false
    let observer: ResizeObserver | undefined
    let resizeTimer: ReturnType<typeof setTimeout> | undefined
    let dimensions = { width: 0, height: 0 }
    const build = async () => {
      const definition = await loadScene(props.scene)
      if (disposed) return
      if (!definition) {
        setStatus('missing')
        throw new Error(`the deck has no scene ${props.scene}`)
      }
      instance.current?.dispose?.()
      root.replaceChildren()
      const box = root.getBoundingClientRect()
      dimensions = { width: box.width, height: box.height }
      let swatch: CanvasRenderingContext2D | null | undefined
      const made = await definition.create({
        root,
        parameters: scope.parameters ?? {},
        state: scope.state,
        durations,
        at: (step) => starts[Math.max(0, Math.min(step, durations.length))]!,
        total,
        width: box.width || 640,
        height: box.height || 360,
        color(name) {
          swatch ??= document
            .createElement('canvas')
            .getContext('2d', { willReadFrequently: true })
          const css = getComputedStyle(root)
            .getPropertyValue(`--pm-color-${name}`)
            .trim()
          if (!swatch || !css) return css
          swatch.clearRect(0, 0, 1, 1)
          swatch.fillStyle = css
          swatch.fillRect(0, 0, 1, 1)
          const [r, g, b, a] = swatch.getImageData(0, 0, 1, 1).data
          return a === 255
            ? `rgb(${r}, ${g}, ${b})`
            : `rgba(${r}, ${g}, ${b}, ${Math.round((a! / 255) * 1000) / 1000})`
        },
      })
      if (disposed) return made.dispose?.()
      instance.current = made
      made.seek(shownNow.current)
      setStatus('ready')
    }
    const rebuild = () => {
      const work = build()
      work.catch((error) => {
        if (!disposed) fail(error)
      })
      clock?.wait(work)
    }
    preloadScenes()
    rebuild()
    observer = new ResizeObserver(() => {
      const box = root.getBoundingClientRect()
      if (!instance.current || !box.width || !box.height) return
      if (instance.current.resize) {
        instance.current.resize(box.width, box.height)
        instance.current.seek(shownNow.current)
      } else if (
        Math.abs(box.width - dimensions.width) > 1 ||
        Math.abs(box.height - dimensions.height) > 1
      ) {
        clearTimeout(resizeTimer)
        resizeTimer = setTimeout(rebuild, 150)
      }
    })
    observer.observe(root)
    return () => {
      disposed = true
      clearTimeout(resizeTimer)
      cancelAnimationFrame(frame.current)
      observer?.disconnect()
      instance.current?.dispose?.()
      instance.current = undefined
    }
  }, [enabled, props.scene, JSON.stringify(durations), JSON.stringify(scope.parameters), scope.state, dark, clock])
  const box: CSSProperties = props.height
    ? { height: props.height }
    : { aspectRatio: (props.aspect ?? '16/9').replace('/', ' / ') }
  const notice =
    status === 'loading'
      ? t.loading
      : status === 'missing'
        ? t.missing(props.scene)
        : status === 'failed'
          ? t.failed(props.scene, failure)
          : undefined
  return (
    <figure
      className="pm-scene"
      data-scene={props.scene}
      data-status={status}
      data-height={props.height ? '' : undefined}
      data-position={Math.round(shown)}
    >
      <div
        className="pm-scene__frame"
        style={box}
        role="img"
        aria-label={props.alt ?? props.scene}
      >
        <div ref={stage} className="pm-scene__stage" />
        {notice && (
          <p
            className="pm-scene__notice"
            role={status === 'loading' ? undefined : 'alert'}
          >
            {notice}
          </p>
        )}
      </div>
      {expanded && !printed && status === 'ready' && durations.length > 1 && (
        <div
          className="pm-scene__steps"
          role="group"
          aria-label={t.steps}
          onKeyDown={(event) => event.stopPropagation()}
        >
          {durations.map((_, step) => (
            <button
              key={step}
              type="button"
              className="pm-scene__step"
              aria-label={t.jump(step + 1)}
              title={t.jump(step + 1)}
              aria-pressed={selectedStep === step}
              data-scene-jump={scope.step(step)}
              disabled={scope.step(step) < 0}
              onClick={() => jump(step)}
            >
              {step + 1}
            </button>
          ))}
        </div>
      )}
      {expanded && status === 'ready' && total > 0 && (
        <div
          className="pm-scene__controls"
          role="group"
          onKeyDown={(event) => event.stopPropagation()}
        >
          <PmIconButton
            small
            icon={playing ? 'pause' : 'play'}
            label={playing ? t.pause : t.play}
            aria-pressed={playing}
            onClick={() => setPlaying((value) => !value)}
          />
          <input
            type="range"
            className="pm-scene__scrub"
            min="0"
            max={total}
            step="1"
            value={Math.round(shown)}
            aria-label={t.scrub}
            onChange={(event) => seekLocal(Number(event.target.value))}
          />
        </div>
      )}
    </figure>
  )
}
