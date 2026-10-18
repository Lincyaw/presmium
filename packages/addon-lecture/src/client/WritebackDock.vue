<script setup lang="ts">
import { PmButton, PmIconButton, useLocale, useMessages, useServer, useService } from '@presmium/host'
import { AGENT } from '@presmium/kernel'
import { computed, onMounted, ref } from 'vue'
import { LECTURE_ID, LECTURE_MESSAGES, SCRIPT_TRACK } from '../domain/index.ts'
import { writebackWanted } from './dock.ts'
import type { LectureSummary } from './source.ts'
import { decide, revert, sendNarration, sendTranslation, writebacks, writing } from './writeback.ts'

const LANGUAGES = ['en', 'zh-CN', 'ja', 'ko', 'fr', 'de', 'es']

const t = useMessages(LECTURE_MESSAGES)
const locale = useLocale()
const agent = useService(AGENT)
const server = useServer()
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

onMounted(() => void load())

function narrate(id: string): void {
  if (agent.value) sendNarration(agent.value, id, t.value.writeback.narrateLabel(id), t.value.writeback.narrateRequest(id))
}

function translate(id: string): void {
  const lang = into.value[id] ?? 'en'
  const name = languageName(lang)
  if (agent.value) sendTranslation(agent.value, id, t.value.writeback.translateLabel(id, name), t.value.writeback.translateRequest(id, name, lang))
}

function diffLines(diff: string): { text: string, kind: 'add' | 'del' | 'hunk' | 'same' }[] {
  return diff.replace(/\n$/, '').split('\n').map(text => ({
    text,
    kind: text.startsWith('@@') ? 'hunk' : text.startsWith('+') && !text.startsWith('+++') ? 'add' : text.startsWith('-') && !text.startsWith('---') ? 'del' : 'same',
  }))
}
</script>

<template>
  <section class="pm-lecture-writeback pm-ui" :aria-label="t.writeback.title">
    <header class="pm-lecture-writeback__header">
      <h2>{{ t.writeback.title }}</h2>
      <PmIconButton icon="close" :label="t.writeback.close" small @click="writebackWanted = false" />
    </header>
    <div class="pm-lecture-writeback__body">
      <p v-if="!can" class="pm-lecture-writeback__note">
        {{ t.writeback.unavailable }}
      </p>
      <template v-else>
        <p class="pm-lecture-writeback__note">
          {{ t.writeback.intro }}
        </p>
        <p class="pm-lecture-writeback__provider">
          {{ t.writeback.provider(provider ?? '') }}
        </p>
        <p v-if="lectures && lectures.length === 0" class="pm-lecture-writeback__note">
          {{ t.writeback.empty }}
        </p>
        <ul v-else-if="lectures" class="pm-lecture-writeback__lectures">
          <li v-for="l in lectures" :key="l.id" :data-track="l.id">
            <p>{{ t.writeback.lecture(l.id, l.utterances ?? 0) }}</p>
            <p v-if="!l.utterances" class="pm-lecture-writeback__note">
              {{ t.writeback.untranscribed }}
            </p>
            <p v-else class="pm-lecture-writeback__actions">
              <PmButton class="pm-lecture-writeback__narrate" variant="primary" small :disabled="busy" @click="narrate(l.id)">
                {{ t.writeback.narrate }}
              </PmButton>
              <label class="pm-lecture-writeback__language">
                {{ t.writeback.language }}
                <select v-model="into[l.id]" class="pm-ui-select" :disabled="busy">
                  <option v-for="tag in LANGUAGES.filter(tag => tag !== l.lang)" :key="tag" :value="tag">{{ languageName(tag) }}</option>
                </select>
              </label>
              <PmButton class="pm-lecture-writeback__translate" small :disabled="busy" @click="translate(l.id)">
                {{ t.writeback.translate }}
              </PmButton>
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
          :data-state="w.state.state"
        >
          <p class="pm-lecture-writeback__label">
            {{ w.label }}
          </p>
          <template v-if="w.state.state === 'running'">
            <p role="status">
              {{ w.state.tool ? t.writeback.tool(w.state.tool) : t.writeback.working }}
            </p>
            <p v-if="w.state.steps.length" class="pm-lecture-writeback__note">
              {{ t.writeback.steps(w.state.steps.length) }}
            </p>
            <p class="pm-lecture-writeback__actions">
              <PmButton small @click="w.task.cancel()">
                {{ t.writeback.cancel }}
              </PmButton>
            </p>
          </template>
          <template v-else-if="w.state.state === 'review' || w.state.state === 'deciding'">
            <p>{{ t.writeback.review(w.state.engine ?? '') }}</p>
            <details v-for="file in w.state.changes" :key="file.path" class="pm-lecture-writeback__change" :data-path="file.path">
              <summary><code>{{ file.path }}</code> +{{ file.added }} −{{ file.removed }}</summary>
              <p v-if="file.binary">
                {{ t.writeback.binary }}
              </p>
              <pre v-else-if="file.diff"><span v-for="(line, i) in diffLines(file.diff)" :key="i" :data-kind="line.kind">{{ line.text }}{{ '\n' }}</span></pre>
            </details>
            <p class="pm-lecture-writeback__actions">
              <PmButton class="pm-lecture-writeback__accept" variant="primary" small :disabled="w.state.state !== 'review'" @click="decide(w.id, true)">
                {{ t.writeback.accept }}
              </PmButton>
              <PmButton class="pm-lecture-writeback__reject" small :disabled="w.state.state !== 'review'" @click="decide(w.id, false)">
                {{ t.writeback.reject }}
              </PmButton>
            </p>
          </template>
          <template v-else-if="w.state.state === 'done'">
            <p role="status">
              {{ w.state.revision ? t.writeback.committed(w.state.revision) : w.state.changes.length ? t.writeback.rejected : t.writeback.nothing }}
            </p>
            <p v-if="w.state.revision && !w.reverted && !w.conflicts" class="pm-lecture-writeback__actions">
              <PmButton class="pm-lecture-writeback__revert" small @click="revert(w.id)">
                {{ t.writeback.revert }}
              </PmButton>
            </p>
            <p v-if="w.reverted" role="status">
              {{ t.writeback.reverted(w.reverted) }}
            </p>
            <p v-if="w.conflicts" role="alert">
              {{ t.writeback.conflicts(w.conflicts) }}
            </p>
            <p v-if="w.message" role="alert">
              {{ w.message }}
            </p>
          </template>
          <p v-else role="alert">
            {{ t.writeback.failed(w.state.message ?? '') }}
          </p>
        </section>
      </template>
    </div>
  </section>
