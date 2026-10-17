<script setup lang="ts">
// The notes of one place (P-63): a section, or a labelled block of it. Only their author sees them.
// The notes layer gives the spot its notes and the store they are kept in.
import { useMessages } from '@presmium/host'
import type { ClassroomStore, StoredItem } from '@presmium/kernel'
import { ref } from 'vue'
import { COLLECTIONS, MESSAGES } from '../domain/index.ts'
import type { Note } from '../domain/index.ts'
import { newId } from './use.ts'
import './style.css'

const props = defineProps<{
  section: string
  block?: string
  /** What the notes are about, for the button's accessible name. */
  label: string
  /** The notes of this place, oldest first. */
  notes: StoredItem<Note>[]
  store: ClassroomStore
  /** The notes also go to the participant's own store of the classroom. */
  inClassroom: boolean
}>()

const t = useMessages(MESSAGES)
const open = ref(false)
const text = ref('')

function add(): void {
  const note = text.value.trim()
  if (!note) return
  props.store.put<Note>(COLLECTIONS.notes, newId(), { section: props.section, ...props.block ? { block: props.block } : {}, text: note, at: Date.now() })
  text.value = ''
}
</script>

<template>
  <div class="pm-note-spot" :data-section="section" :data-block="block" :data-notes="notes.length">
    <button type="button" class="pm-note-spot__toggle pm-ui-button pm-ui-button--ghost pm-ui-button--small" :aria-expanded="open" :aria-label="t.notes.label(label)" :title="t.notes.label(label)" @click="open = !open">
      {{ t.notes.button }}<span v-if="notes.length" class="pm-note-spot__count pm-ui-badge pm-ui-badge--accent">{{ notes.length }}</span>
    </button>
    <div v-if="open" class="pm-note-spot__panel">
      <ul v-if="notes.length" class="pm-note-spot__list" :aria-label="t.notes.mine">
        <li v-for="note in notes" :key="note.id">
          <span class="pm-note-spot__text">{{ note.value.text }}</span>
          <button type="button" class="pm-ui-button pm-ui-button--ghost pm-ui-button--small" :aria-label="t.notes.removeLabel(note.value.text)" @click="store.remove(COLLECTIONS.notes, note.id)">
            {{ t.notes.remove }}
          </button>
        </li>
      </ul>
      <form @submit.prevent="add">
        <textarea v-model="text" class="pm-ui-textarea" :aria-label="t.notes.new" rows="2" maxlength="2000" @keydown.stop />
        <p class="pm-note-spot__actions">
          <button type="submit" class="pm-ui-button pm-ui-button--primary pm-ui-button--small" :disabled="!text.trim()">
            {{ t.notes.save }}
          </button>
          <span class="pm-note-spot__where">{{ inClassroom ? t.notes.inClassroom : t.notes.inBrowser }}</span>
        </p>
      </form>
    </div>
  </div>
</template>

<style scoped>
.pm-note-spot {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  color: var(--pm-color-ink);
  font-family: var(--pm-font-sans);
  font-size: 0.8rem;
  line-height: 1.5;
}
/* The toggle reads quieter until it is used or the place has notes. */
.pm-note-spot__toggle {
  color: var(--pm-color-muted);
}
.pm-note-spot__toggle[aria-expanded='true'],
.pm-note-spot:not([data-notes='0']) .pm-note-spot__toggle {
  color: var(--pm-color-ink);
}
.pm-note-spot__count {
  margin-left: 0.25rem;
}
/* A note is the reader's own: a slip of the warm tint on the paper. */
.pm-note-spot__panel {
  box-sizing: border-box;
  width: 100%;
  margin-top: 0.25rem;
  padding: 0.5rem 0.75rem;
  border: 1px solid var(--pm-color-line);
  border-radius: var(--pm-radius-control);
  background: var(--pm-color-warn-soft);
}
.pm-note-spot__list {
  margin: 0 0 0.3rem;
  padding-left: 1.2em;
}
.pm-note-spot__list li {
  display: flex;
  justify-content: space-between;
  gap: 0.5rem;
}
.pm-note-spot__text {
  white-space: pre-wrap;
}
.pm-note-spot__actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.4rem;
  margin: 0.25rem 0 0;
}
.pm-note-spot__where {
  color: var(--pm-color-muted);
}
</style>
