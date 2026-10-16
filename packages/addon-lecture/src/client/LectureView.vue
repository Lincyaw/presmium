<script setup lang="ts">
// The view `lecture` (docs/ir.md 8.2): `?view=lecture&track=<id>` plays a lecture on the real page,
// which is the present view with the player over it; without a lecture named, the view lists the
// deck's lectures to choose one.
import { useMessages, useServer } from '@presmium/host'
import { isRecord } from '@presmium/kernel'
import { onMounted, ref } from 'vue'
import { clockText, LECTURE_ID, LECTURE_MESSAGES } from '../domain/index.ts'
import type { LectureSummary } from './source.ts'
import { serverSource, staticBase, staticSource } from './source.ts'
import { play, playing, useViewer } from './state.ts'

const t = useMessages(LECTURE_MESSAGES)
const viewer = useViewer()
const server = useServer()
const lectures = ref<LectureSummary[]>()
const failed = ref(false)

function open(id: string) {
  play(id)
  viewer.setView('present')
}

onMounted(async () => {
  if (playing.value) {
    viewer.setView('present')
    return
  }
  const config = viewer.doc.value.config.presmium[LECTURE_ID]
  const source = server.available ? serverSource(server) : staticSource(staticBase(isRecord(config) ? config : undefined))
  try {
    lectures.value = await source.list()
  } catch {
    failed.value = true
  }
})
</script>

<template>
  <div v-if="!playing" class="pm-lecture-view" role="dialog" :aria-label="t.list.title">
    <h1>{{ t.list.title }}</h1>
    <p v-if="failed">{{ t.list.unavailable }}</p>
    <p v-else-if="lectures && lectures.length === 0">{{ t.list.empty }}</p>
    <ul v-else-if="lectures" class="pm-lecture-view__list">
      <li v-for="lecture in lectures" :key="lecture.id">
        <button type="button" class="pm-lecture-button" :aria-label="t.list.open(lecture.id)" @click="open(lecture.id)">
          {{ lecture.id }}<template v-if="lecture.duration"> · {{ clockText(lecture.duration) }}</template>
        </button>
      </li>
    </ul>
    <button type="button" class="pm-lecture-button" @click="viewer.setView(viewer.pageView.value)">{{ t.player.close }}</button>
  </div>
</template>

<style>
.pm-lecture-view {
  position: fixed;
  inset: 0;
  z-index: calc(var(--vp-z-index-local-nav, 32) + 100);
  overflow: auto;
  padding: 2rem;
  background: var(--vp-c-bg, #fff);
}
.pm-lecture-view__list {
  display: grid;
  gap: 0.5rem;
  padding: 0;
  list-style: none;
}
</style>
