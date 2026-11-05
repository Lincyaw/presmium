import {
  NAVIGATION,
  PAGE_READINESS,
  PLAYBACK_CONTROL,
  PmIconButton,
  STEP_CLOCK,
  useAppearance,
  useCursor,
  useDrivenStepLength,
  useMessages,
  useService,
  useStep,
  useStepScope,
  useStepTime,
  useStaticRender,
  useStore,
  useViewRole,
} from '@lincyaw/host'
import type { PlaybackLease } from '@lincyaw/host'
import { errorMessage, reportStaleModule } from '@lincyaw/kernel'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import type { SceneProps } from '../../components/PmScene.tsx'
import {
  MOTION_MESSAGES,
  stepStarts,
  timelinePosition,
  voicedDurations,
} from '../domain/index.ts'
import { loadScene, preloadScenes } from './deck-scenes.ts'
import type { Scene } from './scene.ts'
import './scene.css'

/** What a scene read of its step's inputs while it was made, with the values it read. */
interface ReadInputs { state?: { value: string | undefined }, parameters: Map<string, string>, all?: string }
type Inputs = { current: { state?: string, parameters: Readonly<Record<string, unknown>> } }
const json = (value: unknown) => JSON.stringify(value) ?? ''
/** The step's parameters, read live; while `recording`, every key read (or all, when enumerated) is noted in `read`. */
function liveParameters(inputs: Inputs, read: ReadInputs, recording: () => boolean): Readonly<Record<string, unknown>> {
  return new Proxy({}, {
    get: (_, key) => {
      if (typeof key !== 'string') return undefined
      const value = inputs.current.parameters[key]
      if (recording()) read.parameters.set(key, json(value))
      return value
    },
    has: (_, key) => key in inputs.current.parameters,
    ownKeys: () => {
      if (recording()) read.all = json(inputs.current.parameters)
      return Reflect.ownKeys(inputs.current.parameters)
    },
    getOwnPropertyDescriptor: (_, key) => {
      const descriptor = Reflect.getOwnPropertyDescriptor(inputs.current.parameters, key)
      return descriptor && { ...descriptor, configurable: true }
    },
  })
}
/** Whether a scene made from `read` would be made differently from these inputs. */
function changed(read: ReadInputs, state: string | undefined, parameters: Readonly<Record<string, unknown>>) {
  if (read.state && read.state.value !== state) return true
  if (read.all !== undefined) return read.all !== json(parameters)
  for (const [key, value] of read.parameters) if (json(parameters[key]) !== value) return true
  return false
}
const idle = (work: () => void) => {
  if (typeof requestIdleCallback === 'undefined') { const timer = setTimeout(work, 1); return () => clearTimeout(timer) }
  const id = requestIdleCallback(work, { timeout: 1000 })
  return () => cancelIdleCallback(id)
}

