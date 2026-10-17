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
    <button type="button" :popovertarget="id" :aria-expanded="open" :title="t.toolbar.title">
      {{ t.toolbar.button }}
    </button>
    <div :id="id" ref="popover" popover class="pm-assistant-popover" role="dialog" :aria-label="t.panel.title" @toggle="toggled">
      <template v-if="open">
        <AskPanel @cited="cited" />
        <button type="button" class="pm-assistant-popover__close" :popovertarget="id" popovertargetaction="hide">
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
.pm-assistant-toolbar > button,
.pm-assistant-popover__close {
  margin-left: 0.5rem;
  padding: 0.1rem 0.5rem;
  border: 1px solid rgba(125, 125, 125, 0.5);
  border-radius: 0.25rem;
  background: transparent;
  color: inherit;
  font: inherit;
  font-size: 0.8125rem;
  white-space: nowrap;
  cursor: pointer;
}
.pm-assistant-popover__close {
  margin: 0.5rem 0 0;
}
.pm-assistant-popover {
  position: fixed;
  inset: 4.5rem 1rem auto auto;
  box-sizing: border-box;
  width: min(28rem, calc(100vw - 2rem));
  max-height: 80vh;
  margin: 0;
  overflow: auto;
  padding: 0.75rem;
  border: 1px solid rgba(125, 125, 125, 0.4);
  border-radius: 0.375rem;
  background: var(--vp-c-bg, var(--slidev-theme-background, #fff));
  color: var(--vp-c-text-1, inherit);
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.2);
  white-space: normal;
}
</style>
