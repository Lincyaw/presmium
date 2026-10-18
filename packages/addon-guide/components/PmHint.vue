<script setup lang="ts">
import CueNote from '../src/client/CueNote.vue'
import { requestHint, useCue } from '../src/client/index.ts'

const props = defineProps<{
  target: string
  at?: number | string
  until?: number | string
  title?: string
  text?: string
}>()

const { anchor, look, note, steps } = useCue(props, 'data-pm-hint', requestHint)
</script>

<template>
  <CueNote :title="title" :text="text" :state="note" />
  <span ref="anchor" class="pm-hint" hidden :data-target="target" :data-look="look ?? 'off'">
    <span v-for="step in steps" :key="step" v-click="step" />
  </span>
</template>

<style>
[data-pm-hint='inline'] {
  outline: 2px solid var(--pm-color-accent);
  outline-offset: 3px;
  animation: pm-hint-ring 1.8s ease-out infinite;
}
@keyframes pm-hint-ring {
  from {
    outline-offset: 2px;
    outline-color: var(--pm-color-accent);
  }
  to {
    outline-offset: 10px;
    outline-color: transparent;
  }
}
@media (prefers-reduced-motion: reduce) {
  [data-pm-hint='inline'] {
    animation: none;
  }
}
</style>
