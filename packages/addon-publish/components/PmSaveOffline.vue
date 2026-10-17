<script setup lang="ts">
/**
 * "Save for offline use" in the toolbar (D-6): where the page's service
 * worker caches the heavy runtimes on first use (the web form's), it fetches
 * them all now, so code runs offline before it has run once. Shown only
 * when the service worker offers it; once they are saved it says so. On a
 * first visit the page has no service worker yet when this mounts: it asks
 * again once one controls the page.
 */
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
    class="pm-save-offline"
    :data-state="state"
    :disabled="state === 'saving' || state === 'saved'"
    @click="save"
  >
    {{ state === 'saving' ? t.savingOffline : state === 'saved' ? t.savedOffline : state === 'failed' ? t.saveOfflineFailed : t.saveOffline(megabytes) }}
  </button>
</template>

<style>
.pm-save-offline {
  padding: 0.2em 0.7em;
  border: 1px solid currentColor;
  border-radius: 999px;
  background: transparent;
  color: inherit;
  font: inherit;
  font-size: 0.85em;
  cursor: pointer;
}
.pm-save-offline:disabled {
  cursor: default;
  opacity: 0.8;
}
</style>
