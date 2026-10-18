<script setup lang="ts">
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
