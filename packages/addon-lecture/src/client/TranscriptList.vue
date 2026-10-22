<script setup lang="ts">
import { PmIcon, useMessages } from '@lincyaw/host'
import { computed, ref, watch } from 'vue'
import { clockText, LECTURE_MESSAGES, textPieces } from '../domain/index.ts'
import type { LectureTrack, Utterance } from '../domain/index.ts'
import type { LectureEditing } from './source.ts'
import TrackEditor from './TrackEditor.vue'

const props = defineProps<{ track: LectureTrack, editing?: LectureEditing, language?: string, current?: string, stale: ReadonlySet<string> }>()
const emit = defineEmits<{ seek: [t: number], changed: [track: LectureTrack] }>()

const t = useMessages(LECTURE_MESSAGES)
const editingUtterance = ref<string>()
const draft = ref('')
const saving = ref(false)
const editFailure = ref<string>()
const confirmingEdit = ref(false)
const engine = computed(() => (props.editing && props.track.voice.kind === 'synthetic' ? props.track.voice.engine : undefined))
const engineProvider = ref<string>()
watch(engine, async (id) => {
  engineProvider.value = undefined
  const choice = id && props.editing ? await props.editing.speech(id).catch(() => undefined) : undefined
  if (id === engine.value) engineProvider.value = choice?.synthesize?.provider
}, { immediate: true })
const synthesisProvider = computed(() => {
  const v = props.track.voice
  return v.kind === 'synthetic' ? engineProvider.value || v.provider || v.engine : undefined
})

function text(u: Utterance): string {
  const lang = props.language
  return lang && lang !== props.track.lang ? u.translations?.[lang]?.text ?? u.text : u.text
}

function edit(u: Utterance) {
  editingUtterance.value = u.id
  draft.value = u.text
  editFailure.value = undefined
  confirmingEdit.value = false
}

function submitUtterance() {
  if (synthesisProvider.value) confirmingEdit.value = true
  else void saveUtterance()
}

async function saveUtterance() {
  const id = editingUtterance.value
  const { track, editing } = props
  confirmingEdit.value = false
  if (!id || !editing || saving.value) return
  saving.value = true
  try {
    const changed = await editing.editUtterance(track.id, id, draft.value)
    if (track !== props.track) return
    emit('changed', changed)
    editingUtterance.value = undefined
  } catch (error) {
    editFailure.value = t.value.editor.failed(error instanceof Error ? error.message : String(error))
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <TrackEditor v-if="editing" :key="track.id" :track="track" :editing="editing" @changed="emit('changed', $event)" />
  <ol class="pm-lecture-transcript" :lang="language">
    <li
      v-for="u in track.utterances"
      :key="u.id"
      class="pm-lecture-transcript__item"
      :data-utterance="u.id"
      :data-stale="stale.has(u.id) ? 'true' : undefined"
      :aria-current="current === u.id ? 'true' : undefined"
    >
      <button type="button" class="pm-lecture-transcript__time" :aria-label="t.player.jump(clockText(u.t))" @click="emit('seek', u.t)">{{ clockText(u.t) }}</button>
      <form v-if="editingUtterance === u.id" class="pm-lecture-transcript__edit" @submit.prevent="submitUtterance">
        <input v-model="draft" class="pm-ui-input" type="text" :aria-label="t.editor.edit(u.id)" :disabled="saving">
        <button type="submit" class="pm-lecture-button pm-ui-button pm-ui-button--small" :disabled="saving || confirmingEdit">{{ saving ? t.editor.saving : synthesisProvider ? t.editor.saveSay(synthesisProvider) : t.editor.save }}</button>
        <button type="button" class="pm-lecture-button pm-ui-button pm-ui-button--small" :disabled="saving" @click="editingUtterance = undefined">{{ t.editor.cancel }}</button>
        <div v-if="confirmingEdit && synthesisProvider" class="pm-lecture-editor__confirm" role="alertdialog" :aria-label="t.editor.saveSayConfirm(synthesisProvider)">
          <p>{{ t.editor.saveSayConfirm(synthesisProvider) }}</p>
          <button type="button" class="pm-lecture-button pm-ui-button pm-ui-button--small" @click="saveUtterance">{{ t.editor.confirm }}</button>
          <button type="button" class="pm-lecture-button pm-ui-button pm-ui-button--small" @click="confirmingEdit = false">{{ t.editor.cancel }}</button>
        </div>
        <span v-if="editFailure" role="alert">{{ editFailure }}</span>
      </form>
      <template v-else>
        <span v-if="language === track.lang && textPieces(u)" class="pm-lecture-transcript__text"><template v-for="(piece, i) in textPieces(u)" :key="i"><span v-if="piece.t !== undefined" class="pm-lecture-word" @click="emit('seek', piece.t)">{{ piece.text }}</span><template v-else>{{ piece.text }}</template></template></span>
        <span v-else class="pm-lecture-transcript__text" @click="emit('seek', u.t)">{{ text(u) }}</span>
        <span v-if="stale.has(u.id)" class="pm-lecture-stale" role="img" :title="t.player.stale" :aria-label="t.player.stale"><PmIcon name="warning" size="1em" :stroke-width="2" /></span>
        <button v-if="editing && language === track.lang" type="button" class="pm-lecture-transcript__edit-button" :aria-label="t.editor.edit(u.id)" @click="edit(u)"><PmIcon name="edit" size="1em" /></button>
      </template>
    </li>
  </ol>
</template>
