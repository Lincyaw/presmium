<script setup lang="ts">
// Edit mode's agent panel (P-113 to P-115; the workspace's `EDIT_MODE`): annotations of the blocks the author
// clicks (with the block's source and an excerpt of it), sent as one batch; a chat with the agent that takes
// where the author is (section, step, selection); both name the model's provider (N-08). The change tasks sent
// from this window follow, newest first: the one under way shows its steps, then its review file by file (each
// kept or rejected, a unified diff for text, a return to before each step); each committed one can be undone.
// The document's change task this member sent before the page was reloaded (or, for owners, anyone's) is taken
// up again. In the toolbar while edit mode is on; the panel opens beside the page.
import { EDIT_MODE, useMessages, useServer, useService } from '@presmium/host'
import type { AgentContext } from '@presmium/kernel'
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { ASSISTANT_ID, ASSISTANT_MESSAGES } from '../domain/index.ts'
import type { PendingChange } from '../domain/index.ts'
import ChangeTask from './ChangeTask.vue'
import { addAnnotation, annotations, busy, changes, excerptOf, picked, removeAnnotation, resume, sendAnnotations, sendChat } from './edit.ts'
import { agent, assistant, selected, useNavigator } from './state.ts'

const t = useMessages(ASSISTANT_MESSAGES)
const editMode = useService(EDIT_MODE)
const server = useServer()
const navigator = useNavigator()
const active = computed(() => editMode.value?.active.value ?? false)
const open = ref(true)
const canChange = computed(() => (agent.value?.available('annotations') ?? false) && (agent.value?.available('chat') ?? false))
const provider = computed(() => agent.value?.provider())
const drafts = computed(() => annotations.value.filter(a => a.status === 'draft'))
/** The task under way (or waiting for its review) goes first; the ended ones last. */
const current = computed(() => (busy.value ? changes.value.slice(0, 1) : []))
const past = computed(() => (busy.value ? changes.value.slice(1) : changes.value))
const request = ref('')
const message = ref('')

const route = (path: string, init?: RequestInit) => server.fetch(ASSISTANT_ID, path, init)

/** The section and step the author is at, and the selected text, for a chat message. */
const where = computed(() => {
  const position = navigator?.position()
  const section = selected.value?.section ?? position?.section
  return section ? { section, step: position?.section === section ? position.step : undefined, title: navigator?.title(section) ?? section } : undefined
})

/** A click on a block of the page picks it for an annotation (not on links, buttons or fields, not in the panel). */
async function pick(event: MouseEvent): Promise<void> {
  const target = event.target instanceof Element ? event.target : undefined
  if (!target || !navigator || target.closest('.pm-assistant-edit, a, button, input, textarea, select, label, summary, [contenteditable]')) return
  if (!document.getSelection()?.isCollapsed) return
  const element = target.closest<HTMLElement>('[data-block]')
  const section = element?.closest<HTMLElement>('[data-section]')?.dataset.section
  const id = element?.dataset.block
  if (!element || !section || !id) return
  const block = navigator.block(section, id)
  if (!block) return
  const source = { file: block.source.file, startLine: block.source.line, endLine: block.source.endLine ?? block.source.line }
  const label = `${navigator.title(section) ?? section} · ${id}`
  picked.value = { section, block: id, source, label, excerpt: '' }
  open.value = true
  const excerpt = await excerptOf(route, source)
  if (picked.value?.block === id && picked.value.section === section) picked.value = { ...picked.value, excerpt }
}

/** The picked block is outlined on the page. */
function outline(): void {
  for (const element of document.querySelectorAll('.pm-assistant-picked')) element.classList.remove('pm-assistant-picked')
  const now = picked.value
  if (!now) return
  document.querySelector(`[data-section="${CSS.escape(now.section)}"] [data-block="${CSS.escape(now.block)}"]`)?.classList.add('pm-assistant-picked')
}

/** How a change task taken up again is named: as when it was sent. */
const labelOf = (change: PendingChange) => change.kind === 'annotations'
  ? t.value.edit.send(change.annotations?.length ?? 0)
  : change.kind === 'transcript' ? t.value.edit.transcript(change.track ?? '') : change.prompt

