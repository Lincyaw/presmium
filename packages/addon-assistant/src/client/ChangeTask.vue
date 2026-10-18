<script setup lang="ts">
import { PmButton, useMessages, useServer } from '@presmium/host'
import { ASSISTANT_ID, ASSISTANT_MESSAGES } from '../domain/index.ts'
import { decide, keep, restoreTo, revert } from './edit.ts'
import type { ChangeState } from './edit.ts'

defineProps<{ change: ChangeState }>()

const t = useMessages(ASSISTANT_MESSAGES)
const server = useServer()
const route = (path: string, init?: RequestInit) => server.fetch(ASSISTANT_ID, path, init)

function diffLines(diff: string): { text: string, kind: 'add' | 'del' | 'hunk' | 'same' }[] {
  return diff.replace(/\n$/, '').split('\n').map(text => ({
    text,
    kind: text.startsWith('@@') ? 'hunk' : text.startsWith('+') && !text.startsWith('+++') ? 'add' : text.startsWith('-') && !text.startsWith('---') ? 'del' : 'same',
  }))
}
</script>

<template>
  <section class="pm-assistant-edit__task" :aria-label="t.edit.task" :data-task="change.id" :data-state="change.progress.state">
    <h3 class="pm-ui-heading">
      {{ t.edit.task }}
    </h3>
    <p class="pm-assistant-edit__label">
      {{ change.label }}
    </p>
    <template v-if="change.progress.state === 'running'">
      <p role="status">
        {{ change.progress.tool ? t.edit.tool(change.progress.tool) : t.edit.working }}
      </p>
      <p v-if="change.progress.steps.length" class="pm-assistant-edit__steps">
        {{ t.edit.steps(change.progress.steps.length) }}
      </p>
      <p class="pm-assistant-edit__actions">
        <PmButton small @click="change.task.cancel()">
          {{ t.edit.cancel }}
        </PmButton>
      </p>
    </template>
    <template v-else-if="change.progress.state === 'review' || change.progress.state === 'deciding'">
      <p class="pm-assistant-edit__engine">
        {{ t.edit.review(change.progress.engine ?? '') }}
      </p>
      <details v-if="change.progress.steps.length" class="pm-assistant-edit__steps">
        <summary>{{ t.edit.steps(change.progress.steps.length) }}</summary>
        <ol>
          <li v-for="step in change.progress.steps" :key="step.id" :data-step="step.id">
            {{ step.label }}: {{ step.changes.map(c => c.path).join(', ') || t.edit.noStepChange }}
            <button type="button" class="pm-assistant-edit__restore pm-ui-button pm-ui-button--ghost pm-ui-button--small" :aria-label="t.edit.restoreLabel(step.label)" :disabled="change.progress.state !== 'review'" @click="restoreTo(change.id, step.id, route)">
              {{ t.edit.restore }}
            </button>
          </li>
        </ol>
      </details>
      <ul class="pm-assistant-edit__changes">
        <li v-for="file in change.progress.changes" :key="file.path" class="pm-assistant-change" :data-path="file.path" :data-kind="file.kind">
          <label>
            <input type="checkbox" class="pm-ui-checkbox" :checked="!change.rejected.includes(file.path)" :aria-label="`${t.edit.keep} ${file.path}`" :disabled="change.progress.state !== 'review'" @change="keep(change.id, file.path, ($event.target as HTMLInputElement).checked)">
            <code>{{ file.path }}</code> {{ t.edit.kind[file.kind] }} +{{ file.added }} −{{ file.removed }}
          </label>
          <p v-if="file.binary" class="pm-assistant-change__binary">
            {{ t.edit.binary }}
          </p>
          <pre v-else-if="file.diff" class="pm-assistant-change__diff"><span v-for="(line, i) in diffLines(file.diff)" :key="i" :data-kind="line.kind">{{ line.text }}{{ '\n' }}</span></pre>
          <p v-else class="pm-assistant-change__binary">
            {{ t.edit.noDiff }}
          </p>
        </li>
      </ul>
      <p v-if="change.note" class="pm-assistant-edit__error" role="alert">
        {{ change.note }}
      </p>
      <p class="pm-assistant-edit__actions">
        <button type="button" class="pm-assistant-edit__accept pm-ui-button pm-ui-button--primary pm-ui-button--small" :disabled="change.progress.state !== 'review'" @click="decide(change.id, true)">
          {{ change.rejected.length ? t.edit.acceptSome(change.rejected.length) : t.edit.acceptAll }}
        </button>
        <button type="button" class="pm-assistant-edit__reject pm-ui-button pm-ui-button--small" :disabled="change.progress.state !== 'review'" @click="decide(change.id, false)">
          {{ t.edit.rejectAll }}
        </button>
      </p>
    </template>
    <template v-else-if="change.progress.state === 'done'">
      <p class="pm-assistant-edit__outcome" role="status">
        {{ change.progress.revision ? t.edit.committed(change.progress.revision) : change.progress.changes.length ? t.edit.rejected : t.edit.nothing }}
      </p>
      <p v-if="change.progress.revision && !change.reverted && !change.conflicts" class="pm-assistant-edit__actions">
        <button type="button" class="pm-assistant-edit__revert pm-ui-button pm-ui-button--small" @click="revert(change.id)">
          {{ t.edit.revert }}
        </button>
      </p>
      <p v-if="change.reverted" class="pm-assistant-edit__reverted" role="status">
        {{ t.edit.reverted(change.reverted) }}
      </p>
      <p v-if="change.conflicts" class="pm-assistant-edit__conflicts" role="alert">
        {{ t.edit.conflicts(change.conflicts) }}
      </p>
      <p v-if="change.note" class="pm-assistant-edit__error" role="alert">
        {{ change.note }}
      </p>
    </template>
    <p v-else class="pm-assistant-edit__error" role="alert">
      {{ t.edit.failed(change.progress.message ?? '') }}
    </p>
  </section>
