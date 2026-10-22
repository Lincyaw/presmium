<script setup lang="ts">
// A bar that fills with an animation, or shows full at once with reduced motion.
import { usePrefersReducedMotion } from '@lincyaw/host'

const reduced = usePrefersReducedMotion()
</script>

<template>
  <div class="demo-animated" :data-motion="reduced ? 'reduced' : 'full'">
    <div class="demo-animated__bar" :class="{ 'demo-animated__bar--animate': !reduced }" />
  </div>
</template>

<style scoped>
.demo-animated {
  height: 0.75rem;
  border-radius: var(--pm-radius-pill);
  background: var(--pm-color-sunk);
  overflow: hidden;
}
.demo-animated__bar {
  height: 100%;
  background: var(--pm-color-accent);
  transform-origin: left;
}
.demo-animated__bar--animate {
  animation: demo-fill 2.5s ease-out both;
}
@keyframes demo-fill {
  from {
    transform: scaleX(0);
  }
  to {
    transform: scaleX(1);
  }
}
</style>
