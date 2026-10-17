<script setup lang="ts">
// The lecture panel of edit mode (P-136, P-137; the workspace's `EDIT_MODE`): the deck's recorded lectures, each
// handed to the agent as "narration from the transcript" (a `transcript` task) or "translate" (a `chat` task on
// its track), with the model's provider named (N-08). The tasks sent from here follow, newest first: progress,
// the review of the changed files (accept or reject all), the commit and the undo of it. The assistant runs,
// reviews and commits them (./writeback.ts); in the toolbar while edit mode is on, the panel beside the page.
import { EDIT_MODE, useLocale, useMessages, useServer, useService } from '@presmium/host'
import { AGENT } from '@presmium/kernel'
import { computed, ref, watch } from 'vue'
import { LECTURE_ID, LECTURE_MESSAGES, SCRIPT_TRACK } from '../domain/index.ts'
import type { LectureSummary } from './source.ts'
import { decide, revert, sendNarration, sendTranslation, writebacks, writing } from './writeback.ts'

/** Languages to translate into; each named in the UI language. */
const LANGUAGES = ['en', 'zh-CN', 'ja', 'ko', 'fr', 'de', 'es']

const t = useMessages(LECTURE_MESSAGES)
const locale = useLocale()
const editMode = useService(EDIT_MODE)
const agent = useService(AGENT)
const server = useServer()
const active = computed(() => editMode.value?.active.value ?? false)
const open = ref(false)
const lectures = ref<(LectureSummary & { utterances?: number })[]>()
const into = ref<Record<string, string>>({})
const can = computed(() => (agent.value?.available('transcript') ?? false) && (agent.value?.available('chat') ?? false))
const provider = computed(() => agent.value?.provider())
const busy = computed(() => writing())

function languageName(tag: string): string {
  try {
    return new Intl.DisplayNames([locale.value], { type: 'language' }).of(tag) ?? tag
  } catch {
    return tag
  }
}

async function load(): Promise<void> {
  try {
    const response = await server.fetch(LECTURE_ID, 'tracks')
    const list = response.ok ? await response.json() as (LectureSummary & { utterances?: number })[] : []
    lectures.value = list.filter(l => l.id !== SCRIPT_TRACK)
    for (const l of lectures.value) into.value[l.id] ??= LANGUAGES.find(tag => !l.lang || tag.split('-')[0] !== l.lang.split('-')[0]) ?? 'en'
  } catch {
    lectures.value = []
  }
}

watch([active, open], ([on, shown]) => {
  if (on && shown) void load()
})

function narrate(id: string): void {
  if (agent.value) sendNarration(agent.value, id, t.value.writeback.narrateLabel(id), t.value.writeback.narrateRequest(id))
}

function translate(id: string): void {
  const lang = into.value[id] ?? 'en'
  const name = languageName(lang)
  if (agent.value) sendTranslation(agent.value, id, t.value.writeback.translateLabel(id, name), t.value.writeback.translateRequest(id, name, lang))
}
</script>