</template>

<style scoped>
.pm-assistant-edit__task {
  display: grid;
  gap: var(--pm-space-2);
  padding: var(--pm-space-3);
  border: 1px solid var(--pm-color-line);
  border-radius: var(--pm-radius-card);
  background: var(--pm-color-surface);
}
.pm-assistant-edit__task p,
.pm-assistant-edit__task h3 {
  margin: 0;
}
.pm-assistant-edit__actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--pm-space-2);
}
.pm-assistant-edit__steps ol {
  margin: var(--pm-space-1) 0;
  padding-left: 1.2em;
}
.pm-assistant-edit__steps li {
  margin: var(--pm-space-1) 0;
}
.pm-assistant-edit__steps summary {
  cursor: pointer;
}
.pm-assistant-edit__restore {
  margin-left: var(--pm-space-1);
}
.pm-assistant-edit__steps,
.pm-assistant-edit__label,
.pm-assistant-edit__engine {
  color: var(--pm-color-muted);
  font-size: var(--pm-text-sm);
}
.pm-assistant-edit__changes {
  display: grid;
  gap: var(--pm-space-2);
  margin: 0;
  padding: 0;
  list-style: none;
}
.pm-assistant-change label {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--pm-space-1) var(--pm-space-2);
}
.pm-assistant-change code {
  font-family: var(--pm-font-mono);
  font-size: var(--pm-text-sm);
}
.pm-assistant-change__binary {
  color: var(--pm-color-muted);
}
.pm-assistant-change__diff {
  max-height: 16rem;
  margin: var(--pm-space-1) 0 0;
  overflow: auto;
  padding: var(--pm-space-2);
  border-radius: var(--pm-radius-small);
  background: var(--pm-color-code);
  font-family: var(--pm-font-mono);
  font-size: var(--pm-text-xs);
  line-height: 1.7;
  white-space: pre;
}
.pm-assistant-change__diff [data-kind='add'] {
  color: var(--pm-color-add);
}
.pm-assistant-change__diff [data-kind='del'] {
  color: var(--pm-color-del);
}
.pm-assistant-change__diff [data-kind='hunk'] {
  color: var(--pm-color-muted);
}
.pm-assistant-edit__error,
.pm-assistant-edit__conflicts {
  color: var(--pm-color-danger);
}
</style>
