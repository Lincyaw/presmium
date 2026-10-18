<script setup lang="ts">
import { useMessages, useViewRole } from '@presmium/host'
import type { VNode } from 'vue'
import { computed, ref, useId, useSlots, watch } from 'vue'
import { browserStore } from '../src/client/local.ts'
import { useClassroomStore, useCollection, useSession, useWrite } from '../src/client/use.ts'
import { COLLECTIONS, isPrediction, isSavedPrediction, MESSAGES, placeKey, predictionId } from '../src/domain/index.ts'
import type { Place, Prediction, SavedPrediction } from '../src/domain/index.ts'
import '../src/client/style.css'

const props = defineProps<{
  question: string
  choices?: string[]
  reveal?: string[]
  notes?: string[]
  place?: Place
}>()

const role = useViewRole()
const { me, status, joined, presenter } = useSession()
const store = useClassroomStore()
const kept = useCollection(browserStore, COLLECTIONS.predictions, isSavedPrediction)
const predictions = useCollection(() => store.value, COLLECTIONS.predictions, isPrediction)
const { failure, write } = useWrite()
const t = useMessages(MESSAGES)
const name = useId()
const slots = useSlots()

const id = computed(() => (props.place ? placeKey(props.place) : ''))
const saved = computed(() => kept.value.find(item => item.id === id.value)?.value)
const sent = computed(() => me.value !== undefined && predictions.value.some(item => item.id === predictionId(id.value, me.value!.id)))
const held = computed(() => role.value === 'reader' && !saved.value)

const choice = ref<number>()
const text = ref('')
const ready = computed(() => (props.choices ? choice.value !== undefined : text.value.trim() !== ''))
watch(saved, (prediction) => {
  if (prediction) {
    choice.value = prediction.choice
    text.value = prediction.text ?? ''
  }
}, { immediate: true })
const savedText = computed(() => (saved.value?.choice !== undefined ? props.choices?.[saved.value.choice] : saved.value?.text) ?? '')

function save(): void {
  if (!ready.value || saved.value || !id.value) return
  const prediction: SavedPrediction = props.choices ? { choice: choice.value!, at: Date.now() } : { text: text.value.trim(), at: Date.now() }
  browserStore().put<SavedPrediction>(COLLECTIONS.predictions, id.value, prediction)
  const participant = me.value
  if (!store.value || !participant || !props.place || !joined.value || presenter.value || status.value !== 'active') return
  write(() => store.value!.put<Prediction>(COLLECTIONS.predictions, predictionId(id.value, participant.id), {
    ...props.place!,
    predict: id.value,
    participant: participant.id,
    question: props.question,
    ...props.choices ? { choices: props.choices } : {},
    ...prediction,
  }))
}

function children(part: 'prompt' | 'reveal'): VNode[] {
  const nodes = slots.default?.() ?? []
  const notes = props.notes ?? []
  const ids = [...props.reveal ?? [], ...notes]
  const revealed = (node: VNode) => ids.includes(String(node.key))
  if (ids.length > 0 && !nodes.some(revealed)) return part === 'reveal' ? nodes : []
  if (part === 'prompt') return nodes.filter(node => !revealed(node))
  return nodes.filter(node => revealed(node) && (role.value === 'reader' || !notes.includes(String(node.key))))
}
const Children = ({ part }: { part: 'prompt' | 'reveal' }) => children(part)
</script>

<template>
  <div class="pm-predict pm-classroom-card" :data-predict="id" :data-state="saved ? 'saved' : 'open'">
    <p class="pm-predict__question">
      {{ question }}
    </p>
    <Children part="prompt" />
    <form class="pm-predict__form" @submit.prevent="save" @keydown.stop>
      <fieldset v-if="choices" class="pm-predict__choices" :disabled="saved !== undefined">
        <legend>{{ t.predict.yours }}</legend>
        <label v-for="(item, i) in choices" :key="i">
          <input v-model="choice" class="pm-ui-checkbox" type="radio" :name="name" :value="i">
          <span>{{ item }}</span>
        </label>
      </fieldset>
      <textarea v-else v-model="text" class="pm-ui-textarea" :aria-label="t.predict.yours" :placeholder="t.predict.placeholder" rows="2" maxlength="500" :disabled="saved !== undefined" />
      <p v-if="!saved" class="pm-classroom-actions">
        <button type="submit" class="pm-ui-button pm-ui-button--primary pm-ui-button--small" :disabled="!ready">
          {{ t.predict.save }}
        </button>
      </p>
    </form>
    <p v-if="saved" class="pm-classroom-status" role="status">
      {{ t.predict.saved(savedText) }}{{ t.list }}{{ sent ? t.predict.sent : t.predict.kept }}
    </p>
    <p v-else-if="held" class="pm-classroom-status">
      {{ t.predict.hidden }}
    </p>
    <div v-if="!held" class="pm-predict__reveal">
      <Children part="reveal" />
    </div>
    <p v-if="failure" class="pm-classroom-error" role="alert">
      {{ failure }}
    </p>
  </div>
</template>

<style scoped>
.pm-predict__question {
  font-family: var(--pm-font-serif);
  font-size: 1.05em;
  font-weight: 600;
}
.pm-predict__choices {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4em 1.25em;
  margin: 0.4em 0;
  padding: 0;
  border: 0;
}
.pm-predict__choices legend {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
}
.pm-predict__choices label {
  display: flex;
  align-items: center;
  gap: 0.4em;
  cursor: pointer;
}
.pm-predict__reveal:not(:empty) {
  margin-top: 0.5em;
  padding-top: 0.5em;
  border-top: 1px solid var(--pm-color-line);
}
</style>