const listener = (event: MouseEvent) => void pick(event)
watch([active, canChange], ([on, can]) => {
  document.removeEventListener('click', listener, true)
  if (on && can) {
    document.addEventListener('click', listener, true)
    // The change task under way when the page was loaded (a reload during its review).
    if (assistant.value) void resume(assistant.value, labelOf)
  } else {
    picked.value = undefined
  }
}, { immediate: true })
watch(picked, outline)
onBeforeUnmount(() => {
  document.removeEventListener('click', listener, true)
  picked.value = undefined
  outline()
})

function add(): void {
  addAnnotation(request.value)
  request.value = ''
}

function send(): void {
  if (agent.value) sendAnnotations(agent.value, t.value.edit.send(drafts.value.length))
}

function chat(): void {
  const client = agent.value
  if (!client || busy.value || !message.value.trim()) return
  const place = where.value
  const source = place && navigator?.source(place.section)
  const context: AgentContext = {
    document: '',
    ...place ? { section: place.section } : {},
    ...place?.step !== undefined ? { step: place.step } : {},
    ...selected.value?.block ? { block: selected.value.block } : {},
    ...selected.value ? { selection: selected.value.text } : {},
    ...source ? { source: { file: source.file, startLine: source.line, endLine: source.endLine ?? source.line } } : {},
  }
  sendChat(client, message.value, context)
  message.value = ''
  selected.value = undefined
}
</script>

<template>
  <span v-if="active" class="pm-assistant-edit-toolbar">
    <button type="button" :aria-expanded="open" @click="open = !open">
      {{ t.edit.toggle }}
    </button>
    <Teleport to="body">
      <aside v-if="open" class="pm-assistant-edit" :aria-label="t.edit.title">
        <header class="pm-assistant-edit__header">
          <h2>{{ t.edit.title }}</h2>
          <button type="button" @click="open = false">
            {{ t.edit.close }}
          </button>
        </header>
        <p v-if="!canChange" class="pm-assistant-edit__unavailable">
          {{ t.edit.unavailable }}
        </p>
        <template v-else>
          <ChangeTask v-for="change in current" :key="change.id" :change="change" />
          <section class="pm-assistant-edit__annotations" :aria-label="t.edit.annotations">
            <h3>{{ t.edit.annotations }}</h3>
            <form v-if="picked" class="pm-assistant-edit__pick" @submit.prevent="add">
              <p>{{ t.edit.picked(picked.label) }}</p>
              <pre v-if="picked.excerpt" class="pm-assistant-edit__excerpt">{{ picked.excerpt }}</pre>
              <textarea v-model="request" :aria-label="t.edit.request" :placeholder="t.edit.requestPlaceholder" rows="2" maxlength="4000" @keydown.stop />
              <p class="pm-assistant-edit__actions">
                <button type="submit" :disabled="!request.trim()">
                  {{ t.edit.add }}
                </button>
                <button type="button" @click="picked = undefined">
                  {{ t.edit.discard }}
                </button>
              </p>
            </form>
            <p v-else class="pm-assistant-edit__hint">
              {{ t.edit.pick }}
            </p>
            <ol v-if="annotations.length" class="pm-assistant-edit__list" :aria-label="t.edit.annotations">
              <li v-for="a in annotations" :key="a.id" class="pm-assistant-annotation" :data-annotation="a.id" :data-status="a.status">
                <p class="pm-assistant-annotation__where">
                  {{ a.source.file }}:{{ a.source.startLine }} · <span class="pm-assistant-annotation__status">{{ t.edit.status[a.status] }}</span>
                </p>
                <p class="pm-assistant-annotation__request">
                  {{ a.request }}
                </p>
                <p v-if="a.note" class="pm-assistant-annotation__note">
                  {{ a.note }}
                </p>
                <button v-if="a.status === 'draft'" type="button" @click="removeAnnotation(a.id)">
                  {{ t.edit.remove }}
                </button>
              </li>
            </ol>
            <p class="pm-assistant-edit__provider">
              {{ provider ? t.edit.provider(provider) : t.edit.unavailable }}
            </p>
            <p v-if="drafts.length" class="pm-assistant-edit__actions">
              <button type="button" class="pm-assistant-edit__send" :disabled="busy" @click="send">
                {{ t.edit.send(drafts.length) }}
              </button>
            </p>
          </section>

          <section class="pm-assistant-edit__chat" :aria-label="t.edit.chat">
            <h3>{{ t.edit.chat }}</h3>
            <p class="pm-assistant-edit__provider">
              {{ provider ? t.edit.provider(provider) : t.edit.unavailable }}
            </p>
            <p v-if="where" class="pm-assistant-edit__context">
              {{ t.edit.context(where.title) }}
            </p>
            <form @submit.prevent="chat">
              <textarea v-model="message" :aria-label="t.edit.message" :placeholder="t.edit.chatPlaceholder" rows="3" maxlength="4000" @keydown.stop />
              <p class="pm-assistant-edit__actions">
                <button type="submit" :disabled="!message.trim() || busy">
                  {{ t.edit.sendChat }}
                </button>
              </p>
            </form>
          </section>

          <ChangeTask v-for="change in past" :key="change.id" :change="change" />
        </template>
      </aside>
    </Teleport>
  </span>
