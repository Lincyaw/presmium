<script setup lang="ts">
import { useMessages } from '@lincyaw/host'
import { computed } from 'vue'
import { clockText, LECTURE_MESSAGES, stepStops } from '../domain/index.ts'
import type { TimedEvent, TrackChapter } from '../domain/index.ts'

const props = defineProps<{ chapters: readonly TrackChapter[], events: readonly TimedEvent[], time: number }>()
const emit = defineEmits<{ seek: [t: number] }>()

const t = useMessages(LECTURE_MESSAGES)
const entries = computed(() => [
  ...props.chapters.map(c => ({ ...c, step: undefined })),
  ...stepStops(props.events).filter(s => s.step > 0).map(s => ({ ...s, title: t.value.player.step(s.step) })),
].sort((a, b) => a.t - b.t))
const entry = computed(() => entries.value.filter(e => e.t <= props.time).at(-1))
</script>

<template>
  <ol class="pm-lecture-chapters">
    <li v-for="c in entries" :key="`${c.t}:${c.title}`" :aria-current="entry === c ? 'true' : undefined">
      <button
        v-if="c.step !== undefined"
        type="button"
        class="pm-lecture-chapters__step"
        :data-section="c.section"
        :data-step="c.step"
        @click="emit('seek', c.t)"
      >
        <span class="pm-lecture-chapters__time">{{ clockText(c.t) }}</span> {{ c.title }}
      </button>
      <button v-else type="button" class="pm-lecture-chapters__item" :data-section="c.section" @click="emit('seek', c.t)">
        <span class="pm-lecture-chapters__time">{{ clockText(c.t) }}</span> {{ c.title }}
      </button>
    </li>
  </ol>
</template>
