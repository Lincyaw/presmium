<script setup lang="ts">
// The {greeting} directive's component, one for the web page and the slides: it uses
// @presmium/host and Vue only, never @slidev/* or vitepress, so the host of either form serves
// it. Its text follows the page's language. Served by `presmium dev` or `presmium serve`, it can
// wave: the plugin's server route counts the waves; a built site has no server and no button.
import { PmButton, useMessages, useServer } from '@presmium/host'
import { ref } from 'vue'
import { GREETING_MESSAGES, PLUGIN_ID } from '../src/domain/index.ts'
import type { Waves } from '../src/domain/index.ts'

defineProps<{ name: string }>()

const t = useMessages(GREETING_MESSAGES)
const server = useServer()
const waves = ref<number>()

async function wave(): Promise<void> {
  const response = await server.fetch(PLUGIN_ID, 'waves', { method: 'POST' })
  if (response.ok) waves.value = ((await response.json()) as Waves).waves
}
</script>

<template>
  <div class="greeting-card">
    <p class="greeting-card__text">
      {{ t.greeting(name) }}
    </p>
    <p v-if="server.available" class="greeting-card__waves">
      <PmButton small @click="wave">
        {{ t.wave }}
      </PmButton>
      <span v-if="waves !== undefined" class="greeting-card__count">{{ t.waves(waves) }}</span>
    </p>
  </div>
</template>

<style scoped>
/* The design system's tokens only (colors, fonts, spacing; light and dark). The sizes are em, so the
   card scales with the text around it, as the slides and the present view scale it. */
.greeting-card {
  --pm-text-sm: 0.875em;
  --pm-text-md: 0.9375em;

  margin: 0.75em 0;
  padding: 0.75em 1em;
  border: 1px solid var(--pm-color-line);
  border-radius: var(--pm-radius-control);
  background: var(--pm-color-surface);
  color: var(--pm-color-ink);
  font-family: var(--pm-font-sans);
}

.greeting-card__text {
  margin: 0;
  color: var(--pm-color-accent);
  font-size: 1.25em;
}

.greeting-card__waves {
  display: flex;
  align-items: center;
  gap: 0.75em;
  margin: 0.5em 0 0;
}

.greeting-card__count {
  color: var(--pm-color-muted);
  font-size: var(--pm-text-sm);
}
</style>
