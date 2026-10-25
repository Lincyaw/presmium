<script setup lang="ts">
import { PmIcon, STEP_CLOCK, useAppearance, useHost, useMessages, useService, useStepScope, useStepTime } from '@lincyaw/host'
import { errorMessage } from '@lincyaw/kernel'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { MOTION_MESSAGES, stepStarts, timelinePosition } from '../domain/index.ts'
import { loadScene, preloadScenes } from './deck-scenes.ts'
import type { Scene } from './scene.ts'

const props = defineProps<{
  scene: string
  durations?: number[]
  aspect?: string
  height?: string
  alt?: string
  still?: string
}>()

const t = useMessages(MOTION_MESSAGES)
const durations = props.durations?.length ? props.durations : [0]
const starts = stepStarts(durations)
const total = starts.at(-1)!
const scope = useStepScope()
const marks = durations.slice(1).map((_, k) => scope.step(k + 1))
const hostStep = useHost().useStep()
const stepTime = useStepTime({ until: Math.max(...durations) })
const position = computed(() => timelinePosition(durations, hostStep.value - scope.at.value, stepTime.value))

// The expanded document view shows the end; the reader can play the scene there or scrub it.
const expanded = computed(() => !Number.isFinite(hostStep.value))
const local = ref<number>()
const playing = ref(false)
const shown = computed(() => (expanded.value && local.value !== undefined ? local.value : position.value))

let frame = 0
function play() {
  if (playing.value) {
    playing.value = false
    cancelAnimationFrame(frame)
    return
  }
  const from = local.value === undefined || local.value >= total ? 0 : local.value
  const began = performance.now() - from
  playing.value = true
  const tick = () => {
    local.value = Math.min(total, performance.now() - began)
    if (local.value < total && playing.value) frame = requestAnimationFrame(tick)
    else playing.value = false
  }
  frame = requestAnimationFrame(tick)
}

/**
 * A CSS color as `rgb()` or `rgba()`: tokens written with `color-mix()` or a space-separated `rgb()` become a form
 * every library reads (three.js ignores the others; GSAP cannot tween them). The browser resolves it on a 1x1 canvas.
 */
let swatch: CanvasRenderingContext2D | null | undefined
function resolvedColor(css: string): string {
  swatch ??= document.createElement('canvas').getContext('2d', { willReadFrequently: true })
  if (!css || !swatch) return css
  swatch.clearRect(0, 0, 1, 1)
  swatch.fillStyle = css
  swatch.fillRect(0, 0, 1, 1)
  const [r, g, b, a] = swatch.getImageData(0, 0, 1, 1).data
  return a === 255 ? `rgb(${r}, ${g}, ${b})` : `rgba(${r}, ${g}, ${b}, ${Math.round(a! / 255 * 1000) / 1000})`
}

function scrub(event: Event) {
  playing.value = false
  cancelAnimationFrame(frame)
  local.value = Number((event.target as HTMLInputElement).value)
}

const stage = ref<HTMLElement>()
const status = ref<'loading' | 'ready' | 'missing' | 'failed'>('loading')
const failure = ref('')
const stepClock = useService(STEP_CLOCK)
let instance: Scene | undefined
let observer: ResizeObserver | undefined
let disposed = false

/** Tells the step clock the picture waits for `work`, once the host has started (the scene may mount first). */
function waitFor(work: Promise<unknown>) {
  // Handled here: the clock reports a failure through settled(), not as an unhandled rejection of the page.
  work.catch(() => undefined)
  if (stepClock.value) return stepClock.value.wait(work)
  const stop = watch(stepClock, (clock) => {
    if (!clock) return
    clock.wait(work)
    stop()
  })
}

function fail(error: unknown) {
  status.value = 'failed'
  failure.value = errorMessage(error)
  console.error(`[presmium.motion] the scene ${props.scene} failed`, error)
}

function draw(ms: number) {
  try {
    instance?.seek(ms)
  } catch (error) {
    fail(error)
    // This frame's picture cannot be drawn: a player that films the page learns it from the clock.
    waitFor(Promise.reject(error))
  }
}

let built: { width: number, height: number } | undefined
let rebuilding: ReturnType<typeof setTimeout> | undefined

