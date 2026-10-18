<script setup lang="ts">
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
      <input v-model="name" class="pm-ui-input" :aria-label="t.nickname" :placeholder="t.nickname" maxlength="40" required>
      <button type="submit" class="pm-ui-button pm-ui-button--primary pm-ui-button--small" :disabled="busy">
        {{ t.join }}
      </button>
    </form>
    <div v-else-if="snapshot.status === 'ended'" class="pm-session-badge__row">
      <strong>{{ t.status.ended }}</strong>
      <button type="button" class="pm-ui-button pm-ui-button--small" @click="session?.leave()">
        {{ t.leave }}
      </button>
    </div>
    <div v-else-if="snapshot.connection !== 'connected'" class="pm-session-badge__row">
      {{ t.status.connecting }}
    </div>
    <div v-else-if="snapshot.follow === 'follow'" class="pm-session-badge__row">
      <span class="pm-ui-dot" aria-hidden="true" />
      <span>{{ t.followingPresenter }}</span>
      <button type="button" class="pm-ui-button pm-ui-button--small" @click="session?.setFollow('free')">
        {{ t.browseAlone }}
      </button>
    </div>
    <div v-else class="pm-session-badge__row">
      <span>{{ t.browsingAlone }}</span>
      <span v-if="snapshot.presenterCursor" class="pm-session-badge__presenter">
        {{ t.presenterAt(snapshot.presenterCursor.slide, snapshot.presenterCursor.step) }}
      </span>
      <button type="button" class="pm-ui-button pm-ui-button--primary pm-ui-button--small" @click="session?.setFollow('follow')">
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
  box-sizing: border-box;
  max-width: calc(100vw - 2rem);
  padding: 0.5rem 0.75rem;
  border: 1px solid var(--pm-color-line);
  border-radius: var(--pm-radius-card);
  background: var(--pm-color-surface);
  color: var(--pm-color-ink);
  box-shadow: var(--pm-shadow-float);
  font-family: var(--pm-font-sans);
  font-size: var(--pm-text-md);
  line-height: var(--pm-leading-ui);
}
.pm-session-badge__row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem;
}
.pm-session-badge__presenter {
  color: var(--pm-color-muted);
  font-family: var(--pm-font-mono);
  font-size: var(--pm-text-sm);
}
.pm-session-badge__note {
  max-width: 24rem;
  margin: 0.35rem 0 0;
  color: var(--pm-color-muted);
}
.pm-session-badge[data-status='ended'] {
  border-color: var(--pm-color-danger);
}
</style>
