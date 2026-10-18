<script setup lang="ts">
import { EDIT_MODE, PmButton, PmIcon, useMessages, useServer, useService } from '@presmium/host'
import { computed, ref, useId } from 'vue'
import { ASSISTANT_MESSAGES } from '../domain/index.ts'
import { canChange, docked, inDocument, panelWanted } from './dock.ts'
import { CLIENT_MESSAGES, missingText } from './messages.ts'
import ModelSettings from './ModelSettings.vue'
import { assistant } from './state.ts'

const t = useMessages(ASSISTANT_MESSAGES)
const c = useMessages(CLIENT_MESSAGES)
const editMode = useService(EDIT_MODE)
const server = useServer()
const id = useId()
const open = ref(false)
const popover = ref<HTMLElement>()
const settings = ref<InstanceType<typeof ModelSettings>>()
const info = computed(() => assistant.value?.info.value)
const switches = computed(() => inDocument.value && canChange.value && editMode.value?.allowed.value === true)

const status = computed(() => {
  const now = info.value
  if (!now) return []
  const lines = now.provider
    ? [t.value.edit.available(now.provider, t.value.edit.source[now.source ?? 'environment'])]
    : [t.value.edit.unavailable, t.value.edit.howTo, ...now.missing ? [t.value.edit.missing(missingText(now.missing, c.value))] : []]
  if (now.home) return [...lines, t.value.edit.home]
  if (!now.changes) return [...lines, t.value.edit.noGit]
  if (now.provider && (!now.kinds.length || editMode.value?.allowed.value === false)) return [...lines, t.value.edit.notEditor]
  return lines
})

function toggle(): void {
  if (!switches.value) return
  const mode = editMode.value
  if (mode && !mode.active.value) {
    mode.enter()
    panelWanted.value = true
    return
  }
  panelWanted.value = !panelWanted.value
}

function toggled(event: Event): void {
  open.value = (event as ToggleEvent).newState === 'open'
}

function openSettings(): void {
  popover.value?.hidePopover()
  void settings.value?.open()
}
</script>

<template>
  <span v-if="server.available" class="pm-assistant-edit-toolbar">
    <button
      v-if="switches"
      type="button"
      class="pm-assistant-edit__toggle pm-ui-button pm-ui-button--small"
      :aria-pressed="docked ? 'true' : 'false'"
      @click="toggle"
    >
      <PmIcon name="sparkle" :size="14" :stroke-width="2" />{{ t.edit.toggle }}
    </button>
    <template v-else>
      <button type="button" class="pm-assistant-edit__toggle pm-ui-button pm-ui-button--ghost pm-ui-button--small" :popovertarget="id" :aria-expanded="open">
        <PmIcon name="sparkle" :size="14" :stroke-width="2" />{{ t.edit.toggle }}
      </button>
      <div :id="id" ref="popover" popover class="pm-assistant-edit-popover pm-ui" role="dialog" :aria-label="t.edit.toggle" @toggle="toggled">
        <template v-if="open">
          <h2 class="pm-assistant-edit-popover__title">
            {{ t.edit.toggle }}
          </h2>
          <section class="pm-assistant-edit-popover__status" role="status">
            <p v-for="(line, i) in status" :key="i">
              {{ line }}
            </p>
          </section>
          <p class="pm-assistant-edit-popover__actions">
            <PmButton variant="primary" small icon="sliders" @click="openSettings">
              {{ t.edit.settings }}
            </PmButton>
            <button type="button" class="pm-ui-button pm-ui-button--small" :popovertarget="id" popovertargetaction="hide">
              {{ t.edit.close }}
            </button>
          </p>
        </template>
      </div>
    </template>
    <ModelSettings ref="settings" />
  </span>
</template>

<style scoped>
.pm-assistant-edit-toolbar {
  display: inline-flex;
  align-items: center;
}
.pm-assistant-edit-popover {
  position: fixed;
  inset: 4.5rem 1rem auto auto;
  box-sizing: border-box;
  width: min(26rem, calc(100vw - 2rem));
  max-height: 80vh;
  margin: 0;
  overflow: auto;
  padding: var(--pm-space-4);
  border: 1px solid var(--pm-color-line);
  border-radius: var(--pm-radius-card);
  background: var(--pm-color-surface);
  box-shadow: var(--pm-shadow-float);
  text-align: left;
  white-space: normal;
}
.pm-assistant-edit-popover__title {
  margin: 0 0 var(--pm-space-2);
  padding: 0;
  border: 0;
  font-family: var(--pm-font-serif);
  font-size: var(--pm-text-title);
  font-weight: 600;
  line-height: var(--pm-leading-tight);
}
.pm-assistant-edit-popover__status {
  display: grid;
  gap: var(--pm-space-2);
}
.pm-assistant-edit-popover__status p {
  margin: 0;
}
.pm-assistant-edit-popover__status p:first-child {
  font-weight: 600;
}
.pm-assistant-edit-popover__actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--pm-space-2);
  margin: var(--pm-space-4) 0 0;
}
</style>
