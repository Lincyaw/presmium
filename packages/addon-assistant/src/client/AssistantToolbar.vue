<script setup lang="ts">
// The question panel in the hosts' toolbar (the web form's reading view; the slides form's navigation
// controls): a button that opens it in a popover (the browser's own, closed with Esc or a click elsewhere).
// Every page of a deck that lists the assistant has it, static ones too (P-112): the reader's own model
// service answers. Not on the workspace's home page, which is no document. Following a citation closes it,
// so the reader sees the place.
import { useMessages } from '@presmium/host'
import { computed, ref, useId } from 'vue'
import { ASSISTANT_MESSAGES } from '../domain/index.ts'
import AskPanel from './AskPanel.vue'
import { assistant, useNavigator } from './state.ts'

const t = useMessages(ASSISTANT_MESSAGES)
const id = useId()
const open = ref(false)
const popover = ref<HTMLElement>()
// Found here, so an AI answer of the classroom has the page's IR before the panel was opened.
useNavigator()
/** A served page waits for the server to say whether it is a document. */
const shown = computed(() => !assistant.value || (assistant.value.info.value !== undefined && !assistant.value.info.value.home))

function toggled(event: Event): void {
  open.value = (event as ToggleEvent).newState === 'open'
}

function cited(): void {
  popover.value?.hidePopover()
}
</script>

<template>
  <span v-if="shown" class="pm-assistant-toolbar">
    <button type="button" class="pm-ui-button pm-ui-button--ghost pm-ui-button--small" :popovertarget="id" :aria-expanded="open" :title="t.toolbar.title">
      {{ t.toolbar.button }}
    </button>
    <div :id="id" ref="popover" popover class="pm-assistant-popover pm-ui" role="dialog" :aria-label="t.panel.title" @toggle="toggled">
      <template v-if="open">
        <AskPanel @cited="cited" />
        <button type="button" class="pm-assistant-popover__close pm-ui-button pm-ui-button--small" :popovertarget="id" popovertargetaction="hide">
          {{ t.panel.close }}
        </button>
      </template>
    </div>
  </span>
</template>

<style scoped>
.pm-assistant-toolbar {
  display: inline-flex;
  align-items: center;
}
.pm-assistant-popover__close {
  margin-top: var(--pm-space-3);
}
/* The browser's own popover (the top layer), drawn as the host's: a panel that floats, by the toolbar. */
.pm-assistant-popover {
  position: fixed;
  inset: 4.5rem 1rem auto auto;
  box-sizing: border-box;
  width: min(28rem, calc(100vw - 2rem));
  max-height: 80vh;
  margin: 0;
  overflow: auto;
  padding: var(--pm-space-4);
  border: 1px solid var(--pm-color-line);
  border-radius: var(--pm-radius-card);
  background: var(--pm-color-surface);
  box-shadow: var(--pm-shadow-float);
  white-space: normal;
}
</style>
