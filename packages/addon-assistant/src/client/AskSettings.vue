<script setup lang="ts">
// The reader's model service (P-112, E-9): how questions are answered and where the settings stay (this
// site's browser storage, which the site's scripts can read), then the address, key and model of an
// OpenAI-compatible Chat Completions service. Shown in the question panel until it is filled in, and when the
// reader changes it.
import { useMessages } from '@presmium/host'
import { ref } from 'vue'
import { ASSISTANT_MESSAGES, askUrlValid } from '../domain/index.ts'
import { askSettings, saveAskSettings } from './ask.ts'

const emit = defineEmits<{ done: [] }>()

const t = useMessages(ASSISTANT_MESSAGES)
const url = ref(askSettings.value?.url ?? '')
const key = ref(askSettings.value?.key ?? '')
const model = ref(askSettings.value?.model ?? '')
const problem = ref('')

function save(): void {
  if (!askUrlValid(url.value.trim())) {
    problem.value = t.value.ask.invalidUrl
    return
  }
  saveAskSettings({ url: url.value.trim(), key: key.value.trim(), model: model.value.trim() })
  emit('done')
}

function clear(): void {
  saveAskSettings(undefined)
  url.value = key.value = model.value = ''
}
</script>

<template>
  <form class="pm-assistant-settings" :aria-label="t.ask.title" @submit.prevent="save">
    <h3>{{ t.ask.title }}</h3>
    <p class="pm-assistant-settings__intro">
      {{ t.ask.intro }}
    </p>
    <p class="pm-assistant-settings__storage" role="note">
      {{ t.ask.storage }}
    </p>
    <label>
      <span>{{ t.ask.url }}</span>
      <input v-model="url" name="url" type="url" required :placeholder="t.ask.urlPlaceholder" autocomplete="off" spellcheck="false" @keydown.stop>
    </label>
    <label>
      <span>{{ t.ask.key }}</span>
      <input v-model="key" name="key" type="password" required autocomplete="off" spellcheck="false" @keydown.stop>
    </label>
    <label>
      <span>{{ t.ask.model }}</span>
      <input v-model="model" name="model" type="text" required :placeholder="t.ask.modelPlaceholder" autocomplete="off" spellcheck="false" @keydown.stop>
    </label>
    <p v-if="problem" class="pm-assistant-settings__problem" role="alert">
      {{ problem }}
    </p>
    <p class="pm-assistant-settings__actions">
      <button type="submit">
        {{ t.ask.save }}
      </button>
      <button v-if="askSettings" type="button" @click="emit('done')">
        {{ t.ask.cancel }}
      </button>
      <button v-if="askSettings" type="button" @click="clear">
        {{ t.ask.clear }}
      </button>
    </p>
  </form>
</template>

<style scoped>
.pm-assistant-settings {
  display: grid;
  gap: 0.4rem;
}
.pm-assistant-settings h3 {
  margin: 0;
  font-size: 0.9rem;
}
.pm-assistant-settings__intro,
.pm-assistant-settings__storage {
  color: var(--vp-c-text-2, inherit);
}
.pm-assistant-settings label {
  display: grid;
  gap: 0.15rem;
}
.pm-assistant-settings__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
}
.pm-assistant-settings__problem {
  color: #dc2626;
}
.pm-assistant-settings button {
  padding: 0.1rem 0.5rem;
  border: 1px solid rgba(125, 125, 125, 0.5);
  border-radius: 0.25rem;
  background: transparent;
  color: inherit;
  font: inherit;
  cursor: pointer;
}
.pm-assistant-settings input {
  box-sizing: border-box;
  width: 100%;
  padding: 0.15rem 0.3rem;
  border: 1px solid rgba(125, 125, 125, 0.5);
  border-radius: 0.25rem;
  background: transparent;
  color: inherit;
  font: inherit;
}
</style>
