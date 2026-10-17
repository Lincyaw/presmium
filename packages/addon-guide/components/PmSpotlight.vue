<script setup lang="ts">
import CueNote from '../src/client/CueNote.vue'
import { requestSpotlight, useCue } from '../src/client/index.ts'

const props = defineProps<{
  /** CSS selector of the element to spotlight, looked up in this slide. */
  target: string
  /** First step of the spotlight (default 0, the step its block appears at). */
  at?: number | string
  /** Step at which it ends (exclusive); open-ended when absent. */
  until?: number | string
  /** Popover next to the spotlight. */
  title?: string
  text?: string
}>()

// On the audience's slide driver.js dims the page around the target; elsewhere the target is outlined.
// In the web form's page views, its title and text show in place.
const { anchor, look, note, steps } = useCue(props, 'data-pm-spotlight', requestSpotlight)
</script>

<template>
  <CueNote :title="title" :text="text" :state="note" />
  <span ref="anchor" class="pm-spotlight" hidden :data-target="target" :data-look="look ?? 'off'">
    <span v-for="step in steps" :key="step" v-click="step" />
  </span>
</template>

<style>
/* The page-level effect's layering is in src/client/spotlight.css. */
/* A spotlight in place: the warning tone's frame, apart from the accent of what is selected (N-10). */
[data-pm-spotlight='inline'] {
  outline: 3px solid var(--pm-color-warn);
  outline-offset: 4px;
  border-radius: var(--pm-radius-chip);
}
</style>
