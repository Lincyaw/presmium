<script setup lang="ts">
import { claimFirst, useMessages } from '@lincyaw/host'
import { ref, useId } from 'vue'
import { MESSAGES, shortStatus, statusText } from '../domain/index.ts'
import SessionBadge from './SessionBadge.vue'
import SessionPanel from './SessionPanel.vue'
import { useClassroom } from './use.ts'

const { snapshot } = useClassroom()
const t = useMessages(MESSAGES)
const id = useId()
const open = ref(false)
const badge = claimFirst('presmium.session.badge')

function toggled(event: Event): void {
  open.value = (event as ToggleEvent).newState === 'open'
}
</script>

<template>
  <span v-if="snapshot" class="pm-session-toolbar">
    <button
      type="button"
      class="pm-session-toolbar__button pm-ui-button pm-ui-button--ghost pm-ui-button--small"
      :popovertarget="id"
      :title="statusText(snapshot, t)"
      :aria-expanded="open"
      :data-status="snapshot.status"
    >
      <span class="pm-session-toolbar__dot pm-ui-dot" :data-connection="snapshot.server ? snapshot.connection : 'none'" aria-hidden="true" />
      {{ t.classroom }}<span class="pm-session-toolbar__state">{{ shortStatus(snapshot, t) }}</span>
    </button>
    <div :id="id" popover class="pm-session-popover" role="dialog" :aria-label="t.classroom" @toggle="toggled">
      <template v-if="open">
        <SessionPanel />
        <button type="button" class="pm-session-popover__close pm-ui-button pm-ui-button--small" :popovertarget="id" popovertargetaction="hide">
          {{ t.close }}
        </button>
      </template>
    </div>
    <Teleport v-if="badge.owns.value" to="body">
      <SessionBadge class="pm-session-badge--page" />
    </Teleport>
  </span>
</template>

<style scoped>
.pm-session-toolbar {
  display: inline-flex;
  align-items: center;
}
.pm-session-toolbar__button {
  gap: 0.375rem;
}
.pm-session-toolbar__state {
  color: var(--pm-color-muted);
}
.pm-session-toolbar__dot {
  background: var(--pm-color-line-strong);
}
.pm-session-toolbar__dot[data-connection='connected'] {
  background: var(--pm-color-ok);
}
.pm-session-toolbar__dot[data-connection='connecting'] {
  background: var(--pm-color-warn);
}
.pm-session-popover {
  position: fixed;
  inset: 4.5rem 1rem auto auto;
  box-sizing: border-box;
  width: min(22rem, calc(100vw - 2rem));
  max-height: 75vh;
  margin: 0;
  overflow: auto;
  padding: var(--pm-space-3) var(--pm-space-4);
  border: 1px solid var(--pm-color-line);
  border-radius: var(--pm-radius-card);
  background: var(--pm-color-surface);
  color: var(--pm-color-ink);
  box-shadow: var(--pm-shadow-float);
  font-family: var(--pm-font-sans);
  text-align: left;
  white-space: normal;
  overflow-wrap: anywhere;
}
.pm-session-popover__close {
  margin-top: 0.75rem;
}
</style>
