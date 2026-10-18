<script setup lang="ts">
import CueNote from '../src/client/CueNote.vue'
import { requestSpotlight, useCue } from '../src/client/index.ts'

const props = defineProps<{
  target: string
  at?: number | string
  until?: number | string
  title?: string
  text?: string
}>()

const { anchor, look, note, steps } = useCue(props, 'data-pm-spotlight', requestSpotlight)
</script>

<template>
  <CueNote :title="title" :text="text" :state="note" />
  <span ref="anchor" class="pm-spotlight" hidden :data-target="target" :data-look="look ?? 'off'">
    <span v-for="step in steps" :key="step" v-click="step" />
  </span>
</template>

<style>
[data-pm-spotlight='inline'] {
  outline: 3px solid var(--pm-color-warn);
  outline-offset: 4px;
  border-radius: var(--pm-radius-chip);
}
</style>
