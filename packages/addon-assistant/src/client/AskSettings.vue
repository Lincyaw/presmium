<script setup lang="ts">
import { PmButton, PmField, PmNotice, useMessages } from '@lincyaw/host'
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
    <h3 class="pm-assistant-settings__title">
      {{ t.ask.title }}
    </h3>
    <p class="pm-assistant-settings__intro">
      {{ t.ask.intro }}
    </p>
    <PmNotice class="pm-assistant-settings__storage" tone="warn" role="note">
      {{ t.ask.storage }}
    </PmNotice>
    <PmField :label="t.ask.url">
      <input v-model="url" class="pm-ui-input" name="url" type="url" required :placeholder="t.ask.urlPlaceholder" autocomplete="off" spellcheck="false" @keydown.stop>
    </PmField>
    <PmField :label="t.ask.key">
      <input v-model="key" class="pm-ui-input" name="key" type="password" required autocomplete="off" spellcheck="false" @keydown.stop>
    </PmField>
    <PmField :label="t.ask.model">
      <input v-model="model" class="pm-ui-input" name="model" type="text" required :placeholder="t.ask.modelPlaceholder" autocomplete="off" spellcheck="false" @keydown.stop>
    </PmField>
    <p v-if="problem" class="pm-assistant-settings__problem" role="alert">
      {{ problem }}
    </p>
    <p class="pm-assistant-settings__actions">
      <PmButton type="submit" variant="primary" small>
        {{ t.ask.save }}
      </PmButton>
      <PmButton v-if="askSettings" small @click="emit('done')">
        {{ t.ask.cancel }}
      </PmButton>
      <PmButton v-if="askSettings" variant="danger" small @click="clear">
        {{ t.ask.clear }}
      </PmButton>
    </p>
  </form>
</template>

<style scoped>
.pm-assistant-settings {
  display: grid;
  gap: var(--pm-space-3);
}
.pm-assistant-settings p {
  margin: 0;
}
.pm-assistant-settings__title {
  margin: 0;
  font-family: var(--pm-font-serif);
  font-size: var(--pm-text-title);
  font-weight: 600;
  line-height: var(--pm-leading-tight);
}
.pm-assistant-settings__intro {
  color: var(--pm-color-muted);
}
.pm-assistant-settings__actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--pm-space-2);
}
.pm-assistant-settings__problem {
  color: var(--pm-color-danger);
}
</style>