</template>

<style scoped>
.pm-assistant-edit-toolbar > button,
.pm-assistant-edit button {
  padding: 0.1rem 0.5rem;
  border: 1px solid rgba(125, 125, 125, 0.5);
  border-radius: 0.25rem;
  background: transparent;
  color: inherit;
  font: inherit;
  font-size: 0.8125rem;
  cursor: pointer;
}
.pm-assistant-edit-toolbar > button {
  margin-left: 0.5rem;
  white-space: nowrap;
}
.pm-assistant-edit button:disabled {
  border-style: dashed;
  cursor: not-allowed;
}
.pm-assistant-edit {
  position: fixed;
  inset: 4.5rem 1rem 1rem auto;
  z-index: 60;
  box-sizing: border-box;
  display: grid;
  align-content: start;
  gap: 0.6rem;
  width: min(26rem, calc(100vw - 2rem));
  overflow: auto;
  padding: 0.75rem;
  border: 1px solid rgba(125, 125, 125, 0.4);
  border-radius: 0.375rem;
  background: var(--vp-c-bg, var(--slidev-theme-background, #fff));
  color: var(--vp-c-text-1, inherit);
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.2);
  font-size: 0.875rem;
  line-height: 1.5;
  text-align: left;
}
.pm-assistant-edit p,
.pm-assistant-edit h2,
.pm-assistant-edit h3 {
  margin: 0;
}
.pm-assistant-edit h2 {
  font-size: 1rem;
}
.pm-assistant-edit h3 {
  font-size: 0.9rem;
}
.pm-assistant-edit section {
  display: grid;
  gap: 0.35rem;
  padding-top: 0.5rem;
  border-top: 1px solid rgba(125, 125, 125, 0.3);
}
.pm-assistant-edit__header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.pm-assistant-edit textarea {
  box-sizing: border-box;
  width: 100%;
  font: inherit;
}
.pm-assistant-edit__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
}
.pm-assistant-edit__provider,
.pm-assistant-edit__hint,
.pm-assistant-edit__context,
.pm-assistant-annotation__where {
  color: var(--vp-c-text-2, inherit);
}
.pm-assistant-edit__list {
  display: grid;
  gap: 0.4rem;
  margin: 0;
  padding: 0;
  list-style: none;
}
.pm-assistant-annotation {
  padding-left: 0.5rem;
  border-left: 3px solid rgba(125, 125, 125, 0.4);
}
.pm-assistant-annotation[data-status='done'] {
  border-left-color: #15803d;
}
.pm-assistant-annotation[data-status='failed'] {
  border-left-color: #dc2626;
}
.pm-assistant-edit__excerpt {
  max-height: 8rem;
  margin: 0.2rem 0;
  overflow: auto;
  padding: 0.3rem;
  background: rgba(125, 125, 125, 0.1);
  font-size: 0.75rem;
  white-space: pre;
}
.pm-assistant-annotation[data-status='done'] .pm-assistant-annotation__status {
  color: #15803d;
}
.pm-assistant-annotation[data-status='failed'] .pm-assistant-annotation__status {
  color: #dc2626;
}
</style>

<style>
.pm-assistant-picked {
  outline: 2px solid var(--vp-c-brand-1, #3451b2);
  outline-offset: 2px;
}
</style>
