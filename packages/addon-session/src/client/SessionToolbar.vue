<script setup lang="ts">
// The classroom in the hosts' toolbar: a button with its state that opens the session panel.
// It also places the learner's badge on the page.
import { onBeforeUnmount, ref } from 'vue'
import { shortStatus, statusText } from '../domain/index.ts'
import { useMessages } from './locale.ts'
import SessionBadge from './SessionBadge.vue'
import SessionPanel from './SessionPanel.vue'
import { claimBadge, useClassroom } from './use.ts'

const { snapshot } = useClassroom()
const t = useMessages()
const open = ref(false)
const badge = claimBadge()
onBeforeUnmount(badge.release)
</script>

<template>
  <span v-if="snapshot" class="pm-session-toolbar">
    <button
      type="button"
      class="pm-session-toolbar__button"
      :title="statusText(snapshot, t)"
      :aria-expanded="open"
      :data-status="snapshot.status"
      @click="open = !open"
    >
      <span class="pm-session-toolbar__dot" :data-connection="snapshot.server ? snapshot.connection : 'none'" aria-hidden="true" />
      {{ t.classroom }}<span class="pm-session-toolbar__state">{{ shortStatus(snapshot, t) }}</span>
    </button>
    <div v-if="open" class="pm-session-popover" role="dialog" :aria-label="t.classroom">
      <SessionPanel />
      <button type="button" class="pm-session-popover__close" @click="open = false">
        {{ t.close }}
      </button>
    </div>
    <Teleport v-if="badge.owns.value" to="body">
      <SessionBadge />
    </Teleport>
  </span>
</template>

<style scoped>
.pm-session-toolbar {
  display: inline-flex;
  align-items: center;
}
.pm-session-toolbar__button {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  margin-left: 0.5rem;
  padding: 0.125rem 0.4rem;
  border: 1px solid rgba(125, 125, 125, 0.4);
  border-radius: 0.25rem;
  background: transparent;
  color: inherit;
  font-size: 0.8125rem;
  white-space: nowrap;
  cursor: pointer;
}
.pm-session-toolbar__state {
  opacity: 0.75;
}
.pm-session-toolbar__dot {
  width: 0.5rem;
  height: 0.5rem;
  border-radius: 50%;
  background: #9ca3af;
}
.pm-session-toolbar__dot[data-connection='connected'] {
  background: #16a34a;
}
.pm-session-toolbar__dot[data-connection='connecting'] {
  background: #f59e0b;
}
.pm-session-popover {
  position: fixed;
  top: 4.5rem;
  right: 1rem;
  z-index: 2100;
  width: min(22rem, calc(100vw - 2rem));
  max-height: 75vh;
  overflow: auto;
  padding: 0.75rem;
  border: 1px solid rgba(125, 125, 125, 0.4);
  border-radius: 0.375rem;
  background: var(--vp-c-bg, var(--slidev-theme-background, #fff));
  color: var(--vp-c-text-1, inherit);
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.2);
  text-align: left;
}
.pm-session-popover__close {
  margin-top: 0.5rem;
  padding: 0.1rem 0.5rem;
  border: 1px solid rgba(125, 125, 125, 0.5);
  border-radius: 0.25rem;
  background: transparent;
  color: inherit;
  font-size: 0.8rem;
  cursor: pointer;
}
</style>
