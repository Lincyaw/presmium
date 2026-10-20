<script setup lang="ts">
import { useMessages } from '@lincyaw/host'
import { computed, onMounted, ref } from 'vue'
import { LECTURE_MESSAGES } from '../domain/index.ts'
import type { LectureTrack } from '../domain/index.ts'
import type { LectureEditing, SpeechChoices } from './source.ts'

const props = defineProps<{ track: LectureTrack, editing: LectureEditing }>()
const emit = defineEmits<{ changed: [track: LectureTrack] }>()

const t = useMessages(LECTURE_MESSAGES)
const choices = ref<SpeechChoices>()
const voice = ref('')
const asking = ref<'transcribe' | 'synthesize'>()
const status = ref<string>()
const failure = ref<string>()
const busy = ref(false)

onMounted(async () => {
  try {
    choices.value = await props.editing.speech()
    voice.value = choices.value.synthesize?.voices.find(v => !v.cloned)?.id ?? choices.value.synthesize?.voices[0]?.id ?? ''
  } catch (error) {
    failure.value = t.value.editor.failed(error instanceof Error ? error.message : String(error))
  }
})

const provider = (choice: { provider: string, local: boolean } | undefined) => (choice ? (choice.local ? `${choice.provider}（${t.value.editor.local}）` : choice.provider) : '')
const voiceLabel = computed(() => choices.value?.synthesize?.voices.find(v => v.id === voice.value)?.label ?? voice.value)
const question = computed(() => {
  if (asking.value === 'transcribe') return t.value.editor.transcribeConfirm(props.track.id, provider(choices.value?.transcribe))
  if (asking.value === 'synthesize') return t.value.editor.synthesizeConfirm(provider(choices.value?.synthesize), voiceLabel.value, props.track.utterances.length)
  return ''
})

async function confirm() {
  const action = asking.value
  asking.value = undefined
  if (!action || busy.value) return
  busy.value = true
  failure.value = undefined
  status.value = action === 'transcribe' ? t.value.editor.transcribing : t.value.editor.synthesizing
  try {
    const track = action === 'transcribe'
      ? await props.editing.transcribe(props.track.id)
      : await props.editing.synthesize(props.track.id, voice.value, choices.value?.synthesize?.engine)
    status.value = action === 'transcribe' ? t.value.editor.transcribed(track.utterances.length) : t.value.editor.synthesized
    emit('changed', track)
  } catch (error) {
    status.value = undefined
    failure.value = t.value.editor.failed(error instanceof Error ? error.message : String(error))
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="pm-lecture-editor" role="group" :aria-label="t.editor.region">
    <div class="pm-lecture-editor__row">
      <button
        v-if="choices?.transcribe && track.audio?.length"
        type="button"
        class="pm-lecture-button pm-ui-button pm-ui-button--small pm-lecture-editor__transcribe"
        :disabled="busy"
        @click="asking = 'transcribe'"
      >
        {{ t.editor.transcribe(choices.transcribe.provider) }}
      </button>
      <template v-if="choices?.synthesize && track.utterances.length">
        <label class="pm-lecture-player__field">
          {{ t.editor.voice }}
          <select v-model="voice" class="pm-ui-select" :disabled="busy">
            <option v-for="v in choices.synthesize.voices" :key="v.id" :value="v.id">{{ v.label }}</option>
          </select>
        </label>
        <button type="button" class="pm-lecture-button pm-ui-button pm-ui-button--small pm-lecture-editor__synthesize" :disabled="busy || !voice" @click="asking = 'synthesize'">
          {{ t.editor.synthesize(choices.synthesize.provider) }}
        </button>
      </template>
    </div>
    <div v-if="asking" class="pm-lecture-editor__confirm" role="alertdialog" :aria-label="question">
      <p>{{ question }}</p>
      <button type="button" class="pm-lecture-button pm-ui-button pm-ui-button--small" @click="confirm">{{ t.editor.confirm }}</button>
      <button type="button" class="pm-lecture-button pm-ui-button pm-ui-button--small" @click="asking = undefined">{{ t.editor.cancel }}</button>
    </div>
    <p v-if="status" class="pm-lecture-editor__status" role="status">{{ status }}</p>
    <p v-if="failure" class="pm-lecture-editor__status" role="alert">{{ failure }}</p>
  </div>
</template>

<style>
.pm-lecture-editor {
  margin-bottom: 0.5rem;
  padding-bottom: 0.5rem;
  border-bottom: 1px solid var(--pm-color-line);
}
.pm-lecture-editor__row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.4rem;
}
.pm-lecture-editor__confirm {
  margin-top: 0.5rem;
  padding: var(--pm-space-2) var(--pm-space-3);
  border: 1px solid var(--pm-color-accent);
  border-radius: var(--pm-radius-control);
  background: var(--pm-color-accent-soft);
}
.pm-lecture-editor__confirm p,
.pm-lecture-editor__status {
  margin: 0.25rem 0;
}
</style>
