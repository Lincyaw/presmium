<script setup lang="ts">
import { useMessages } from '@presmium/host'
import { useHighContrast } from '../src/client/contrast.ts'
import { MESSAGES } from '../src/domain/index.ts'

// `compact` shows the icon only, as in the hosts' toolbars.
defineProps<{ compact?: boolean }>()

const { enabled, toggle } = useHighContrast()
const t = useMessages(MESSAGES)
</script>

<template>
  <button
    type="button"
    role="switch"
    class="pm-contrast-toggle pm-ui-button pm-ui-button--small"
    :class="{ 'pm-contrast-toggle--compact pm-ui-button--ghost': compact }"
    :aria-checked="enabled"
    :aria-label="t.highContrast"
    :title="t.highContrast"
    @click="toggle"
  >
    <span class="pm-contrast-toggle__icon" aria-hidden="true">◐</span>
    <span v-if="!compact">{{ t.highContrastState(enabled) }}</span>
  </button>
</template>

<style>
/* The host's button (N-10); on, it is the switch that is on, in the accent. */
.pm-contrast-toggle {
  border-radius: var(--pm-radius-pill);
}
.pm-contrast-toggle--compact {
  padding-inline: 0.45em;
}
.pm-contrast-toggle[aria-checked='true'] {
  border-color: var(--pm-color-accent);
  background: var(--pm-color-accent);
  color: var(--pm-color-on-accent);
}
.pm-contrast-toggle[aria-checked='true'] .pm-contrast-toggle__icon {
  transform: rotate(180deg);
}
</style>
