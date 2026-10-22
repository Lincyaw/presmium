<script setup lang="ts">
import { useMessages, useServer } from '@lincyaw/host'
import { onMounted, ref } from 'vue'
import { clockText, LECTURE_ID, LECTURE_MESSAGES } from '../domain/index.ts'
import type { LectureSummary } from './source.ts'
import { lectureSource } from './source.ts'
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
  try {
    lectures.value = await lectureSource(server, viewer.doc.value.config.presmium[LECTURE_ID]).list()
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
        <button type="button" class="pm-lecture-button pm-ui-button pm-ui-button--small" :aria-label="t.list.open(lecture.id)" @click="open(lecture.id)">
          {{ lecture.id }}<template v-if="lecture.duration"> · {{ clockText(lecture.duration) }}</template>
        </button>
      </li>
    </ul>
    <button type="button" class="pm-lecture-button pm-ui-button pm-ui-button--small" @click="viewer.setView(viewer.pageView.value)">{{ t.player.close }}</button>
  </div>
</template>

<style>
.pm-lecture-view {
  position: fixed;
  inset: 0;
  z-index: calc(var(--vp-z-index-local-nav, 32) + 100);
  overflow: auto;
  padding: 2rem;
  background: var(--pm-color-bg);
  color: var(--pm-color-ink);
  font-family: var(--pm-font-sans);
}
.pm-lecture-view h1 {
  font-family: var(--pm-font-serif);
  font-size: var(--pm-text-display);
  font-weight: 600;
}
.pm-lecture-view__list {
  display: grid;
  gap: 0.5rem;
  padding: 0;
  list-style: none;
}
</style>