<template>
  <span v-if="active && agent" class="pm-lecture-writeback-toolbar">
    <button type="button" class="pm-lecture-writeback__toggle" :aria-expanded="open" @click="open = !open">
      {{ t.writeback.toggle }}
    </button>
    <Teleport to="body">
      <aside v-if="open" class="pm-lecture-writeback" :aria-label="t.writeback.title">
        <header class="pm-lecture-writeback__header">
          <h2>{{ t.writeback.title }}</h2>
          <button type="button" @click="open = false">{{ t.writeback.close }}</button>
        </header>
        <p v-if="!can" class="pm-lecture-writeback__note">{{ t.writeback.unavailable }}</p>
        <template v-else>
          <p class="pm-lecture-writeback__note">{{ t.writeback.intro }}</p>
          <p class="pm-lecture-writeback__provider">{{ t.writeback.provider(provider ?? '') }}</p>
          <p v-if="lectures && lectures.length === 0" class="pm-lecture-writeback__note">{{ t.writeback.empty }}</p>
          <ul v-else-if="lectures" class="pm-lecture-writeback__lectures">
            <li v-for="l in lectures" :key="l.id" :data-track="l.id">
              <p>{{ t.writeback.lecture(l.id, l.utterances ?? 0) }}</p>
              <p v-if="!l.utterances" class="pm-lecture-writeback__note">{{ t.writeback.untranscribed }}</p>
              <p v-else class="pm-lecture-writeback__actions">
                <button type="button" class="pm-lecture-writeback__narrate" :disabled="busy" @click="narrate(l.id)">{{ t.writeback.narrate }}</button>
                <label>
                  {{ t.writeback.language }}
                  <select v-model="into[l.id]" :disabled="busy">
                    <option v-for="tag in LANGUAGES.filter(tag => tag !== l.lang)" :key="tag" :value="tag">{{ languageName(tag) }}</option>
                  </select>
                </label>
                <button type="button" class="pm-lecture-writeback__translate" :disabled="busy" @click="translate(l.id)">{{ t.writeback.translate }}</button>
              </p>
            </li>
          </ul>
          <section
            v-for="w in writebacks"
            :key="w.id"
            class="pm-lecture-writeback__task"
            :aria-label="t.writeback.task"
            :data-task="w.id"
            :data-kind="w.kind"
            :data-state="w.state"
          >
            <p class="pm-lecture-writeback__label">{{ w.label }}</p>
            <template v-if="w.state === 'running'">
              <p role="status">{{ w.tool ? t.writeback.tool(w.tool) : t.writeback.working }}</p>
              <p v-if="w.steps" class="pm-lecture-writeback__note">{{ t.writeback.steps(w.steps) }}</p>
              <p class="pm-lecture-writeback__actions">
                <button type="button" @click="w.task.cancel()">{{ t.writeback.cancel }}</button>
              </p>
            </template>
            <template v-else-if="w.state === 'review' || w.state === 'deciding'">
              <p>{{ t.writeback.review(w.engine ?? '') }}</p>
              <details v-for="file in w.changes" :key="file.path" class="pm-lecture-writeback__change" :data-path="file.path">
                <summary><code>{{ file.path }}</code> +{{ file.added }} −{{ file.removed }}</summary>
                <p v-if="file.binary">{{ t.writeback.binary }}</p>
                <pre v-else-if="file.diff">{{ file.diff }}</pre>
              </details>
              <p class="pm-lecture-writeback__actions">
                <button type="button" class="pm-lecture-writeback__accept" :disabled="w.state !== 'review'" @click="decide(w.id, true)">{{ t.writeback.accept }}</button>
                <button type="button" class="pm-lecture-writeback__reject" :disabled="w.state !== 'review'" @click="decide(w.id, false)">{{ t.writeback.reject }}</button>
              </p>
            </template>
            <template v-else-if="w.state === 'done'">
              <p role="status">{{ w.revision ? t.writeback.committed(w.revision) : w.changes.length ? t.writeback.rejected : t.writeback.nothing }}</p>
              <p v-if="w.revision && !w.reverted && !w.conflicts" class="pm-lecture-writeback__actions">
                <button type="button" class="pm-lecture-writeback__revert" @click="revert(w.id, server)">{{ t.writeback.revert }}</button>
              </p>
              <p v-if="w.reverted" role="status">{{ t.writeback.reverted(w.reverted) }}</p>
              <p v-if="w.conflicts" role="alert">{{ t.writeback.conflicts(w.conflicts) }}</p>
              <p v-if="w.message" role="alert">{{ w.message }}</p>
            </template>
            <p v-else role="alert">{{ t.writeback.failed(w.message ?? '') }}</p>
          </section>
        </template>
      </aside>
    </Teleport>
  </span>
</template>

<style>
.pm-lecture-writeback-toolbar > button,
.pm-lecture-writeback button {
  padding: 0.1rem 0.5rem;
  border: 1px solid rgba(125, 125, 125, 0.5);
  border-radius: 0.25rem;
  background: transparent;
  color: inherit;
  font: inherit;
  font-size: 0.8125rem;
  cursor: pointer;
}
.pm-lecture-writeback-toolbar > button {
  margin-left: 0.5rem;
  white-space: nowrap;
}
.pm-lecture-writeback button:disabled {
  border-style: dashed;
  cursor: not-allowed;
}
.pm-lecture-writeback {
  position: fixed;
  inset: 4.5rem auto 1rem 1rem;
  z-index: 60;
  box-sizing: border-box;
  display: grid;
  align-content: start;
  gap: 0.5rem;
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
.pm-lecture-writeback p,
.pm-lecture-writeback h2 {
  margin: 0;
}
.pm-lecture-writeback h2 {
  font-size: 1rem;
}
.pm-lecture-writeback__header,
.pm-lecture-writeback__actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.35rem;
}
.pm-lecture-writeback__header {
  justify-content: space-between;
}
.pm-lecture-writeback__note,
.pm-lecture-writeback__provider,
.pm-lecture-writeback__label {
  color: var(--vp-c-text-2, inherit);
}
.pm-lecture-writeback__lectures {
  display: grid;
  gap: 0.4rem;
  margin: 0;
  padding: 0;
  list-style: none;
}
.pm-lecture-writeback__task {
  display: grid;
  gap: 0.3rem;
  padding-top: 0.5rem;
  border-top: 1px solid rgba(125, 125, 125, 0.3);
}
.pm-lecture-writeback__change pre {
  max-height: 16rem;
  margin: 0.2rem 0;
  overflow: auto;
  padding: 0.3rem;
  background: rgba(125, 125, 125, 0.1);
  font-size: 0.75rem;
  white-space: pre;
}
.pm-lecture-writeback [role='alert'] {
  color: #dc2626;
}
</style>
