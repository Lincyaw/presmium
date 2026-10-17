<script setup lang="ts">
// The model settings of the AI changes (P-111, N-08), in a dialog: what is in effect and where it comes from
// (the environment comes first), and the page's own settings: DeepSeek's official address or a
// Messages-compatible one with its provider's name, the key, the model's name. The server saves them in the
// user's configuration directory and the next change task uses them; the page never gets the key back, only
// whether one is set. Kept apart from a reader's own model service for questions (./AskSettings.vue).
import { useMessages, useServer } from '@presmium/host'
import { computed, ref } from 'vue'
import { ASSISTANT_ID, ASSISTANT_MESSAGES } from '../domain/index.ts'
import type { ModelSettingsView } from '../domain/index.ts'
import { assistant } from './state.ts'

const t = useMessages(ASSISTANT_MESSAGES)
const server = useServer()
const dialog = ref<HTMLDialogElement>()
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
  dialog.value?.showModal()
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
</script>

<template>
  <button type="button" class="pm-assistant-model__open" @click="open">
    {{ t.edit.settings }}
  </button>
  <Teleport to="body">
    <dialog ref="dialog" class="pm-assistant-model" :aria-label="t.settings.title" @keydown.stop>
      <form method="dialog" class="pm-assistant-model__form" @submit.prevent="save">
        <h2>{{ t.settings.title }}</h2>
        <p>{{ t.settings.intro }}</p>
        <p v-if="view" class="pm-assistant-model__effect" role="status">
          {{ t.settings.inEffect(effect, view.provider) }}
        </p>
        <p v-if="view?.source === 'environment' || view?.source === 'workspace'" class="pm-assistant-model__note">
          {{ t.settings.envFirst }}
        </p>
        <label>
          <span>{{ t.settings.service }}</span>
          <select v-model="service" name="service">
            <option value="deepseek">{{ t.settings.deepseek }}</option>
            <option value="custom">{{ t.settings.custom }}</option>
          </select>
        </label>
        <template v-if="service === 'custom'">
          <label>
            <span>{{ t.settings.provider }}</span>
            <input v-model="provider" name="provider" type="text" required autocomplete="off">
          </label>
          <label>
            <span>{{ t.settings.url }}</span>
            <input v-model="url" name="url" type="url" required autocomplete="off" spellcheck="false">
          </label>
        </template>
        <label>
          <span>{{ t.settings.key(Boolean(view?.saved.key)) }}</span>
          <input v-model="key" name="key" type="password" :required="!view?.saved.key" autocomplete="off" spellcheck="false">
        </label>
        <label>
          <span>{{ t.settings.model }}</span>
          <input v-model="model" name="model" type="text" :placeholder="t.settings.modelDefault" autocomplete="off" spellcheck="false">
        </label>
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
          <button type="submit" :disabled="busy || !view">
            {{ t.settings.save }}
          </button>
          <button v-if="view?.saved.key" type="button" :disabled="busy" @click="clear">
            {{ t.settings.clear }}
          </button>
          <button type="button" @click="dialog?.close()">
            {{ t.settings.close }}
          </button>
        </p>
      </form>
    </dialog>
  </Teleport>
</template>

<style scoped>
.pm-assistant-model {
  box-sizing: border-box;
  width: min(30rem, calc(100vw - 2rem));
  padding: 1rem;
  border: 1px solid rgba(125, 125, 125, 0.4);
  border-radius: 0.375rem;
  background: var(--vp-c-bg, var(--slidev-theme-background, #fff));
  color: var(--vp-c-text-1, inherit);
  font-size: 0.875rem;
  line-height: 1.5;
  text-align: left;
}
.pm-assistant-model__form {
  display: grid;
  gap: 0.5rem;
}
.pm-assistant-model h2,
.pm-assistant-model p {
  margin: 0;
}
.pm-assistant-model h2 {
  font-size: 1rem;
}
.pm-assistant-model label {
  display: grid;
  gap: 0.15rem;
}
.pm-assistant-model input,
.pm-assistant-model select {
  box-sizing: border-box;
  width: 100%;
  padding: 0.15rem 0.3rem;
  border: 1px solid rgba(125, 125, 125, 0.5);
  border-radius: 0.25rem;
  background: transparent;
  color: inherit;
  font: inherit;
}
.pm-assistant-model__note,
.pm-assistant-model__effect {
  color: var(--vp-c-text-2, inherit);
}
.pm-assistant-model__failure {
  color: #dc2626;
}
.pm-assistant-model__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
}
.pm-assistant-model button,
.pm-assistant-model__open {
  padding: 0.1rem 0.5rem;
  border: 1px solid rgba(125, 125, 125, 0.5);
  border-radius: 0.25rem;
  background: transparent;
  color: inherit;
  font: inherit;
  font-size: 0.8125rem;
  cursor: pointer;
}
</style>
