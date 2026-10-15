<script setup lang="ts">
import { PmBoundary } from '@presmium/host'
import { requestHint, useCue } from '../src/client/index.ts'

const props = defineProps<{
  /** CSS selector of the interactive element to point at, looked up in this slide. */
  target: string
  /** First step of the hint (default 1). */
  at?: number | string
  /** Step at which it ends (exclusive); open-ended when absent. */
  until?: number | string
  /** Popover shown when the beacon is clicked. */
  title?: string
  text?: string
}>()

// On the audience's slide a driver.js beacon pulses at the target; elsewhere a ring pulses around it.
const { anchor, look, steps } = useCue(props, 'data-pm-hint', requestHint)
</script>

<template>
  <PmBoundary name="PmHint">
    <span ref="anchor" class="pm-hint" hidden :data-target="target" :data-look="look ?? 'off'">
      <span v-for="step in steps" :key="step" v-click="step" />
    </span>
  </PmBoundary>
</template>

<style>
.pm-hint-beacon {
  --driver-hint-size: 32px;
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
