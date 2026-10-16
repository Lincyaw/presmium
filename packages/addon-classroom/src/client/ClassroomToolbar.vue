<script setup lang="ts">
// The classroom in the hosts' toolbar: for the presenter, a button with the number of open
// questions that opens the overview of the classroom in a popover (the browser's own: it closes
// with Esc or a click elsewhere). It also places the web form's notes.
import { claimFirst, useMessages } from '@presmium/host'
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
// Of the toolbar's instances in a window (the bar and the menu of a phone), the first places the notes.
const layer = claimFirst('presmium.classroom.notes')

function toggled(event: Event): void {
  open.value = (event as ToggleEvent).newState === 'open'
}
</script>

<template>
  <span class="pm-classroom-toolbar">
    <template v-if="presenter">
      <button type="button" :popovertarget="id" :aria-expanded="open" :title="t.toolbar.title">
        {{ t.toolbar.button }}<span v-if="unanswered" class="pm-classroom-toolbar__badge" :aria-label="t.toolbar.unanswered(unanswered)">{{ unanswered }}</span>
      </button>
      <div :id="id" popover class="pm-classroom-popover" role="dialog" :aria-label="t.interaction" @toggle="toggled">
        <template v-if="open">
          <ClassroomPanel />
          <button type="button" class="pm-classroom-popover__close" :popovertarget="id" popovertargetaction="hide">
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
.pm-classroom-toolbar > button {
  margin-left: 0.5rem;
  font-size: 0.8125rem;
  white-space: nowrap;
}
.pm-classroom-toolbar__badge {
  display: inline-block;
  min-width: 1.4em;
  margin-left: 0.25rem;
  padding: 0 0.3em;
  border-radius: 999px;
  background: #dc2626;
  color: #fff;
  text-align: center;
}
/* The text wraps, whatever the toolbar around it sets. */
.pm-classroom-popover {
  position: fixed;
  inset: 4.5rem 1rem auto auto;
  box-sizing: border-box;
  width: min(26rem, calc(100vw - 2rem));
  max-height: 75vh;
  margin: 0;
  overflow: auto;
  padding: 0.75rem;
  border: 1px solid rgba(125, 125, 125, 0.4);
  border-radius: 0.375rem;
  background: var(--vp-c-bg, var(--slidev-theme-background, #fff));
  color: var(--vp-c-text-1, inherit);
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.2);
  white-space: normal;
  overflow-wrap: anywhere;
}
.pm-classroom-popover__close {
  margin-top: 0.5rem;
}
</style>
