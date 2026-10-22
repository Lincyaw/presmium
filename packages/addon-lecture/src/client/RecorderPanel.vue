<script setup lang="ts">
import { blockAt, linesText, OPERATIONS, PmIcon, useMessages, useServer, useService } from '@lincyaw/host'
import type { BlockPoint } from '@lincyaw/host'
import { computed, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import { clockText, LECTURE_MESSAGES, simplifyPath } from '../domain/index.ts'
import type { PathPoint } from '../domain/index.ts'
import { applyInk } from './pointer-ink.ts'
import { LectureRecorder } from './recorder.ts'
import { serverSource } from './source.ts'
import { playing, refreshLectures, useViewer } from './state.ts'

defineProps<{ view: string }>()

const PRESENT = '.pm-present'
const SAMPLE_MS = 50
const IDLE_MS = 400
const LONGEST_MS = 1000

const t = useMessages(LECTURE_MESSAGES)
const viewer = useViewer()
const server = useServer()
const operations = useService(OPERATIONS)
const recorder = shallowRef<LectureRecorder>()
const trackIds = ref<string[]>([])
const trackId = ref('')
const camera = ref(false)
const screen = ref(false)
const tool = ref<'laser' | 'marker'>()
const shown = computed(() => server.available && !playing.value)
const recording = computed(() => recorder.value?.state.value === 'recording')
const busy = computed(() => ['starting', 'recording', 'saving'].includes(recorder.value?.state.value ?? ''))

async function loadTrackIds() {
  trackIds.value = (await serverSource(server).list().catch(() => [])).map(item => item.id)
}

onMounted(() => {
  window.addEventListener('pointermove', onPointer, { passive: true })
  if (shown.value) void loadTrackIds()
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
    track: trackId.value || undefined,
  })
  recorder.value = next
  await next.start()
}

async function stop() {
  await recorder.value?.stop()
  await Promise.all([loadTrackIds(), refreshLectures()])
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

let path: { block: string, line?: number, from: number, points: PathPoint[] } | undefined
let sampled = 0
let idle: ReturnType<typeof setTimeout> | undefined

function flush() {
  clearTimeout(idle)
  const done = path
  path = undefined
  if (!done || !operations.value) return
  const data = { block: done.block, path: simplifyPath(done.points), ...done.line ? { line: done.line } : {} }
  recorder.value?.notePointerPathStart(data, done.from)
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

const surface = shallowRef<HTMLElement>()
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

function clearInk() {
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
        <label v-if="trackIds.length" class="pm-lecture-recorder__field">
          {{ t.recorder.track }}
          <select v-model="trackId" class="pm-ui-select">
            <option value="">{{ t.recorder.newTrack }}</option>
            <option v-for="id in trackIds" :key="id" :value="id">{{ id }}</option>
          </select>
        </label>
        <label class="pm-lecture-recorder__field"><input v-model="camera" class="pm-ui-checkbox" type="checkbox"> {{ t.recorder.camera }}</label>
        <label class="pm-lecture-recorder__field"><input v-model="screen" class="pm-ui-checkbox" type="checkbox"> {{ t.recorder.screen }}</label>
        <button type="button" class="pm-lecture-button pm-ui-button pm-ui-button--small pm-ui-button--primary pm-lecture-recorder__record" @click="start">{{ trackId ? t.recorder.rerecord : t.recorder.record }}</button>
      </template>
      <button v-else-if="recording" type="button" class="pm-lecture-button pm-ui-button pm-ui-button--small pm-ui-button--danger pm-lecture-recorder__stop" @click="stop">{{ t.recorder.stop }}</button>
      <button type="button" class="pm-lecture-button pm-ui-button pm-ui-button--small" :aria-pressed="tool === 'laser'" @click="tool = tool === 'laser' ? undefined : 'laser'">{{ t.recorder.laser }}</button>
      <button type="button" class="pm-lecture-button pm-ui-button pm-ui-button--small" :aria-pressed="tool === 'marker'" @click="tool = tool === 'marker' ? undefined : 'marker'">{{ t.recorder.marker }}</button>
      <button type="button" class="pm-lecture-button pm-ui-button pm-ui-button--small" @click="clearInk">{{ t.recorder.clear }}</button>
    </div>
    <p v-if="status" class="pm-lecture-recorder__status" role="status"><PmIcon v-if="recording" class="pm-lecture-recorder__dot" name="record" size="1.1em" :stroke-width="2" />{{ status }}</p>
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
.pm-lecture-recorder__dot {
  margin-inline-end: 0.35em;
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
