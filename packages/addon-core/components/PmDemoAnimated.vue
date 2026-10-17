<script setup lang="ts">
import { usePrefersReducedMotion } from '@presmium/host'

// With reduced motion the bar is drawn in its final state without animating.
const reduced = usePrefersReducedMotion()
</script>

<template>
  <div class="pm-demo-animated" :data-motion="reduced ? 'reduced' : 'full'">
    <div class="pm-demo-animated__bar" :class="{ 'pm-demo-animated__bar--animate': !reduced }" />
  </div>
</template>

<style scoped>
.pm-demo-animated {
  height: 0.75rem;
  border-radius: var(--pm-radius-pill);
  background: var(--pm-color-sunk);
  overflow: hidden;
}
.pm-demo-animated__bar {
  height: 100%;
  background: var(--pm-color-accent);
  transform-origin: left;
}
.pm-demo-animated__bar--animate {
  animation: pm-demo-fill 2.5s ease-out both;
}
@keyframes pm-demo-fill {
  from {
    transform: scaleX(0);
  }
  to {
    transform: scaleX(1);
  }
}
</style>
