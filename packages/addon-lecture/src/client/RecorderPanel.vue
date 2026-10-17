<script setup lang="ts">
// Recording a lecture from the present view (P-90): under `presmium dev` and `presmium serve`, a
// new lecture or one section of an existing lecture again, with the camera and the screen if
// wanted. While it records, the pointer over a block is reported as `point` (about 20 samples a
// second, simplified); the laser and the marker draw on a block and report `ink`.
import { blockAt, linesText, OPERATIONS, useMessages, useServer, useService } from '@presmium/host'
import type { BlockPoint } from '@presmium/host'
import { computed, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import { clockText, LECTURE_ID, LECTURE_MESSAGES, simplifyPath } from '../domain/index.ts'
import type { PathPoint } from '../domain/index.ts'
import { applyInk } from './marks.ts'
import { LectureRecorder } from './recorder.ts'
import { playing, refreshLectures, useViewer } from './state.ts'

defineProps<{ view: string }>()

/** The present view, where the blocks pointed at are. */
const PRESENT = '.pm-present'
/** Pointer samples: at most one every 50 ms (20 a second). */
const SAMPLE_MS = 50
/** A path ends after this long without a move, or once it is this long. */
const IDLE_MS = 400
const LONGEST_MS = 1000

const t = useMessages(LECTURE_MESSAGES)
const viewer = useViewer()
const server = useServer()
const operations = useService(OPERATIONS)
const recorder = shallowRef<LectureRecorder>()
const tracks = ref<string[]>([])
const track = ref('')
const camera = ref(false)
const screen = ref(false)
const tool = ref<'laser' | 'marker'>()
const shown = computed(() => server.available && !playing.value)
const recording = computed(() => recorder.value?.state.value === 'recording')
const busy = computed(() => ['starting', 'recording', 'saving'].includes(recorder.value?.state.value ?? ''))

async function loadTracks() {
  const response = await server.fetch(LECTURE_ID, 'tracks').catch(() => undefined)
  const list = response?.ok ? await response.json() as { id: string }[] : []
  tracks.value = list.map(item => item.id)
}

onMounted(() => {
  window.addEventListener('pointermove', onPointer, { passive: true })
  if (shown.value) void loadTracks()
})

async function start() {
  if (!operations.value || busy.value) return
  const next = new LectureRecorder({
    server,
    operations: operations.value,
    doc: () => viewer.doc.value,
    position: () => viewer.position.value,
    speaker: server.member.value?.name,
    camera: camera.value,
    screen: screen.value,
    track: track.value || undefined,
  })
  recorder.value = next
  await next.start()
}

async function stop() {
  await recorder.value?.stop()
  // The view menu offers the lecture view once the deck has one.
  await Promise.all([loadTracks(), refreshLectures()])
}

const status = computed(() => {
  const r = recorder.value
  if (!r) return ''
  switch (r.state.value) {
    case 'recording': return t.value.recorder.recording(clockText(r.elapsed.value))
    case 'saving': return t.value.recorder.saving
    case 'saved': return t.value.recorder.saved(r.id ?? '')
    case 'failed': return t.value.recorder.failed(r.error.value ?? '')
    default: return ''
  }
})

// The pointer over a block of the present view, while recording.
let path: { block: string, line?: number, from: number, points: PathPoint[] } | undefined
let sampled = 0
let idle: ReturnType<typeof setTimeout> | undefined

function flush() {
  clearTimeout(idle)
  const done = path
  path = undefined
  if (!done || !operations.value) return
  const data = { block: done.block, path: simplifyPath(done.points), ...done.line ? { line: done.line } : {} }
  // Reported once it ends (up to IDLE_MS after its last move), it happened from its first.
  recorder.value?.pathStarted(data, done.from)
  operations.value.report({ type: 'point', data })
}

function onPointer(event: PointerEvent) {
  if (!recording.value || event.timeStamp - sampled < SAMPLE_MS) return
  sampled = event.timeStamp
  const at = blockAt(event.clientX, event.clientY, { skip: surface.value, within: PRESENT })
  if (!at || (path && path.block !== at.key)) flush()
  if (!at) return
  path ??= { block: at.key, from: event.timeStamp, points: [] }
  path.points.push([event.timeStamp - path.from, at.x, at.y])
  if (at.line) path.line = at.line
  clearTimeout(idle)
  idle = setTimeout(flush, IDLE_MS)
  if (event.timeStamp - path.from >= LONGEST_MS) flush()
}

// The laser and the marker: a stroke over one block, its code lines or a box of it.
const surface = shallowRef<HTMLElement>()
/** Where the stroke began. */
let stroke: BlockPoint | undefined

function onDown(event: PointerEvent) {
  stroke = blockAt(event.clientX, event.clientY, { skip: surface.value, within: PRESENT })
}

function onUp(event: PointerEvent) {
  const start = stroke
  stroke = undefined
  if (!start || !tool.value) return
  const box = start.element.getBoundingClientRect()
  const end = { x: (event.clientX - box.left) / box.width, y: (event.clientY - box.top) / box.height }
  const clamp = (n: number) => Math.round(Math.max(0, Math.min(1, n)) * 1000) / 1000
  const last = blockAt(event.clientX, event.clientY, { skip: surface.value, within: PRESENT })
  const lines = start.line && last?.key === start.key && last.line
    ? linesText(Array.from({ length: Math.abs(last.line - start.line) + 1 }, (_, k) => Math.min(start.line!, last.line!) + k))
    : undefined
  const data = { block: start.key, tool: tool.value, ...lines ? { lines } : { range: [clamp(start.x), clamp(start.y), clamp(end.x), clamp(end.y)] } }
  applyInk(data, false)
  operations.value?.report({ type: 'ink', data })
}

function clearMarks() {
  const data = { clear: true }
  applyInk(data, false)
  operations.value?.report({ type: 'ink', data })
}

watch(recording, (now) => {
  if (!now) flush()
})
onBeforeUnmount(() => {
  window.removeEventListener('pointermove', onPointer)
  flush()
  // Leaving the present view ends the recording.
  void recorder.value?.stop()
})
</script>

<template>
  <div v-if="shown" class="pm-lecture-recorder" role="region" :aria-label="t.recorder.region" :data-state="recorder?.state.value">
    <div
      v-if="tool"
      ref="surface"
      class="pm-lecture-surface"
      :data-tool="tool"
      @pointerdown="onDown"
      @pointerup="onUp"
    />
    <div class="pm-lecture-recorder__row">
      <template v-if="!busy">
        <label v-if="tracks.length" class="pm-lecture-recorder__field">
          {{ t.recorder.track }}
          <select v-model="track" class="pm-ui-select">
            <option value="">{{ t.recorder.newTrack }}</option>
            <option v-for="id in tracks" :key="id" :value="id">{{ id }}</option>
          </select>
        </label>
        <label class="pm-lecture-recorder__field"><input v-model="camera" class="pm-ui-checkbox" type="checkbox"> {{ t.recorder.camera }}</label>
        <label class="pm-lecture-recorder__field"><input v-model="screen" class="pm-ui-checkbox" type="checkbox"> {{ t.recorder.screen }}</label>
        <button type="button" class="pm-lecture-button pm-ui-button pm-ui-button--small pm-ui-button--primary pm-lecture-recorder__record" @click="start">{{ track ? t.recorder.rerecord : t.recorder.record }}</button>
      </template>
      <button v-else-if="recording" type="button" class="pm-lecture-button pm-ui-button pm-ui-button--small pm-ui-button--danger pm-lecture-recorder__stop" @click="stop">{{ t.recorder.stop }}</button>
      <button type="button" class="pm-lecture-button pm-ui-button pm-ui-button--small" :aria-pressed="tool === 'laser'" @click="tool = tool === 'laser' ? undefined : 'laser'">{{ t.recorder.laser }}</button>
      <button type="button" class="pm-lecture-button pm-ui-button pm-ui-button--small" :aria-pressed="tool === 'marker'" @click="tool = tool === 'marker' ? undefined : 'marker'">{{ t.recorder.marker }}</button>
      <button type="button" class="pm-lecture-button pm-ui-button pm-ui-button--small" @click="clearMarks">{{ t.recorder.clear }}</button>
    </div>
    <p v-if="status" class="pm-lecture-recorder__status" role="status">{{ status }}</p>
  </div>
</template>

<style>
.pm-lecture-recorder {
  position: absolute;
  top: 0.5rem;
  right: 0.5rem;
  z-index: 5;
  box-sizing: border-box;
  max-width: calc(100% - 1rem);
  padding: var(--pm-space-2) var(--pm-space-3);
  border: 1px solid var(--pm-color-line);
  border-radius: var(--pm-radius-card);
  background: var(--pm-color-surface);
  color: var(--pm-color-ink);
  box-shadow: var(--pm-shadow-float);
  font-family: var(--pm-font-sans);
  font-size: var(--pm-text-sm);
}
.pm-lecture-recorder__row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.4rem;
}
.pm-lecture-recorder__field {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
}
.pm-lecture-recorder__status {
  margin: 0.25rem 0 0;
}
.pm-lecture-recorder[data-state='recording'] .pm-lecture-recorder__status::before {
  content: '● ';
  color: var(--pm-color-danger);
}
.pm-lecture-surface {
  position: fixed;
  inset: 0 0 var(--pm-overlay-bar, 3rem);
  z-index: -1;
  cursor: crosshair;
  touch-action: none;
}
</style>
