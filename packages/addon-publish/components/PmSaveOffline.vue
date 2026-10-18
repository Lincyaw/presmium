<script setup lang="ts">
import { useMessages } from '@presmium/host'
import { onMounted, onUnmounted, ref } from 'vue'
import { offlineRuntimes, saveOffline } from '../src/client/offline.ts'
import { MESSAGES } from '../src/domain/index.ts'

const t = useMessages(MESSAGES)
const state = ref<'hidden' | 'offered' | 'saving' | 'saved' | 'failed'>('hidden')
const megabytes = ref(0)

async function ask() {
  if (state.value !== 'hidden') return
  const runtimes = await offlineRuntimes()
  if (!runtimes || runtimes.bytes === 0 || state.value !== 'hidden') return
  megabytes.value = Math.max(1, Math.round(runtimes.bytes / 2 ** 20))
  state.value = runtimes.saved ? 'saved' : 'offered'
}

const workers = typeof navigator === 'undefined' ? undefined : navigator.serviceWorker
onMounted(() => {
  workers?.addEventListener('controllerchange', ask)
  void ask()
})
onUnmounted(() => workers?.removeEventListener('controllerchange', ask))

async function save() {
  state.value = 'saving'
  state.value = await saveOffline() ? 'saved' : 'failed'
}
</script>

<template>
  <button
    v-if="state !== 'hidden'"
    type="button"
    class="pm-save-offline pm-ui-button pm-ui-button--small"
    :data-state="state"
    :disabled="state === 'saving' || state === 'saved'"
    @click="save"
  >
    {{ state === 'saving' ? t.savingOffline : state === 'saved' ? t.savedOffline : state === 'failed' ? t.saveOfflineFailed : t.saveOffline(megabytes) }}
  </button>
</template>

<style>
.pm-save-offline {
  border-radius: var(--pm-radius-pill);
}
.pm-save-offline:disabled {
  cursor: default;
  opacity: 1;
}
.pm-save-offline[data-state='saved'] {
  border-color: var(--pm-color-ok);
  background: var(--pm-color-ok-soft);
  color: var(--pm-color-ok);
}
</style>
