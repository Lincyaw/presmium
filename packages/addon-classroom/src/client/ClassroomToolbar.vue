<script setup lang="ts">
// The classroom in the hosts' toolbar: for the presenter, a button with the number of open
// questions that opens the overview of the classroom. It also places the web form's notes.
import { computed, onBeforeUnmount, ref } from 'vue'
import { COLLECTIONS } from '../domain/index.ts'
import type { Question } from '../domain/index.ts'
import ClassroomPanel from './ClassroomPanel.vue'
import NotesLayer from './NotesLayer.vue'
import { claimNotesLayer, useClassroomStore, useCollection, useSession } from './use.ts'
import './style.css'

const { presenter } = useSession()
const store = useClassroomStore()
const questions = useCollection<Question>(() => store.value, COLLECTIONS.questions)
const unanswered = computed(() => questions.value.filter(({ value }) => !value.answered).length)
const open = ref(false)
const layer = claimNotesLayer()
onBeforeUnmount(layer.release)
</script>

<template>
  <span class="pm-classroom-toolbar">
    <button v-if="presenter" type="button" :aria-expanded="open" title="课堂互动：提问、理解度、测验与练习" @click="open = !open">
      互动<span v-if="unanswered" class="pm-classroom-toolbar__badge" :aria-label="`${unanswered} 个未回答的提问`">{{ unanswered }}</span>
    </button>
    <div v-if="presenter && open" class="pm-classroom-popover" role="dialog" aria-label="课堂互动">
      <ClassroomPanel />
      <button type="button" class="pm-classroom-popover__close" @click="open = false">
        关闭
      </button>
    </div>
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
.pm-classroom-popover {
  position: fixed;
  top: 4.5rem;
  right: 1rem;
  z-index: 2100;
  width: min(26rem, calc(100vw - 2rem));
  max-height: 75vh;
  overflow: auto;
  padding: 0.75rem;
  border: 1px solid rgba(125, 125, 125, 0.4);
  border-radius: 0.375rem;
  background: var(--vp-c-bg, var(--slidev-theme-background, #fff));
  color: var(--vp-c-text-1, inherit);
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.2);
}
.pm-classroom-popover__close {
  margin-top: 0.5rem;
}
</style>
