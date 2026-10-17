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
  gap: 0.375rem;
}
.pm-session-toolbar__state {
  color: var(--pm-color-muted);
}
/* The connection: off without a server or link, the warning tone while it connects, the success tone once it is. */
.pm-session-toolbar__dot {
  background: var(--pm-color-line-strong);
}
.pm-session-toolbar__dot[data-connection='connected'] {
  background: var(--pm-color-ok);
}
.pm-session-toolbar__dot[data-connection='connecting'] {
  background: var(--pm-color-warn);
}
/* The browser's own popover (the top layer), drawn as the host's: a panel that floats, by the toolbar. The text
   wraps, whatever the toolbar around it sets. */
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
