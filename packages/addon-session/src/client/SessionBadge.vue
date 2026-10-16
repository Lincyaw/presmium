<script setup lang="ts">
// A learner's classroom controls, over everything (also over the present view, above its control bar,
// whose height the hosts give as --pm-overlay-bar): join a classroom from a link without a name,
// follow the presenter or browse alone, and see when the classroom has ended.
import { useMessages } from '@presmium/host'
import { computed, ref } from 'vue'
import { MESSAGES } from '../domain/index.ts'
import { releaseFocus, useClassroom } from './use.ts'

const { session, snapshot } = useClassroom()
const t = useMessages(MESSAGES)
const name = ref('')
const busy = ref(false)

const learner = computed(() => snapshot.value?.me?.role === 'learner')
const shown = computed(() => Boolean(snapshot.value?.server && (snapshot.value.invitation || learner.value)))

async function join(): Promise<void> {
  const room = snapshot.value?.invitation
  if (!session.value || !room || busy.value) return
  busy.value = true
  releaseFocus()
  await session.value.join(room, name.value).catch(() => {})
  busy.value = false
}
</script>

<template>
  <div v-if="snapshot && shown" class="pm-session-badge" role="region" :aria-label="t.badge" :data-status="snapshot.status" :data-follow="snapshot.follow">
    <form v-if="snapshot.status === 'idle'" class="pm-session-badge__row" @submit.prevent="join">
      <span>{{ snapshot.error ?? t.joinRoom(snapshot.invitation ?? '') }}</span>
      <input v-model="name" :aria-label="t.nickname" :placeholder="t.nickname" maxlength="40" required>
      <button type="submit" :disabled="busy">
        {{ t.join }}
      </button>
    </form>
    <div v-else-if="snapshot.status === 'ended'" class="pm-session-badge__row">
      <strong>{{ t.status.ended }}</strong>
      <button type="button" @click="session?.leave()">
        {{ t.leave }}
      </button>
    </div>
    <div v-else-if="snapshot.connection !== 'connected'" class="pm-session-badge__row">
      {{ t.status.connecting }}
    </div>
    <div v-else-if="snapshot.follow === 'follow'" class="pm-session-badge__row">
      <span>{{ t.followingPresenter }}</span>
      <button type="button" @click="session?.setFollow('free')">
        {{ t.browseAlone }}
      </button>
    </div>
    <div v-else class="pm-session-badge__row">
      <span>{{ t.browsingAlone }}</span>
      <span v-if="snapshot.presenterCursor" class="pm-session-badge__presenter">
        {{ t.presenterAt(snapshot.presenterCursor.slide, snapshot.presenterCursor.step) }}
      </span>
      <button type="button" @click="session?.setFollow('follow')">
        {{ t.backToPresenter }}
      </button>
    </div>
    <p v-if="snapshot.refused && snapshot.status !== 'idle'" class="pm-session-badge__note" role="alert">
      {{ t.refused }}
    </p>
  </div>
</template>

<style scoped>
.pm-session-badge {
  position: fixed;
  right: 1rem;
  bottom: calc(var(--pm-overlay-bar, 0px) + 1rem);
  z-index: 2000;
  max-width: calc(100vw - 2rem);
  padding: 0.4rem 0.6rem;
  border: 1px solid rgba(125, 125, 125, 0.4);
  border-radius: 0.375rem;
  background: var(--vp-c-bg, var(--slidev-theme-background, #fff));
  color: var(--vp-c-text-1, inherit);
  font-size: 0.85rem;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
}
.pm-session-badge__row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.4rem;
}
.pm-session-badge input,
.pm-session-badge button {
  padding: 0.1rem 0.5rem;
  border: 1px solid rgba(125, 125, 125, 0.5);
  border-radius: 0.25rem;
  background: transparent;
  color: inherit;
  font: inherit;
}
.pm-session-badge button {
  cursor: pointer;
}
.pm-session-badge__note {
  max-width: 24rem;
  margin: 0.3rem 0 0;
  color: var(--vp-c-text-2, inherit);
}
.pm-session-badge[data-status='ended'] {
  border-color: #dc2626;
}
</style>
