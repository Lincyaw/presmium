<script setup lang="ts">
// The question panel (P-112, decision E-9): until the reader filled in a model service of his own it says how
// questions are answered and asks for it (./AskSettings.vue); then it names the service's provider and model
// before anything is asked (N-08). A question goes with the current section, or with the text the reader
// selected in the deck; the answer streams in, and the places it cites are links that move the page there.
import { PmButton, useMessages } from '@presmium/host'
import type { AgentContext, Citation } from '@presmium/kernel'
import { computed, ref } from 'vue'
import { answerParts, askProvider, ASSISTANT_MESSAGES } from '../domain/index.ts'
import { askSettings } from './ask.ts'
import AskSettings from './AskSettings.vue'
import { ask, asker, exchanges, navigation, selected, showCitation, useNavigator } from './state.ts'

const emit = defineEmits<{ cited: [] }>()

const t = useMessages(ASSISTANT_MESSAGES)
const navigator = useNavigator()
const text = ref('')
const changing = ref(false)
const running = computed(() => exchanges.value.some(e => e.state === 'running'))
const service = computed(() => askSettings.value && { provider: askProvider(askSettings.value.url), model: askSettings.value.model })
/** Citations move the page where it can be moved: the IR runtime, or the host's navigation. */
const follows = computed(() => Boolean(navigator ?? navigation.value))

/** The place the question is about: the selection's section, else the page's. */
const place = computed(() => {
  const position = navigator?.position() ?? navigation.value?.position.value
  const section = selected.value?.section ?? position?.section
  return section ? { section, step: position?.section === section ? position.step : undefined, title: navigator?.title(section) ?? section } : undefined
})
const excerpt = computed(() => {
  const value = selected.value?.text ?? ''
  return value.length > 120 ? `${value.slice(0, 120)}…` : value
})

function submit(): void {
  const question = text.value.trim()
  const client = asker.value
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
  showCitation(citation)
  emit('cited')
}
</script>

<template>
  <div class="pm-assistant">
    <AskSettings v-if="!service || changing" @done="changing = false" />
    <template v-else>
      <p class="pm-assistant__provider">
        <span>{{ t.panel.provider(service.provider, service.model) }}</span>
        <PmButton class="pm-assistant__service" variant="ghost" small icon="sliders" @click="changing = true">
          {{ t.panel.service }}
        </PmButton>
      </p>
      <form class="pm-assistant__form" @submit.prevent="submit">
        <p v-if="selected" class="pm-assistant__selection">
          <span>{{ t.panel.selection }}</span>
          <code class="pm-ui-code">{{ excerpt }}</code>
          <PmButton variant="ghost" small @click="drop">
            {{ t.panel.dropSelection }}
          </PmButton>
        </p>
        <p v-if="place" class="pm-assistant__where">
          {{ t.panel.at(place.title) }}
        </p>
        <textarea v-model="text" class="pm-ui-textarea" :aria-label="t.panel.question" :placeholder="t.panel.placeholder" rows="3" maxlength="2000" @keydown.stop />
        <p class="pm-assistant__actions">
          <PmButton type="submit" variant="primary" small :disabled="!text.trim() || running">
            {{ t.panel.ask }}
          </PmButton>
        </p>
      </form>
    </template>
    <ol v-if="exchanges.length" class="pm-assistant__answers" :aria-label="t.panel.answers">
      <li v-for="exchange in exchanges" :key="exchange.id" :data-state="exchange.state">
        <p class="pm-assistant__question">
          {{ exchange.question }}
        </p>
        <p v-if="exchange.answer" class="pm-assistant__answer">
          <template v-for="(part, j) in answerParts(exchange.answer)" :key="j">
            <button v-if="part.citation && follows" type="button" class="pm-assistant__cite" :data-section="part.citation.section" :title="t.panel.cite(part.text)" @click="go(part.citation)">
              {{ part.text }}
            </button>
            <span v-else>{{ part.text }}</span>
          </template>
        </p>
        <p v-if="exchange.state === 'running'" class="pm-assistant__status" role="status">
          {{ t.panel.answering }}
          <PmButton variant="ghost" small @click="exchange.cancel()">
            {{ t.panel.cancel }}
          </PmButton>
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
  gap: var(--pm-space-3);
  color: var(--pm-color-ink);
  font-family: var(--pm-font-sans);
  font-size: var(--pm-text-md);
  line-height: var(--pm-leading-ui);
  text-align: left;
  white-space: normal;
  overflow-wrap: anywhere;
}
.pm-assistant p {
  margin: 0;
}
.pm-assistant__provider,
.pm-assistant__where,
.pm-assistant__status {
  color: var(--pm-color-muted);
  font-size: var(--pm-text-sm);
}
.pm-assistant__provider {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--pm-space-2);
}
.pm-assistant__form {
  display: grid;
  gap: var(--pm-space-2);
}
.pm-assistant__selection {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--pm-space-2);
  padding: var(--pm-space-2) var(--pm-space-3);
  border-radius: var(--pm-radius-control);
  background: var(--pm-color-selected);
}
.pm-assistant__selection code {
  max-width: 100%;
  white-space: pre-wrap;
}
.pm-assistant textarea {
  width: 100%;
}
.pm-assistant__actions {
  display: flex;
  justify-content: flex-end;
}
.pm-assistant__answers {
  display: grid;
  gap: var(--pm-space-3);
  margin: 0;
  padding: 0;
  list-style: none;
}
.pm-assistant__answers > li {
  display: grid;
  gap: var(--pm-space-2);
}
/* The question as the reader's own bubble, the answer as the reading text below it (docs/design/edit.dc.html). */
.pm-assistant__question {
  justify-self: end;
  max-width: 85%;
  padding: var(--pm-space-2) var(--pm-space-3);
  border-radius: var(--pm-radius-card);
  background: var(--pm-color-accent-soft);
  font-weight: 500;
}
.pm-assistant__answer {
  font-family: var(--pm-font-serif);
  font-size: var(--pm-text-lg);
  line-height: 1.7;
  white-space: pre-wrap;
}
.pm-assistant__cite {
  margin: 0;
  padding: 0;
  border: 0;
  background: none;
  color: var(--pm-color-accent);
  font: inherit;
  text-decoration: underline;
  text-underline-offset: 2px;
  cursor: pointer;
}
.pm-assistant__cite:focus-visible {
  outline: 2px solid var(--pm-color-accent);
  outline-offset: 2px;
}
.pm-assistant__error {
  color: var(--pm-color-danger);
}
</style>
