<script setup lang="ts">
// The classroom in the hosts' toolbar: a button with its state that opens the session panel in a
// popover (the browser's own: it closes with Esc or a click elsewhere, over everything).
// It also places the learner's badge on the page.
import { claimFirst, useMessages } from '@presmium/host'
import { ref, useId } from 'vue'
import { MESSAGES, shortStatus, statusText } from '../domain/index.ts'
import SessionBadge from './SessionBadge.vue'
import SessionPanel from './SessionPanel.vue'
import { useClassroom } from './use.ts'

const { snapshot } = useClassroom()
const t = useMessages(MESSAGES)
const id = useId()
const open = ref(false)
// Of the toolbar's instances in a window (the bar and the menu of a phone), the first shows the badge.
const badge = claimFirst('presmium.session.badge')

function toggled(event: Event): void {
  open.value = (event as ToggleEvent).newState === 'open'
}
</script>

<template>
  <span v-if="snapshot" class="pm-session-toolbar">
    <button
      type="button"
      class="pm-session-toolbar__button"
      :popovertarget="id"
      :title="statusText(snapshot, t)"
      :aria-expanded="open"
      :data-status="snapshot.status"
    >
      <span class="pm-session-toolbar__dot" :data-connection="snapshot.server ? snapshot.connection : 'none'" aria-hidden="true" />
      {{ t.classroom }}<span class="pm-session-toolbar__state">{{ shortStatus(snapshot, t) }}</span>
    </button>
    <div :id="id" popover class="pm-session-popover" role="dialog" :aria-label="t.classroom" @toggle="toggled">
      <template v-if="open">
        <SessionPanel />
        <button type="button" class="pm-session-popover__close" :popovertarget="id" popovertargetaction="hide">
          {{ t.close }}
        </button>
      </template>
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
/* The text wraps, whatever the toolbar around it sets. */
.pm-session-popover {
  position: fixed;
  inset: 4.5rem 1rem auto auto;
  box-sizing: border-box;
  width: min(22rem, calc(100vw - 2rem));
  max-height: 75vh;
  margin: 0;
  overflow: auto;
  padding: 0.75rem;
  border: 1px solid rgba(125, 125, 125, 0.4);
  border-radius: 0.375rem;
  background: var(--vp-c-bg, var(--slidev-theme-background, #fff));
  color: var(--vp-c-text-1, inherit);
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.2);
  text-align: left;
  white-space: normal;
  overflow-wrap: anywhere;
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
