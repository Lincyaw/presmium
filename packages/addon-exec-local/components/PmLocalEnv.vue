<script setup lang="ts">
import { useService, useStartReport } from '@lincyaw/host'
import { errorMessage, languageId } from '@lincyaw/kernel'
import type { RunResult } from '@lincyaw/kernel'
import { computed, ref, shallowRef, watch } from 'vue'
import { useMessages } from '../src/client/messages.ts'
import { archiveName, disconnected, LOCAL_ENV } from '../src/domain/index.ts'
import type { LocalEnvStatus } from '../src/domain/index.ts'

const props = withDefaults(defineProps<{
  file: string
  lang?: string
  code?: string
  archive?: string
  devcontainer?: string
}>(), { lang: 'python', code: '' })

const env = useService(LOCAL_ENV)
const report = useStartReport()
const t = useMessages()
const probed = shallowRef<LocalEnvStatus>()
watch(env, async (service) => {
  if (service) probed.value = await service.status()
}, { immediate: true })
const status = computed(() => probed.value ?? (report.value && !env.value ? disconnected('pluginOff') : undefined))

const editing = ref(false)
const draft = ref('')
const busy = ref<string>()
const output = shallowRef<RunResult>()
const error = ref<string>()

const state = computed(() => !status.value ? 'pending' : status.value.connected ? 'connected' : 'disconnected')
const canRun = computed(() => !!status.value?.languages.includes(languageId(props.lang)))
const notice = computed(() => {
  const current = status.value
  if (!current) return t.value.connecting
  if (!current.connected) return current.reason && t.value[current.reason]
  const missing = [!current.docker && t.value.noDocker, !current.devcontainer && t.value.noDefinition].filter(Boolean)
  return missing.length ? missing.join(t.value.separator) : undefined
})
const connected = computed(() => !!status.value?.connected)
const canExport = computed(() => (connected.value ? !!status.value?.devcontainer : !!props.archive))

function currentCode(): string {
  const text = editing.value ? draft.value : props.code
  return text.endsWith('\n') ? text : `${text}\n`
}

function edit() {
  draft.value = currentCode()
  editing.value = true
}

async function act<T>(name: string, task: (service: NonNullable<typeof env.value>) => Promise<T>): Promise<T | undefined> {
  const service = env.value
  if (!service || busy.value) return
  busy.value = name
  error.value = undefined
  try {
    return await task(service)
  }
  catch (e) {
    error.value = errorMessage(e)
  }
  finally {
    busy.value = undefined
  }
}

async function run() {
  output.value = await act('run', service => service.run({ lang: props.lang, code: currentCode() })) ?? output.value
}

function builtArchive(): Blob {
  const bytes = Uint8Array.from(atob(props.archive ?? ''), c => c.charCodeAt(0))
  return new Blob([bytes], { type: 'application/zip' })
}

async function replicate() {
  const archive = connected.value
    ? await act('replicate', service => service.replicate({ file: props.file, content: currentCode(), lang: props.lang }))
    : builtArchive()
  if (!archive) return
  const link = document.createElement('a')
  link.href = URL.createObjectURL(archive)
  link.download = archiveName(props.file)
  link.click()
  setTimeout(() => URL.revokeObjectURL(link.href), 1000)
}
</script>

<template>
  <section class="pm-local-env" :data-state="state">
    <header class="pm-local-env__header">
      <code>{{ file }}</code>
      <span v-if="status?.devcontainer ?? devcontainer" class="pm-local-env__badge pm-ui-badge">{{ t.container(status?.devcontainer ?? devcontainer ?? '') }}</span>
    </header>
    <div v-show="!editing" class="pm-local-env__source">
      <slot />
    </div>
    <textarea
      v-if="editing"
      v-model="draft"
      class="pm-local-env__editor pm-ui-textarea"
      spellcheck="false"
      :aria-label="t.editFile(file)"
      @keydown.stop
    />
    <div v-if="connected || archive" class="pm-local-env__actions">
      <template v-if="connected">
        <button v-if="!editing" type="button" class="pm-ui-button pm-ui-button--small" data-action="edit" @click="edit">
          {{ t.edit }}
        </button>
        <button type="button" class="pm-ui-button pm-ui-button--primary pm-ui-button--small" data-action="run" :disabled="!canRun || !!busy" @click="run">
          {{ busy === 'run' ? t.running : t.runInContainer }}
        </button>
      </template>
      <button type="button" class="pm-ui-button pm-ui-button--small" data-action="replicate" :disabled="!canExport || !!busy" @click="replicate">
        {{ t.replicate }}
      </button>
    </div>
    <p v-if="notice" class="pm-local-env__notice">
      {{ notice }}
    </p>
    <pre v-if="output" class="pm-local-env__output" :data-ok="output.ok">{{ output.stdout }}{{ output.stderr }}{{ output.timedOut ? t.timedOut : '' }}</pre>
    <p v-if="error" class="pm-local-env__error" role="alert">
      {{ error }}
    </p>
  </section>
</template>

<style scoped>
.pm-local-env {
  --pm-text-xs: 0.75em;
  --pm-text-sm: 0.875em;

  display: flex;
  flex-direction: column;
  gap: 0.5em;
  color: var(--pm-color-ink);
  font-family: var(--pm-font-sans);
  font-size: 0.85em;
}
.pm-local-env__header {
  display: flex;
  gap: 0.75em;
  align-items: baseline;
}
.pm-local-env__editor {
  min-height: 8em;
  padding: 0.5em 0.75em;
  background: var(--pm-color-code);
  font-family: var(--pm-font-mono);
  font-size: 0.95em;
}
.pm-local-env__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5em;
}
.pm-local-env__notice {
  margin: 0;
  color: var(--pm-color-muted);
}
.pm-local-env__output {
  margin: 0;
  padding: 0.6em 0.9em;
  border-radius: var(--pm-radius-control);
  background: var(--pm-color-sunk);
  color: var(--pm-color-ink);
  font-family: var(--pm-font-mono);
  white-space: pre-wrap;
}
.pm-local-env__output[data-ok='false'],
.pm-local-env__error {
  color: var(--pm-color-danger);
}
.pm-local-env__error {
  margin: 0;
}
</style>
