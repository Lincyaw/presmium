<script setup lang="ts">
// One change task in the edit panel: its progress and steps while the agent works, its review file by file
// (each kept or rejected; a unified diff for text, binary files only named) with a return to before each step
// (P-115), its commit and the undo of it. What its events say is `change.progress` (the host's `trackAgentTask`).
import { useMessages, useServer } from '@presmium/host'
import { ASSISTANT_ID, ASSISTANT_MESSAGES } from '../domain/index.ts'
import { decide, keep, restoreTo, revert } from './edit.ts'
import type { ChangeState } from './edit.ts'

defineProps<{ change: ChangeState }>()

const t = useMessages(ASSISTANT_MESSAGES)
const server = useServer()
const route = (path: string, init?: RequestInit) => server.fetch(ASSISTANT_ID, path, init)
</script>

<template>
  <section class="pm-assistant-edit__task" :aria-label="t.edit.task" :data-task="change.id" :data-state="change.progress.state">
    <h3>{{ t.edit.task }}</h3>
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
        <button type="button" @click="change.task.cancel()">
          {{ t.edit.cancel }}
        </button>
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
            <button type="button" class="pm-assistant-edit__restore" :aria-label="t.edit.restoreLabel(step.label)" :disabled="change.progress.state !== 'review'" @click="restoreTo(change.id, step.id, route)">
              {{ t.edit.restore }}
            </button>
          </li>
        </ol>
      </details>
      <ul class="pm-assistant-edit__changes">
        <li v-for="file in change.progress.changes" :key="file.path" class="pm-assistant-change" :data-path="file.path" :data-kind="file.kind">
          <label>
            <input type="checkbox" :checked="!change.rejected.includes(file.path)" :aria-label="`${t.edit.keep} ${file.path}`" :disabled="change.progress.state !== 'review'" @change="keep(change.id, file.path, ($event.target as HTMLInputElement).checked)">
            <code>{{ file.path }}</code> {{ t.edit.kind[file.kind] }} +{{ file.added }} −{{ file.removed }}
          </label>
          <p v-if="file.binary" class="pm-assistant-change__binary">
            {{ t.edit.binary }}
          </p>
          <pre v-else-if="file.diff" class="pm-assistant-change__diff">{{ file.diff }}</pre>
          <p v-else class="pm-assistant-change__binary">
            {{ t.edit.noDiff }}
          </p>
        </li>
      </ul>
      <p v-if="change.note" class="pm-assistant-edit__error" role="alert">
        {{ change.note }}
      </p>
      <p class="pm-assistant-edit__actions">
        <button type="button" class="pm-assistant-edit__accept" :disabled="change.progress.state !== 'review'" @click="decide(change.id, true)">
          {{ change.rejected.length ? t.edit.acceptSome(change.rejected.length) : t.edit.acceptAll }}
        </button>
        <button type="button" class="pm-assistant-edit__reject" :disabled="change.progress.state !== 'review'" @click="decide(change.id, false)">
          {{ t.edit.rejectAll }}
        </button>
      </p>
    </template>
    <template v-else-if="change.progress.state === 'done'">
      <p class="pm-assistant-edit__outcome" role="status">
        {{ change.progress.revision ? t.edit.committed(change.progress.revision) : change.progress.changes.length ? t.edit.rejected : t.edit.nothing }}
      </p>
      <p v-if="change.progress.revision && !change.reverted && !change.conflicts" class="pm-assistant-edit__actions">
        <button type="button" class="pm-assistant-edit__revert" @click="revert(change.id)">
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
  gap: 0.35rem;
  padding-top: 0.5rem;
  border-top: 1px solid rgba(125, 125, 125, 0.3);
}
.pm-assistant-edit__task p,
.pm-assistant-edit__task h3 {
  margin: 0;
}
.pm-assistant-edit__task h3 {
  font-size: 0.9rem;
}
.pm-assistant-edit__task button {
  padding: 0.1rem 0.5rem;
  border: 1px solid rgba(125, 125, 125, 0.5);
  border-radius: 0.25rem;
  background: transparent;
  color: inherit;
  font: inherit;
  font-size: 0.8125rem;
  cursor: pointer;
}
.pm-assistant-edit__task button:disabled {
  border-style: dashed;
  cursor: not-allowed;
}
.pm-assistant-edit__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
}
.pm-assistant-edit__steps ol {
  margin: 0.2rem 0;
  padding-left: 1.2em;
}
.pm-assistant-edit__steps li {
  margin: 0.15rem 0;
}
.pm-assistant-edit__restore {
  margin-left: 0.35rem;
}
.pm-assistant-edit__steps,
.pm-assistant-edit__label {
  color: var(--vp-c-text-2, inherit);
}
.pm-assistant-edit__changes {
  display: grid;
  gap: 0.3rem;
  margin: 0;
  padding: 0;
  list-style: none;
}
.pm-assistant-change__diff {
  max-height: 16rem;
  margin: 0.2rem 0;
  overflow: auto;
  padding: 0.3rem;
  background: rgba(125, 125, 125, 0.1);
  font-size: 0.75rem;
  white-space: pre;
}
.pm-assistant-edit__error,
.pm-assistant-edit__conflicts {
  color: #dc2626;
}
</style>
