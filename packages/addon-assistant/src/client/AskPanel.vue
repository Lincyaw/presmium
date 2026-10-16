<script setup lang="ts">
// The question panel (P-112): it names the model's provider before anything is asked, and the runtime
// once an agent answered (N-08); a question goes with the current section, or with the text the reader
// selected in the deck; answers list the places they cite as links that move the page there.
import { useMessages } from '@presmium/host'
import type { AgentContext, Citation } from '@presmium/kernel'
import { computed, ref } from 'vue'
import { answerParts, ASSISTANT_MESSAGES } from '../domain/index.ts'
import { agent, ask, exchanges, selected, useNavigator } from './state.ts'

const emit = defineEmits<{ cited: [] }>()

const t = useMessages(ASSISTANT_MESSAGES)
const navigator = useNavigator()
const text = ref('')
const available = computed(() => agent.value?.available('question') ?? false)
const provider = computed(() => agent.value?.provider())
const runtime = computed(() => agent.value?.runtime())
const running = computed(() => exchanges.value.some(e => e.state === 'running'))

/** The place the question is about: the selection's section, else the page's. */
const place = computed(() => {
  const position = navigator?.position()
  const section = selected.value?.section ?? position?.section
  return section ? { section, step: position?.section === section ? position.step : undefined, title: navigator?.title(section) ?? section } : undefined
})
const excerpt = computed(() => {
  const value = selected.value?.text ?? ''
  return value.length > 120 ? `${value.slice(0, 120)}…` : value
})

function submit(): void {
  const question = text.value.trim()
  const client = agent.value
  if (!question || !client) return
  const context: AgentContext = {
    document: '',
    ...place.value ? { section: place.value.section } : {},
    ...place.value?.step !== undefined ? { step: place.value.step } : {},
    ...selected.value?.block ? { block: selected.value.block } : {},
    ...selected.value ? { selection: selected.value.text } : {},
  }
  ask(client, question, context)
  text.value = ''
  selected.value = undefined
}

function drop(): void {
  selected.value = undefined
}

function go(citation: Citation): void {
  navigator?.show(citation)
  emit('cited')
}
</script>

<template>
  <div class="pm-assistant">
    <p class="pm-assistant__provider">
      {{ provider ? t.panel.provider(provider) : t.panel.unavailable }}
    </p>
    <p v-if="provider && runtime" class="pm-assistant__runtime">
      {{ t.panel.runtime(runtime) }}
    </p>
    <form v-if="available" class="pm-assistant__form" @submit.prevent="submit">
      <p v-if="selected" class="pm-assistant__selection">
        <span>{{ t.panel.selection }}</span>
        <code>{{ excerpt }}</code>
        <button type="button" @click="drop">
          {{ t.panel.dropSelection }}
        </button>
      </p>
      <p v-if="place" class="pm-assistant__where">
        {{ t.panel.at(place.title) }}
      </p>
      <textarea v-model="text" :aria-label="t.panel.question" :placeholder="t.panel.placeholder" rows="3" maxlength="2000" @keydown.stop />
      <p class="pm-assistant__actions">
        <button type="submit" :disabled="!text.trim() || running">
          {{ t.panel.ask }}
        </button>
      </p>
    </form>
    <ol v-if="exchanges.length" class="pm-assistant__answers" :aria-label="t.panel.answers">
      <li v-for="exchange in exchanges" :key="exchange.id" :data-state="exchange.state">
        <p class="pm-assistant__question">
          {{ exchange.question }}
        </p>
        <p v-for="(answer, i) in exchange.answers" :key="i" class="pm-assistant__answer">
          <template v-for="(part, j) in answerParts(answer)" :key="j">
            <button v-if="part.citation && navigator" type="button" class="pm-assistant__cite" :data-section="part.citation.section" :title="t.panel.cite(part.text)" @click="go(part.citation)">
              {{ part.text }}
            </button>
            <span v-else>{{ part.text }}</span>
          </template>
        </p>
        <p v-if="exchange.state === 'running'" class="pm-assistant__status" role="status">
          {{ exchange.tool ? t.panel.tool(exchange.tool) : t.panel.answering }}
          <button type="button" @click="exchange.cancel()">
            {{ t.panel.cancel }}
          </button>
        </p>
        <p v-else-if="exchange.cancelled" class="pm-assistant__status">
          {{ t.panel.cancelled }}
        </p>
        <p v-else-if="exchange.state === 'failed'" class="pm-assistant__error" role="alert">
          {{ t.panel.failed(exchange.error ?? '') }}
        </p>
      </li>
    </ol>
  </div>
</template>

<style scoped>
.pm-assistant {
  display: grid;
  gap: 0.4rem;
  font-size: 0.875rem;
  line-height: 1.5;
  text-align: left;
  white-space: normal;
  overflow-wrap: anywhere;
}
.pm-assistant p {
  margin: 0;
}
.pm-assistant__provider,
.pm-assistant__runtime,
.pm-assistant__where,
.pm-assistant__status {
  color: var(--vp-c-text-2, inherit);
}
.pm-assistant__selection {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 0.35rem;
}
.pm-assistant__selection code {
  max-width: 100%;
  white-space: pre-wrap;
}
.pm-assistant textarea {
  box-sizing: border-box;
  width: 100%;
  font: inherit;
}
.pm-assistant button {
  padding: 0.1rem 0.5rem;
  border: 1px solid rgba(125, 125, 125, 0.5);
  border-radius: 0.25rem;
  background: transparent;
  color: inherit;
  font: inherit;
  cursor: pointer;
}
.pm-assistant button:disabled {
  border-style: dashed;
  cursor: not-allowed;
}
.pm-assistant__answers {
  margin: 0;
  padding-left: 1.2em;
}
.pm-assistant__answers > li {
  margin: 0.4rem 0;
}
.pm-assistant__question {
  font-weight: 600;
}
.pm-assistant__answer {
  white-space: pre-wrap;
}
.pm-assistant .pm-assistant__cite {
  padding: 0 0.2rem;
  border: none;
  color: var(--vp-c-brand-1, #3451b2);
  text-decoration: underline;
}
.pm-assistant__error {
  color: #dc2626;
}
</style>
