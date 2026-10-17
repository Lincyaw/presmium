<script setup lang="ts">
// The model settings of the AI changes (P-111, N-08), in the host's dialog, which its opener opens (`open()`):
// what is in effect and where it comes from (the environment comes first), and the page's own settings: DeepSeek's
// official address or a Messages-compatible one with its provider's name, the key, the model's name. The server
// saves them in the user's configuration directory and the next change task uses them; the page never gets the key
// back, only whether one is set. A saved key stays only while the service, its provider and its address stay: once
// one of them changes the key is asked for again, as the server requires. Kept apart from a reader's own model
// service for questions (./AskSettings.vue).
import { PmButton, PmDialog, PmField, PmNotice, useMessages, useServer } from '@presmium/host'
import { computed, ref } from 'vue'
import { ASSISTANT_ID, ASSISTANT_MESSAGES } from '../domain/index.ts'
import type { ModelSettingsView } from '../domain/index.ts'
import { CLIENT_MESSAGES } from './messages.ts'
import { assistant } from './state.ts'

const t = useMessages(ASSISTANT_MESSAGES)
const c = useMessages(CLIENT_MESSAGES)
const server = useServer()
const shown = ref(false)
const view = ref<ModelSettingsView>()
const service = ref<'deepseek' | 'custom'>('deepseek')
const provider = ref('')
const url = ref('')
const key = ref('')
const model = ref('')
const status = ref('')
const failure = ref('')
const busy = ref(false)

/** What is in effect, in words. */
const effect = computed(() => {
  const now = view.value
  if (!now) return ''
  if (now.source === 'environment') return t.value.settings.fromEnvironment((now.from ?? []).join(', '))
  if (now.source === 'workspace') return t.value.settings.fromWorkspace
  if (now.source === 'page') return t.value.settings.fromPage
  return t.value.settings.none
})

/** The service, its provider or its address differ from what was saved: a saved key does not go with them. */
const changed = computed(() => {
  const saved = view.value?.saved
  if (!saved) return false
  if ((service.value === 'custom') !== Boolean(saved.url)) return true
  return service.value === 'custom' && (url.value.trim() !== (saved.url ?? '') || provider.value.trim() !== (saved.provider ?? ''))
})
/** The saved key is kept when the field stays empty. */
const keeps = computed(() => Boolean(view.value?.saved.key) && !changed.value)
const keyLabel = computed(() => (view.value?.saved.key && changed.value ? c.value.keyChanged : t.value.settings.key(keeps.value)))

function show(next: ModelSettingsView): void {
  view.value = next
  service.value = next.saved.url ? 'custom' : 'deepseek'
  provider.value = next.saved.provider ?? ''
  url.value = next.saved.url ?? ''
  model.value = next.saved.model ?? ''
  key.value = ''
}

async function call(init?: RequestInit): Promise<void> {
  busy.value = true
  failure.value = ''
  try {
    const response = await server.fetch(ASSISTANT_ID, 'settings', init)
    const body = await response.json().catch(() => ({})) as ModelSettingsView & { error?: string }
    if (response.status === 403) throw new Error(t.value.settings.forbidden)
    if (!response.ok) throw new Error(body.error ?? `${response.status}`)
    show(body)
    if (init) {
      status.value = t.value.settings.saved
      await assistant.value?.refresh()
    }
  } catch (error) {
    failure.value = init ? t.value.settings.failed(error instanceof Error ? error.message : String(error)) : (error instanceof Error ? error.message : String(error))
  } finally {
    busy.value = false
  }
}

/** Opens the dialog with the settings as the server has them now. */
async function open(): Promise<void> {
  status.value = ''
  shown.value = true
  await call()
}

function save(): void {
  const custom = service.value === 'custom'
  const body = {
    ...custom ? { provider: provider.value.trim(), url: url.value.trim() } : {},
    ...key.value.trim() ? { key: key.value.trim() } : {},
    ...model.value.trim() ? { model: model.value.trim() } : {},
  }
  void call({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
}

function clear(): void {
  void call({ method: 'DELETE' })
}

defineExpose({ open })
</script>

<template>
  <PmDialog v-model:open="shown" :label="t.settings.title" :close-label="t.settings.close" name="pm-assistant-model">
    <form class="pm-assistant-model__form" @submit.prevent="save" @keydown.stop>
      <p>{{ t.settings.intro }}</p>
      <PmNotice v-if="view" class="pm-assistant-model__effect" :tone="view.source === 'none' ? 'warn' : 'ok'">
        {{ t.settings.inEffect(effect, view.provider) }}
      </PmNotice>
      <p v-if="view?.source === 'environment' || view?.source === 'workspace'" class="pm-assistant-model__note">
        {{ t.settings.envFirst }}
      </p>
      <PmField :label="t.settings.service">
        <select v-model="service" class="pm-ui-select" name="service">
          <option value="deepseek">
            {{ t.settings.deepseek }}
          </option>
          <option value="custom">
            {{ t.settings.custom }}
          </option>
        </select>
      </PmField>
      <template v-if="service === 'custom'">
        <PmField :label="t.settings.provider">
          <input v-model="provider" class="pm-ui-input" name="provider" type="text" required autocomplete="off">
        </PmField>
        <PmField :label="t.settings.url">
          <input v-model="url" class="pm-ui-input" name="url" type="url" required autocomplete="off" spellcheck="false">
        </PmField>
      </template>
      <PmField :label="keyLabel">
        <input v-model="key" class="pm-ui-input" name="key" type="password" :required="!keeps" autocomplete="off" spellcheck="false">
      </PmField>
      <PmField :label="t.settings.model">
        <input v-model="model" class="pm-ui-input" name="model" type="text" :placeholder="t.settings.modelDefault" autocomplete="off" spellcheck="false">
      </PmField>
      <p v-if="view" class="pm-assistant-model__note">
        {{ t.settings.stored(view.file) }}
      </p>
      <p v-if="failure" class="pm-assistant-model__failure" role="alert">
        {{ failure }}
      </p>
      <p v-else-if="status" class="pm-assistant-model__saved" role="status">
        {{ status }}
      </p>
      <p class="pm-assistant-model__actions">
        <PmButton type="submit" variant="primary" :disabled="busy || !view">
          {{ t.settings.save }}
        </PmButton>
        <PmButton v-if="view?.saved.key" variant="danger" :disabled="busy" @click="clear">
          {{ t.settings.clear }}
        </PmButton>
      </p>
    </form>
  </PmDialog>
</template>

<style>
/* The dialog moves to the end of the document (PmDialog): these rules are not scoped to the opener. */
/* A long word (the file's path, a variable's name) breaks rather than widening the dialog past a phone's screen. */
.pm-assistant-model__form {
  display: grid;
  gap: var(--pm-space-3);
  overflow-wrap: anywhere;
}
.pm-assistant-model__form > * {
  min-width: 0;
}
.pm-assistant-model__form p {
  margin: 0;
}
.pm-assistant-model__note {
  color: var(--pm-color-muted);
  font-size: var(--pm-text-sm);
}
.pm-assistant-model__failure {
  color: var(--pm-color-danger);
}
.pm-assistant-model__saved {
  color: var(--pm-color-ok);
}
.pm-assistant-model__actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--pm-space-2);
}
</style>