</template>

<style scoped>
.pm-lecture-writeback {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-height: 0;
  text-align: left;
}
.pm-lecture-writeback:not(:first-child) {
  border-top: 1px solid var(--pm-color-line);
}
.pm-lecture-writeback p,
.pm-lecture-writeback h2 {
  margin: 0;
}
.pm-lecture-writeback__header {
  display: flex;
  flex: none;
  align-items: center;
  gap: var(--pm-space-2);
  padding: var(--pm-space-2) var(--pm-space-3) var(--pm-space-2) var(--pm-space-4);
  border-bottom: 1px solid var(--pm-color-line);
}
.pm-lecture-writeback__header h2 {
  flex: 1;
  padding: 0;
  border: 0;
  font-family: var(--pm-font-sans);
  font-size: var(--pm-text-md);
  font-weight: 600;
  line-height: var(--pm-leading-ui);
}
.pm-lecture-writeback__body {
  display: grid;
  flex: 1;
  align-content: start;
  gap: var(--pm-space-3);
  min-height: 0;
  overflow: auto;
  padding: var(--pm-space-3) var(--pm-space-4);
}
.pm-lecture-writeback__actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--pm-space-2);
}
.pm-lecture-writeback__language {
  display: inline-flex;
  align-items: center;
  gap: var(--pm-space-1);
}
.pm-lecture-writeback__note,
.pm-lecture-writeback__provider,
.pm-lecture-writeback__label {
  color: var(--pm-color-muted);
  font-size: var(--pm-text-sm);
}
.pm-lecture-writeback__lectures {
  display: grid;
  gap: var(--pm-space-2);
  margin: 0;
  padding: 0;
  list-style: none;
}
.pm-lecture-writeback__lectures > li {
  display: grid;
  gap: var(--pm-space-2);
  padding: var(--pm-space-3);
  border: 1px solid var(--pm-color-line);
  border-radius: var(--pm-radius-card);
  background: var(--pm-color-surface);
}
.pm-lecture-writeback__task {
  display: grid;
  gap: var(--pm-space-2);
  padding: var(--pm-space-3);
  border: 1px solid var(--pm-color-line);
  border-radius: var(--pm-radius-card);
  background: var(--pm-color-surface);
}
.pm-lecture-writeback__change summary {
  cursor: pointer;
}
.pm-lecture-writeback__change code {
  font-family: var(--pm-font-mono);
  font-size: var(--pm-text-sm);
}
.pm-lecture-writeback__change pre {
  max-height: 16rem;
  margin: var(--pm-space-1) 0;
  overflow: auto;
  padding: var(--pm-space-2);
  border-radius: var(--pm-radius-small);
  background: var(--pm-color-code);
  font-family: var(--pm-font-mono);
  font-size: var(--pm-text-xs);
  line-height: 1.7;
  white-space: pre;
}
.pm-lecture-writeback__change [data-kind='add'] {
  color: var(--pm-color-add);
}
.pm-lecture-writeback__change [data-kind='del'] {
  color: var(--pm-color-del);
}
.pm-lecture-writeback__change [data-kind='hunk'] {
  color: var(--pm-color-muted);
}
.pm-lecture-writeback [role='alert'] {
  color: var(--pm-color-danger);
}
</style>
