<script setup lang="ts">
import CueNote from '../src/client/CueNote.vue'
import { requestHint, useCue } from '../src/client/index.ts'

const props = defineProps<{
  /** CSS selector of the interactive element to point at, looked up in this slide. */
  target: string
  /** First step of the hint (default 0, the step its block appears at). */
  at?: number | string
  /** Step at which it ends (exclusive); open-ended when absent. */
  until?: number | string
  /** Popover shown when the beacon is clicked. */
  title?: string
  text?: string
}>()

// On the audience's slide a driver.js beacon pulses at the target; elsewhere a ring pulses around it.
// In the web form's page views, its title and text show in place.
const { anchor, look, note, steps } = useCue(props, 'data-pm-hint', requestHint)
</script>

<template>
  <CueNote :title="title" :text="text" :state="note" />
  <span ref="anchor" class="pm-hint" hidden :data-target="target" :data-look="look ?? 'off'">
    <span v-for="step in steps" :key="step" v-click="step" />
  </span>
</template>

<style>
.pm-hint-beacon {
  --driver-hint-size: 32px;
}
/* Like the spotlight, beacons and their popover lie just above the slide, under the host's own layers. */
body .driver-hint.pm-hint-beacon,
body .driver-popover.pm-hint-popover {
  z-index: calc(var(--pm-cue-z, 1) + 1);
}
[data-pm-hint='inline'] {
  outline: 2px solid #818cf8;
  outline-offset: 3px;
  animation: pm-hint-ring 1.8s ease-out infinite;
}
@keyframes pm-hint-ring {
  from {
    outline-offset: 2px;
    outline-color: rgb(129 140 248 / 0.9);
  }
  to {
    outline-offset: 10px;
    outline-color: rgb(129 140 248 / 0);
  }
}
@media (prefers-reduced-motion: reduce) {
  [data-pm-hint='inline'] {
    animation: none;
  }
}
</style>
