<script setup lang="ts">
// The notes of one place (P-63): a section, or a labelled block of it. Only their author sees them.
import { computed, ref } from 'vue'
import { COLLECTIONS, notesAt } from '../domain/index.ts'
import type { Note } from '../domain/index.ts'
import { newId, useCollection, useNotes } from './use.ts'
import './style.css'

const props = defineProps<{
  section: string
  block?: string
  /** What the notes are about, for the button's accessible name. */
  label: string
}>()

const { store, inClassroom } = useNotes()
const notes = useCollection<Note>(() => store.value, COLLECTIONS.notes)
const here = computed(() => notesAt(notes.value, props.section, props.block))
const open = ref(false)
const text = ref('')

function add(): void {
  const note = text.value.trim()
  if (!note) return
  store.value.put<Note>(COLLECTIONS.notes, newId(), { section: props.section, ...props.block ? { block: props.block } : {}, text: note, at: Date.now() })
  text.value = ''
}
</script>

<template>
  <div class="pm-note-spot" :data-section="section" :data-block="block" :data-notes="here.length">
    <button type="button" class="pm-note-spot__toggle" :aria-expanded="open" :aria-label="`笔记：${label}`" :title="`笔记：${label}`" @click="open = !open">
      笔记<span v-if="here.length" class="pm-note-spot__count">{{ here.length }}</span>
    </button>
    <div v-if="open" class="pm-note-spot__panel">
      <ul v-if="here.length" class="pm-note-spot__list" aria-label="我的笔记">
        <li v-for="note in here" :key="note.id">
          <span class="pm-note-spot__text">{{ note.value.text }}</span>
          <button type="button" :aria-label="`删除笔记：${note.value.text}`" @click="store.remove(COLLECTIONS.notes, note.id)">
            删除
          </button>
        </li>
      </ul>
      <form @submit.prevent="add">
        <textarea v-model="text" aria-label="新笔记" rows="2" maxlength="2000" @keydown.stop />
        <p class="pm-note-spot__actions">
          <button type="submit" :disabled="!text.trim()">
            保存笔记
          </button>
          <span class="pm-note-spot__where">{{ inClassroom ? '保存在课堂与这个浏览器中，只有你能看到' : '保存在这个浏览器中，只有你能看到' }}</span>
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
  font-size: 0.8rem;
  line-height: 1.4;
}
.pm-note-spot__toggle {
  border-color: transparent;
  color: var(--vp-c-text-2, inherit);
}
.pm-note-spot__toggle:hover,
.pm-note-spot__toggle:focus-visible,
.pm-note-spot__toggle[aria-expanded='true'],
.pm-note-spot:not([data-notes='0']) .pm-note-spot__toggle {
  border-color: rgba(125, 125, 125, 0.5);
  color: inherit;
}
.pm-note-spot__count {
  margin-left: 0.25rem;
  font-weight: 600;
}
.pm-note-spot__panel {
  box-sizing: border-box;
  width: 100%;
  margin-top: 0.25rem;
  padding: 0.4rem 0.6rem;
  border: 1px solid rgba(125, 125, 125, 0.35);
  border-radius: 0.375rem;
  background: rgba(250, 204, 21, 0.08);
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
  color: var(--vp-c-text-2, inherit);
}
</style>
