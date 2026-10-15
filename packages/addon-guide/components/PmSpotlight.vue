<script setup lang="ts">
import { PmBoundary } from '@presmium/host'
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
const { anchor, look, steps } = useCue(props, 'data-pm-spotlight', requestSpotlight)
</script>

<template>
  <PmBoundary name="PmSpotlight">
    <span ref="anchor" class="pm-spotlight" hidden :data-target="target" :data-look="look ?? 'off'">
      <span v-for="step in steps" :key="step" v-click="step" />
    </span>
  </PmBoundary>
</template>

<style>
/* The dimming lies just above the slide, under the host's own layers (the overview, dialogs),
   and lets pointer events through. driver.js sets the overlay's z-index and the path's pointer
   events inline. */
.driver-overlay {
  z-index: 1 !important;
}
.driver-overlay,
.driver-overlay * {
  pointer-events: none !important;
}
body .driver-popover.pm-spotlight-popover {
  z-index: 2;
}
[data-pm-spotlight='inline'] {
  outline: 3px solid #f59e0b;
  outline-offset: 4px;
  border-radius: 4px;
}
</style>