/** Makes the scene in the stage, after disposing the one there; it is drawn at the current place. */
function build(root: HTMLElement): Promise<void> {
  const work = (async () => {
    const definition = await loadScene(props.scene)
    if (!definition) {
      status.value = 'missing'
      throw new Error(`the deck has no scene ${props.scene}`)
    }
    dispose()
    root.replaceChildren()
    const box = root.getBoundingClientRect()
    built = { width: box.width, height: box.height }
    const made = await definition.create({
      root,
      durations,
      at: step => starts[Math.max(0, Math.min(step, durations.length))]!,
      total,
      width: box.width || 640,
      height: box.height || 360,
      color: name => resolvedColor(getComputedStyle(root).getPropertyValue(`--pm-color-${name}`).trim()),
    })
    if (disposed) return made.dispose?.()
    instance = made
    status.value = 'ready'
    draw(shown.value)
  })()
  // A player that films the page waits for the scene, and fails when it cannot be drawn.
  waitFor(work)
  work.catch((error: unknown) => {
    if (status.value !== 'missing') fail(error)
  })
  return work
}

/** Builds the scene again a moment after the last call: its colors and measured layout were taken when it was made. */
function rebuildSoon(root: HTMLElement) {
  clearTimeout(rebuilding)
  rebuilding = setTimeout(() => {
    if (!disposed && status.value === 'ready') void build(root)
  }, 150)
}

function dispose() {
  try {
    instance?.dispose?.()
  } catch (error) {
    console.error(`[presmium.motion] disposing the scene ${props.scene} failed`, error)
  }
  instance = undefined
}

const { dark } = useAppearance()

onMounted(() => {
  preloadScenes()
  const root = stage.value!
  void build(root)
  watch(dark, () => rebuildSoon(root))
  observer = new ResizeObserver(() => {
    const box = root.getBoundingClientRect()
    if (!instance || !box.width || !box.height) return
    // A scene that cannot follow a new size (one that measured its layout when built) is made again for it.
    if (!instance.resize) {
      if (built && (Math.abs(box.width - built.width) > 1 || Math.abs(box.height - built.height) > 1)) rebuildSoon(root)
      return
    }
    instance.resize(box.width, box.height)
    draw(shown.value)
  })
  observer.observe(root)
})

// Synchronously, so the frame a player asks for is drawn before it takes its screenshot.
watch(shown, draw, { flush: 'sync' })

onBeforeUnmount(() => {
  disposed = true
  cancelAnimationFrame(frame)
  clearTimeout(rebuilding)
  observer?.disconnect()
  dispose()
})

const box = computed(() => (props.height ? { height: props.height } : { aspectRatio: (props.aspect ?? '16/9').replace('/', ' / ') }))
const notice = computed(() => {
  if (status.value === 'loading') return t.value.loading
  if (status.value === 'missing') return t.value.missing(props.scene)
  if (status.value === 'failed') return t.value.failed(props.scene, failure.value)
  return undefined
})
</script>

<template>
  <figure class="pm-scene" :data-scene="scene" :data-status="status" :data-height="height ? '' : undefined" :data-position="Math.round(shown)">
    <div class="pm-scene__frame" :style="box" role="img" :aria-label="alt ?? scene">
      <div ref="stage" class="pm-scene__stage" />
      <p v-if="notice" class="pm-scene__notice" :role="status === 'loading' ? undefined : 'alert'">{{ notice }}</p>
    </div>
    <div v-if="expanded && status === 'ready' && total > 0" class="pm-scene__controls" role="group" @keydown.stop>
      <button type="button" class="pm-ui-button pm-ui-button--small" :aria-label="playing ? t.pause : t.play" :aria-pressed="playing" @click="play">
        <PmIcon :name="playing ? 'pause' : 'play'" size="1em" :stroke-width="2" />
      </button>
      <input type="range" class="pm-scene__scrub" min="0" :max="total" step="1" :value="Math.round(shown)" :aria-label="t.scrub" @input="scrub">
    </div>
    <span v-for="mark in marks" :key="mark" v-click="mark" hidden />
  </figure>
</template>

<style scoped>
.pm-scene {
  margin: 0 auto;
  width: 100%;
  max-width: 44rem;
}
.pm-scene[data-height] {
  max-width: none;
}
.pm-scene__frame {
  position: relative;
  width: 100%;
  overflow: hidden;
  border-radius: var(--pm-radius-control);
}
.pm-scene__stage {
  position: absolute;
  inset: 0;
  /* A scene can size its layout to the picture with cqw and cqh. */
  container-type: size;
}
.pm-scene__notice {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  margin: 0;
  padding: var(--pm-space-3);
  color: var(--pm-color-muted);
  font-family: var(--pm-font-sans);
  font-size: var(--pm-text-sm);
  text-align: center;
}
.pm-scene__controls {
  display: flex;
  align-items: center;
  gap: var(--pm-space-2);
  margin-top: var(--pm-space-2);
}
.pm-scene__scrub {
  flex: 1;
  accent-color: var(--pm-color-accent);
}
</style>
