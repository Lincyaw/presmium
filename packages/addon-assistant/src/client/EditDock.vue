<script setup lang="ts">
import { blockAt, blockElement, blockKey, PmBadge, PmButton, PmIconButton, splitBlockKey, useMessages, useServer } from '@presmium/host'
import type { AgentContext } from '@presmium/kernel'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { ASSISTANT_ID, ASSISTANT_MESSAGES } from '../domain/index.ts'
import type { PendingChange } from '../domain/index.ts'
import ChangeTask from './ChangeTask.vue'
import { panelWanted } from './dock.ts'
import { addAnnotation, annotations, busy, changes, excerptOf, picked, removeAnnotation, resume, sendAnnotations, sendChat } from './edit.ts'
import { CLIENT_MESSAGES } from './messages.ts'
import ModelSettings from './ModelSettings.vue'
import { agent, assistant, selected, useNavigator } from './state.ts'

const t = useMessages(ASSISTANT_MESSAGES)
const c = useMessages(CLIENT_MESSAGES)
const server = useServer()
const navigator = useNavigator()
const provider = computed(() => agent.value?.provider())
const settings = ref<InstanceType<typeof ModelSettings>>()

const drafts = computed(() => annotations.value.filter(a => a.status === 'draft'))
const current = computed(() => (busy.value ? changes.value.slice(0, 1) : []))
const past = computed(() => (busy.value ? changes.value.slice(1) : changes.value))
const request = ref('')
const message = ref('')

const route = (path: string, init?: RequestInit) => server.fetch(ASSISTANT_ID, path, init)

const where = computed(() => {
  const position = navigator?.position()
  const section = selected.value?.section ?? position?.section
  return section ? { section, step: position?.section === section ? position.step : undefined, title: navigator?.title(section) ?? section } : undefined
})

async function pick(event: MouseEvent): Promise<void> {
  const target = event.target instanceof Element ? event.target : undefined
  if (!target || !navigator || target.closest('.pm-assistant-edit, .pm-edit-dock, .pm-edit-source, a, button, input, textarea, select, label, summary, [contenteditable]')) return
  if (!document.getSelection()?.isCollapsed) return
  const [section, id] = splitBlockKey(blockAt(event.clientX, event.clientY)?.key ?? '') ?? []
  if (!section || !id) return
  const block = navigator.block(section, id)
  if (!block) return
  const source = { file: block.source.file, startLine: block.source.line, endLine: block.source.endLine ?? block.source.line }
  const label = `${navigator.title(section) ?? section} · ${id}`
  picked.value = { section, block: id, source, label, excerpt: '' }
  const excerpt = await excerptOf(route, source)
  if (picked.value?.block === id && picked.value.section === section) picked.value = { ...picked.value, excerpt }
}

function outline(): void {
  for (const element of document.querySelectorAll('.pm-assistant-picked')) element.classList.remove('pm-assistant-picked')
  const now = picked.value
  if (!now) return
  blockElement(blockKey(now.section, now.block))?.classList.add('pm-assistant-picked')
}

const labelOf = (change: PendingChange) => change.kind === 'annotations'
  ? t.value.edit.send(change.annotations?.length ?? 0)
  : change.kind === 'transcript' ? t.value.edit.transcript(change.track ?? '') : change.prompt

const listener = (event: MouseEvent) => void pick(event)
onMounted(() => {
  document.addEventListener('click', listener, true)
  if (assistant.value) void resume(assistant.value, labelOf)
})
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

function onChatKey(event: KeyboardEvent): void {
  event.stopPropagation()
  if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
    event.preventDefault()
    chat()
  }
}
</script>

<template>
  <section class="pm-assistant-edit pm-ui" :aria-label="t.edit.title">
    <header class="pm-assistant-edit__header">
      <h2 class="pm-assistant-edit__title">
        {{ t.edit.toggle }}
      </h2>
      <PmBadge v-if="provider" class="pm-assistant-edit__model">
        {{ provider }}
      </PmBadge>
      <PmIconButton icon="sliders" :label="c.dock.settings" small @click="settings?.open()" />
      <PmIconButton icon="close" :label="c.dock.close" small @click="panelWanted = false" />
      <ModelSettings ref="settings" />
    </header>
    <div class="pm-assistant-edit__body">
      <ChangeTask v-for="change in current" :key="change.id" :change="change" />
      <section class="pm-assistant-edit__annotations" :aria-label="t.edit.annotations">
        <h3 class="pm-ui-heading">
          {{ t.edit.annotations }}
        </h3>
        <form v-if="picked" class="pm-assistant-edit__pick" @submit.prevent="add">
          <p>{{ t.edit.picked(picked.label) }}</p>
          <pre v-if="picked.excerpt" class="pm-assistant-edit__excerpt">{{ picked.excerpt }}</pre>
          <textarea v-model="request" class="pm-ui-textarea" :aria-label="t.edit.request" :placeholder="t.edit.requestPlaceholder" rows="2" maxlength="4000" @keydown.stop />
          <p class="pm-assistant-edit__actions">
            <PmButton type="submit" variant="primary" small :disabled="!request.trim()">
              {{ t.edit.add }}
            </PmButton>
            <PmButton small @click="picked = undefined">
              {{ t.edit.discard }}
            </PmButton>
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
            <PmButton v-if="a.status === 'draft'" variant="ghost" small @click="removeAnnotation(a.id)">
              {{ t.edit.remove }}
            </PmButton>
          </li>
        </ol>
        <p class="pm-assistant-edit__provider">
          {{ provider ? t.edit.provider(provider) : t.edit.unavailable }}
        </p>
        <p v-if="drafts.length" class="pm-assistant-edit__actions">
          <PmButton class="pm-assistant-edit__send" variant="primary" small :disabled="busy" @click="send">
            {{ t.edit.send(drafts.length) }}
          </PmButton>
        </p>
      </section>
      <ChangeTask v-for="change in past" :key="change.id" :change="change" />
    </div>
    <section class="pm-assistant-edit__chat" :aria-label="t.edit.chat">
      <h3 class="pm-ui-sr-only">
        {{ t.edit.chat }}
      </h3>
      <form class="pm-assistant-edit__composer" @submit.prevent="chat">
        <p v-if="where" class="pm-assistant-edit__context">
          {{ t.edit.context(where.title) }}
        </p>
        <textarea v-model="message" :aria-label="t.edit.message" :placeholder="t.edit.chatPlaceholder" rows="3" maxlength="4000" @keydown="onChatKey" />
        <p class="pm-assistant-edit__send-row">
          <span class="pm-assistant-edit__provider">{{ provider ? t.edit.provider(provider) : t.edit.unavailable }}</span>
          <PmButton type="submit" variant="primary" small :disabled="!message.trim() || busy">
            {{ t.edit.sendChat }}
          </PmButton>
        </p>
      </form>
    </section>
  </section>
