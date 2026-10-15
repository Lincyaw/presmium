<script setup lang="ts">
import { PmBoundary } from '@presmium/host'
import { useHighContrast } from '../src/client/contrast.ts'

// `compact` shows the icon only, for the slides form's navigation bar.
defineProps<{ compact?: boolean }>()

const { enabled, toggle } = useHighContrast()
</script>

<template>
  <PmBoundary name="PmContrastToggle">
    <button
      type="button"
      role="switch"
      class="pm-contrast-toggle"
      :class="{ 'pm-contrast-toggle--compact': compact }"
      :aria-checked="enabled"
      aria-label="高对比度"
      title="高对比度"
      @click="toggle"
    >
      <span class="pm-contrast-toggle__icon" aria-hidden="true">◐</span>
      <span v-if="!compact">高对比度：{{ enabled ? '开' : '关' }}</span>
    </button>
  </PmBoundary>
</template>

<style>
.pm-contrast-toggle {
  display: inline-flex;
  align-items: center;
  gap: 0.4em;
  padding: 0.2em 0.7em;
  border: 1px solid currentColor;
  border-radius: 999px;
  background: transparent;
  color: inherit;
  font: inherit;
  cursor: pointer;
}
.pm-contrast-toggle--compact {
  padding: 0.25em 0.45em;
  border-color: transparent;
}
.pm-contrast-toggle[aria-checked='true'] .pm-contrast-toggle__icon {
  transform: rotate(180deg);
}
</style>
