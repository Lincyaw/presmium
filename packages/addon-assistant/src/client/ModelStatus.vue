<script setup lang="ts">
// The model of the AI changes in a status bar (the workspace's home page and edit mode; docs/design/edit.dc.html):
// its provider and where it comes from (`AssistantInfo.source`: the environment, the workspace's configuration, the
// page's model settings), or that none is configured; it opens the model settings.
import { useMessages } from '@presmium/host'
import { computed, ref } from 'vue'
import { ASSISTANT_MESSAGES } from '../domain/index.ts'
import { CLIENT_MESSAGES } from './messages.ts'
import ModelSettings from './ModelSettings.vue'
import { assistant } from './state.ts'

const t = useMessages(ASSISTANT_MESSAGES)
const c = useMessages(CLIENT_MESSAGES)
const settings = ref<InstanceType<typeof ModelSettings>>()
const info = computed(() => assistant.value?.info.value)
const text = computed(() => {
  const now = info.value
  return now?.provider ? c.value.status.model(now.provider, t.value.edit.source[now.source ?? 'environment']) : c.value.status.none
})
</script>

<template>
  <span v-if="info" class="pm-assistant-status" :data-source="info.provider ? info.source ?? 'environment' : 'none'">
    <button type="button" class="pm-assistant-status__button" :title="c.status.title" @click="settings?.open()">
      <span class="pm-ui-dot" :class="{ 'pm-ui-dot--warn': !info.provider }" aria-hidden="true" />{{ text }}
    </button>
    <ModelSettings ref="settings" />
  </span>
</template>

<style scoped>
.pm-assistant-status {
  display: inline-flex;
  align-items: center;
}
/* Text of the status bar that is a button: its font and colour, a frame only for the keyboard's focus. */
.pm-assistant-status__button {
  display: inline-flex;
  align-items: center;
  gap: 0.375rem;
  margin: 0;
  padding: 0 0.25rem;
  border: 0;
  border-radius: var(--pm-radius-small);
  background: transparent;
  color: inherit;
  font: inherit;
  cursor: pointer;
}
.pm-assistant-status__button:hover {
  color: var(--pm-color-ink);
}
.pm-assistant-status__button:focus-visible {
  outline: 2px solid var(--pm-color-accent);
  outline-offset: 1px;
}
</style>
