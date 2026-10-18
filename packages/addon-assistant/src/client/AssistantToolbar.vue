<script setup lang="ts">
import { useMessages } from '@presmium/host'
import { ref, useId } from 'vue'
import { ASSISTANT_MESSAGES } from '../domain/index.ts'
import AskPanel from './AskPanel.vue'
import { useNavigator } from './state.ts'

const t = useMessages(ASSISTANT_MESSAGES)
const id = useId()
const open = ref(false)
const popover = ref<HTMLElement>()
useNavigator()

function toggled(event: Event): void {
  open.value = (event as ToggleEvent).newState === 'open'
}

function cited(): void {
  popover.value?.hidePopover()
}
</script>

<template>
  <span class="pm-assistant-toolbar">
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