export default function SceneView(props: SceneProps) {
  const t = useMessages(MOTION_MESSAGES)
  const authored = props.durations?.length ? props.durations : [0]
  const scope = useStepScope()
  const hostStep = useStep()
  const cursor = useCursor()
  const expanded = scope.localPreview === true || !Number.isFinite(hostStep)
  // While a narrated lecture plays the slide, a state lasts until the voice of the first step that shows it ends, so
  // that beats placed as fractions of a state follow the voice; elsewhere the scene keeps its authored durations.
  const stepLength = useDrivenStepLength()
  const durations = stepLength && !expanded
    ? voicedDurations(authored, (k) => {
        const step = scope.step(k)
        return step < 0 ? undefined : stepLength(cursor.slide, step)
      })
    : authored
  const starts = stepStarts(durations)
  const total = starts.at(-1)!
  const viewRole = useViewRole()
  const navigation = useService(NAVIGATION)
  const navigated = useStore(navigation?.position, undefined)
  const clock = useService(STEP_CLOCK)
  const playbackControl = useService(PLAYBACK_CONTROL)
  const printed = useStaticRender()
  const stepTime = useStepTime({ until: Math.max(...durations) })
  const { dark } = useAppearance()
  // On a reading page every scene is made as it comes near the window, so a long page opens without making them all;
  // slides make theirs at once, and a printed page all of them.
  const eager = printed || (!expanded && viewRole !== 'reader')
  const [seen, setSeen] = useState(eager)
  useEffect(() => clock?.registerPreparation?.(cursor.slide, () => setSeen(true)), [clock, cursor.slide])
  const enabled = seen
  const [local, setLocal] = useState<number>()
  const [playing, setPlaying] = useState(false)
  const [status, setStatus] = useState<
    'loading' | 'ready' | 'missing' | 'failed'
  >('loading')
  // The page is not drawn while this scene loads its code (an embedding page waits for it).
  const readiness = useService(PAGE_READINESS)
  useEffect(() => (status === 'loading' && enabled ? readiness?.hold() : undefined), [status, readiness, enabled])
  const [failure, setFailure] = useState('')
  const stage = useRef<HTMLDivElement>(null)
  const instance = useRef<Scene | undefined>(undefined)
  const frame = useRef(0)
  const localTime = useRef<number | undefined>(undefined)
  const previewReplay = useRef<number>()
  const playbackLease = useRef<PlaybackLease>()
  const playbackGeneration = useRef(0)
  const activePlayback = useRef<number>()
  const localNavigation = useRef<{ slide: number, step: number }>()
  const followedNavigation = useRef({ source: navigation, position: navigated })
  // The durations the shown scene was made with: until one made with other durations replaces it, it is shown on its own
  // timeline, so that no frame shows a place of the new timeline on the old one.
  const [madeWith, setMadeWith] = useState<readonly number[]>()
  const place = (timeline: readonly number[]) =>
    expanded && local !== undefined
      ? local
      : timelinePosition(timeline, scope.localStepAt(hostStep), stepTime)
  const placeNow = useRef(place)
  placeNow.current = place
  const shown = place(madeWith ?? durations)
  const shownNow = useRef(shown)
  shownNow.current = shown
  const activeLocalStep = scope.localStepAt(hostStep)
  const requestedStart = scope.localPreview && navigated?.boundary === 'start' && Number.isFinite(activeLocalStep) && local === starts[activeLocalStep] ? activeLocalStep : undefined
  const selectedStep = Math.max(
    0,
    Math.min(
      durations.length - 1,
      expanded && local !== undefined
        ? requestedStart ?? Math.max(
            0,
            starts.findIndex(
              (start, i) =>
                i < durations.length && local <= start + durations[i]!,
            ),
          )
        : activeLocalStep,
    ),
  )
  // A reader's local controls do not navigate the full document. Resolve their
  // own authored snapshot while retaining the same local animation clock.
  const localState = expanded && !scope.localPreview && local !== undefined ? scope.stateAt(selectedStep) : undefined
  const sceneState = localState ? localState.state : scope.state
  const sceneParameters = localState ? localState.parameters ?? {} : scope.parameters ?? {}
  // A scene reads its step's state and parameters live. A build that read one of them is made again when it changes;
  // one that did not keeps its timeline from step to step, since making a scene costs a whole build.
  const inputs = useRef({ state: sceneState, parameters: sceneParameters })
  inputs.current = { state: sceneState, parameters: sceneParameters }
  const builtFrom = useRef<ReadInputs>()
  const rebuildNow = useRef<() => void>()
  const stop = () => {
    playbackGeneration.current++
    activePlayback.current = undefined
    playbackLease.current?.cancel()
    localNavigation.current = undefined
    cancelAnimationFrame(frame.current)
    setPlaying(false)
  }
  useEffect(() => {
    const lease = playbackControl?.register(stop)
    playbackLease.current = lease
    return () => {
      if (playbackLease.current === lease) playbackLease.current = undefined
      lease?.dispose()
    }
  }, [playbackControl])
  const seekLocal = (at: number) => {
    stop()
    previewReplay.current = undefined
    localTime.current = at
    setLocal(at)
  }
  const jump = (step: number) => {
    seekLocal(starts[step]! + durations[step]!)
    if (scope.localPreview) previewReplay.current = step
    const target = scope.step(step)
    if (scope.localPreview && target >= 0) navigation?.go({ slide: cursor.slide, step: target })
  }
  const fail = (error: unknown) => {
    stop()
    setStatus('failed')
    setFailure(errorMessage(error))
    console.error(`[presmium.motion] the scene ${props.scene} failed`, error)
    reportStaleModule(error)
  }
  useEffect(() => {
    const before = followedNavigation.current
    followedNavigation.current = { source: navigation, position: navigated }
    if (before.source !== navigation || before.position === navigated) return
    if (!scope.localPreview || !expanded || !navigated || navigated.slide !== cursor.slide) return
    const own = localNavigation.current
    localNavigation.current = undefined
    if (own?.slide === navigated.slide && own.step === navigated.step) return
    const step = scope.localStepAt(navigated.step)
    if (step >= 0 && step < durations.length) {
      seekLocal(starts[step]! + (navigated.boundary === 'start' ? 0 : durations[step]!))
      if (navigated.boundary !== 'start') previewReplay.current = step
    }
  }, [navigation, navigated, expanded, cursor.slide, scope.localPreview, scope.at, props.durations])
  useEffect(() => {
    if (!scope.localPreview || local === undefined || !navigation) return
    const target = scope.step(selectedStep), current = navigation.position.getSnapshot()
    if (target < 0 || (Number.isFinite(hostStep) && current.slide === cursor.slide && current.step === target)) return
    // Use the existing local clock's discrete step boundary. Its own navigation
    // updates semantic state without seeking or restarting that clock.
    localNavigation.current = { slide: cursor.slide, step: target }
    navigation.go(localNavigation.current)
  }, [scope.localPreview, local !== undefined, selectedStep, navigation, cursor.slide, Number.isFinite(hostStep)])
  useEffect(() => {
    const generation = activePlayback.current
    if (!playing || generation === undefined || generation !== playbackGeneration.current) return
    const from =
      localTime.current === undefined || localTime.current >= total
        ? 0
        : localTime.current
    const began = performance.now() - from
    const tick = () => {
      if (activePlayback.current !== generation || playbackGeneration.current !== generation) return
      const at = Math.min(total, performance.now() - began)
      localTime.current = at
      setLocal(at)
      if (at < total) frame.current = requestAnimationFrame(tick)
      else stop()
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
      clock?.wait(work, cursor.slide)
    }
  }, [shown, clock])
  useEffect(() => {
    if (seen) return
    if (eager || typeof IntersectionObserver === 'undefined') {
      setSeen(true)
      return
    }
    const root = stage.current
    if (!root) return
    // Observe the scene's stage against the viewport; after first visibility,
    // retain the instance when reading past it so steps remain reversible.
    // A scene a screen away is made ahead, while the page is idle, so that the reader does not wait for it on the way.
    let cancel: (() => void) | undefined
    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries.find((entry) => entry.isIntersecting)
        if (!entry) return
        observer.disconnect()
        const { top, bottom } = entry.boundingClientRect
        if (top < window.innerHeight && bottom > 0) setSeen(true)
        else cancel = idle(() => setSeen(true))
      },
      { rootMargin: '100% 0px' },
    )
    observer.observe(root)
    return () => { observer.disconnect(); cancel?.() }
  }, [seen, eager])
  useEffect(() => () => {
    instance.current?.dispose?.()
    instance.current = undefined
  }, [])
  useEffect(() => {
    const root = stage.current
    if (!enabled || !root) return
    let disposed = false
    let generation = 0
    let observer: ResizeObserver | undefined
    let resizeTimer: ReturnType<typeof setTimeout> | undefined
    let dimensions = { width: root.clientWidth, height: root.clientHeight }
    const build = async (version: number) => {
      const current = () => !disposed && version === generation
      const definition = await loadScene(props.scene)
      if (!current()) return
      if (!definition) {
        setStatus('missing')
        throw new Error(`the deck has no scene ${props.scene}`)
      }
      // A rebuild (another step's state, the theme, a resize) is made in a hidden layer while the
      // shown scene keeps following the time; the two swap in one task. Disposed first, the shown
      // scene would paint its authored DOM (a from() tween's end, later steps' elements) for frames.
      const layer = root.appendChild(document.createElement('div'))
      layer.className = 'pm-scene__layer'
      layer.dataset.pending = ''
      const box = { width: root.clientWidth, height: root.clientHeight }
      dimensions = { width: box.width, height: box.height }
      let swatch: CanvasRenderingContext2D | null | undefined
      // A build that draws text on a canvas measures and paints it with the page's fonts, so they load first.
      await document.fonts.ready
      if (!current()) { layer.remove(); return }
      const read: ReadInputs = { parameters: new Map() }
      let recording = true
      const made = await definition.create({
        root: layer,
        parameters: liveParameters(inputs, read, () => recording),
        get state() {
          if (recording) read.state = { value: inputs.current.state }
          return inputs.current.state
        },
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
      }).catch((error: unknown) => {
        layer.remove()
        if (current()) {
          instance.current?.dispose?.()
          instance.current = undefined
          root.replaceChildren()
        }
        throw error
      })
      recording = false
      // The first frame shows the scene's pictures: the video export captures a step as soon as it is ready.
      await Promise.all([...layer.querySelectorAll('img')].map((img) => img.decode().catch(() => undefined)))
      // Made from inputs the reader has since left: the shown scene may still fit, else it is made again.
      const stale = changed(read, inputs.current.state, inputs.current.parameters)
      if (!current() || stale) {
        try { made.dispose?.() }
        finally { layer.remove() }
        if (current() && (!instance.current || !builtFrom.current || changed(builtFrom.current, inputs.current.state, inputs.current.parameters))) rebuild()
        return
      }
      instance.current?.dispose?.()
      for (const child of [...root.children]) if (child !== layer) child.remove()
      delete layer.dataset.pending
      instance.current = made
      builtFrom.current = read
      made.seek(placeNow.current(durations))
      setMadeWith(durations)
      setStatus('ready')
    }
    const rebuild = () => {
      const version = ++generation
      const work = build(version).catch((error: unknown) => {
        if (!disposed && version === generation) throw error
      })
      work.catch((error) => {
        if (!disposed && version === generation) fail(error)
      })
      clock?.wait(work, cursor.slide)
    }
    rebuildNow.current = rebuild
    preloadScenes()
    rebuild()
    observer = new ResizeObserver(([entry]) => {
      const box = entry!.contentRect
      if (!instance.current || !box.width || !box.height) return
      if (instance.current.resize) {
        instance.current.resize(box.width, box.height)
        instance.current.seek(shownNow.current)
        dimensions = { width: box.width, height: box.height }
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
      if (rebuildNow.current === rebuild) rebuildNow.current = undefined
      clearTimeout(resizeTimer)
      observer?.disconnect()
    }
  }, [enabled, props.scene, JSON.stringify(durations), dark, clock])
  useEffect(() => {
    const read = builtFrom.current
    if (read && changed(read, sceneState, sceneParameters)) rebuildNow.current?.()
  }, [sceneState, JSON.stringify(sceneParameters)])
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
      data-presentation={viewRole !== 'reader' ? '' : undefined}
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
            onClick={() => {
              if (playing) stop()
              else {
                const lease = playbackLease.current, generation = ++playbackGeneration.current
                const start = () => {
                  if (generation !== playbackGeneration.current || lease !== playbackLease.current) return
                  const replay = previewReplay.current
                  previewReplay.current = undefined
                  if (scope.localPreview && replay !== undefined && replay < durations.length) {
                    localTime.current = starts[replay]!
                    setLocal(localTime.current)
                    // The exact start is also the previous step's end. Keep
                    // the selected step's identity while replaying its entry.
                    localNavigation.current = { slide: cursor.slide, step: scope.step(replay) }
                    navigation?.go({ ...localNavigation.current, boundary: 'start' })
                  }
                  activePlayback.current = generation
                  setPlaying(true)
                }
                if (lease) void lease.requestStart().then(allowed => { if (allowed) start() }).catch(error => { if (generation === playbackGeneration.current) fail(error) })
                else start()
              }
            }}
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
