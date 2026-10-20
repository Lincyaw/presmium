<script setup lang="ts">
import { claimFirst, useMessages } from '@lincyaw/host'
import { computed, ref, useId } from 'vue'
import { COLLECTIONS, isQuestion, MESSAGES } from '../domain/index.ts'
import ClassroomPanel from './ClassroomPanel.vue'
import NotesLayer from './NotesLayer.vue'
import { useClassroomStore, useCollection, useSession } from './use.ts'
import './style.css'

const { presenter } = useSession()
const t = useMessages(MESSAGES)
const store = useClassroomStore()
const questions = useCollection(() => store.value, COLLECTIONS.questions, isQuestion)
const unanswered = computed(() => questions.value.filter(({ value }) => !value.answered).length)
const id = useId()
const open = ref(false)
const layer = claimFirst('presmium.classroom.notes')

function toggled(event: Event): void {
  open.value = (event as ToggleEvent).newState === 'open'
}
</script>

<template>
  <span class="pm-classroom-toolbar">
    <template v-if="presenter">
      <button type="button" class="pm-ui-button pm-ui-button--ghost pm-ui-button--small" :popovertarget="id" :aria-expanded="open" :title="t.toolbar.title">
        {{ t.toolbar.button }}<span v-if="unanswered" class="pm-classroom-toolbar__badge pm-ui-badge pm-ui-badge--danger pm-ui-badge--pill" :aria-label="t.toolbar.unanswered(unanswered)">{{ unanswered }}</span>
      </button>
      <div :id="id" popover class="pm-classroom-popover" role="dialog" :aria-label="t.interaction" @toggle="toggled">
        <template v-if="open">
          <ClassroomPanel />
          <button type="button" class="pm-classroom-popover__close pm-ui-button pm-ui-button--small" :popovertarget="id" popovertargetaction="hide">
            {{ t.close }}
          </button>
        </template>
      </div>
    </template>
    <NotesLayer v-if="layer.owns.value" />
  </span>
</template>

<style scoped>
.pm-classroom-toolbar {
  display: inline-flex;
  align-items: center;
}
.pm-classroom-toolbar__badge {
  margin-left: 0.125rem;
}
.pm-classroom-popover {
  position: fixed;
  inset: 4.5rem 1rem auto auto;
  box-sizing: border-box;
  width: min(26rem, calc(100vw - 2rem));
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
  white-space: normal;
  overflow-wrap: anywhere;
}
.pm-classroom-popover__close {
  margin-top: 0.75rem;
}
</style>