</template>

<style scoped>
.pm-assistant-edit {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-height: 0;
  background: var(--pm-color-bg);
  text-align: left;
}
.pm-assistant-edit p,
.pm-assistant-edit h2,
.pm-assistant-edit h3 {
  margin: 0;
}
.pm-assistant-edit__header {
  display: flex;
  flex: none;
  align-items: center;
  gap: var(--pm-space-1);
  padding: var(--pm-space-2) var(--pm-space-3) var(--pm-space-2) var(--pm-space-4);
  border-bottom: 1px solid var(--pm-color-line);
}
.pm-assistant-edit__title {
  flex: 1;
  font-family: var(--pm-font-sans);
  font-size: var(--pm-text-md);
  font-weight: 600;
}
.pm-assistant-edit__model {
  margin-right: var(--pm-space-1);
}
.pm-assistant-edit__body {
  display: grid;
  flex: 1;
  align-content: start;
  gap: var(--pm-space-3);
  min-height: 0;
  overflow: auto;
  padding: var(--pm-space-3) var(--pm-space-4);
}
.pm-assistant-edit__annotations {
  display: grid;
  gap: var(--pm-space-2);
}
.pm-assistant-edit__pick {
  display: grid;
  gap: var(--pm-space-2);
  padding: var(--pm-space-3);
  border: 1px solid var(--pm-color-line);
  border-radius: var(--pm-radius-card);
  background: var(--pm-color-surface);
}
.pm-assistant-edit__actions,
.pm-assistant-edit__send-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--pm-space-2);
}
.pm-assistant-edit__send-row {
  justify-content: space-between;
}
.pm-assistant-edit__provider,
.pm-assistant-edit__hint,
.pm-assistant-edit__context,
.pm-assistant-annotation__where {
  color: var(--pm-color-muted);
  font-size: var(--pm-text-sm);
}
.pm-assistant-edit__list {
  display: grid;
  gap: var(--pm-space-2);
  margin: 0;
  padding: 0;
  list-style: none;
}
.pm-assistant-annotation {
  padding: var(--pm-space-2) var(--pm-space-3);
  border-left: 3px solid var(--pm-color-line-strong);
  border-radius: 0 var(--pm-radius-small) var(--pm-radius-small) 0;
  background: var(--pm-color-surface);
}
.pm-assistant-annotation[data-status='done'] {
  border-left-color: var(--pm-color-ok);
}
.pm-assistant-annotation[data-status='failed'] {
  border-left-color: var(--pm-color-danger);
}
.pm-assistant-annotation[data-status='done'] .pm-assistant-annotation__status {
  color: var(--pm-color-ok);
}
.pm-assistant-annotation[data-status='failed'] .pm-assistant-annotation__status {
  color: var(--pm-color-danger);
}
.pm-assistant-edit__excerpt {
  max-height: 8rem;
  margin: 0;
  overflow: auto;
  padding: var(--pm-space-2);
  border-radius: var(--pm-radius-small);
  background: var(--pm-color-code);
  font-family: var(--pm-font-mono);
  font-size: var(--pm-text-xs);
  white-space: pre;
}
.pm-assistant-edit__chat {
  flex: none;
  padding: var(--pm-space-3);
  border-top: 1px solid var(--pm-color-line);
}
.pm-assistant-edit__composer {
  display: grid;
  gap: var(--pm-space-2);
  padding: var(--pm-space-2) var(--pm-space-3);
  border: 1px solid var(--pm-color-line-strong);
  border-radius: var(--pm-radius-card);
  background: var(--pm-color-surface);
}
.pm-assistant-edit__composer:focus-within {
  border-color: var(--pm-color-accent);
}
.pm-assistant-edit__composer textarea {
  box-sizing: border-box;
  width: 100%;
  margin: 0;
  padding: 0;
  border: 0;
  outline: 0;
  background: transparent;
  color: var(--pm-color-ink);
  font: inherit;
  resize: none;
}
.pm-assistant-edit__composer textarea::placeholder {
  color: var(--pm-color-muted);
  opacity: 1;
}
</style>

<style>
.pm-assistant-picked {
  outline: 2px solid var(--pm-color-accent);
  outline-offset: 4px;
  border-radius: 2px;
}
</style>
