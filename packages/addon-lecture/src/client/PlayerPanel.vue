<script setup lang="ts">
// The lecture player over the present view (P-131): it drives the real page from the track (see
// player.ts); play and pause, the time and a seek bar, the speed, captions in the lecture's
// language or a translation, the transcript (a word or a sentence's time seeks to it), the
// chapters with the steps of each section (one seeks to its time), "try it" and "back to the
// lecture", and a label on a synthesized voice, which plays its utterances' clips. Editors under
// `presmium dev` and `presmium serve` work on a recorded lecture's words here (TrackEditor.vue, and
// an utterance's text in the transcript; in a synthetic voice saving it says it again, after a
// confirmation that names the provider the operator gives the engine now, N-08). A reader who opens
// the synthesized lecture before an editor had it made is told so. For `presmium-lecture export`
// (`&export`) it shows no controls and steps through the lecture on the exporter's call.
// The transcript shows each sentence as written, its words (to seek to) in it; a translation made
// from an earlier text of its sentence is marked stale (P-137). The player lies over the page's
// effects, e.g. the dimming of a spotlight (`--pm-cue-z`): in a layer of its own over the page.
import { sha256 } from '@noble/hashes/sha2.js'
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils.js'
import type { Operations } from '@presmium/host'
import { OPERATIONS, PmIcon, PmTabs, useMessages, useServer, useService } from '@presmium/host'
import { isRecord } from '@presmium/kernel'
import { computed, nextTick, onBeforeUnmount, ref, shallowRef, watch } from 'vue'
import { captionLanguages, chapters, CLIPS_DIR, clockText, isStale, LECTURE_ID, LECTURE_MESSAGES, SCRIPT_TRACK, stepStops, textPieces, trackDuration, utteranceAt } from '../domain/index.ts'
import type { LectureTrack, Utterance } from '../domain/index.ts'
import type { ClockMedia, TrackClock } from './clock.ts'
import { ClipClock, MediaClock, SilentClock } from './clock.ts'
import { LecturePlayer } from './player.ts'
import type { LectureSource } from './source.ts'
import { NotYetSynthesized, serverEditing, serverSource, staticBase, staticSource } from './source.ts'
import { exporting, play, playing, useViewer } from './state.ts'
import TrackEditor from './TrackEditor.vue'

defineProps<{ view: string }>()

const RATES = [0.5, 0.75, 1, 1.25, 1.5, 2]

const t = useMessages(LECTURE_MESSAGES)
const viewer = useViewer()
const server = useServer()
const operations = useService(OPERATIONS)
const player = shallowRef<LecturePlayer>()
const status = ref<'loading' | 'missing' | 'not-yet' | 'ready'>()
const captions = ref(false)
const language = ref<string>()
const panel = ref<'transcript' | 'chapters'>()
/** The side panel's tabs: the transcript and the chapters, one shown, switched there or from the player's bar. */
const SIDE = { 'zh-CN': { tabs: '逐字稿与章节' }, 'en': { tabs: 'Transcript and chapters' } }
const side = useMessages(SIDE)
const sideTabs = computed(() => [{ value: 'transcript', label: t.value.player.transcript }, { value: 'chapters', label: t.value.player.chapters }])

/** Where the lectures come from: the server's routes, else the build's `lecture` output. */
function lectureSource(): LectureSource {
  const config = viewer.doc.value.config.presmium[LECTURE_ID]
  return server.available ? serverSource(server) : staticSource(staticBase(isRecord(config) ? config : undefined))
}

/** The clock of a track: the clips of a synthetic voice, else the recorded audio, else the page's. */
async function clockOf(track: LectureTrack, source: LectureSource): Promise<TrackClock> {
  const length = trackDuration(track)
  const url = (src: string) => source.media(track.id, src).catch(() => '')
  if (track.voice.kind === 'synthetic') {
    const clips = await Promise.all(track.utterances.filter(u => u.clip).map(async (u): Promise<ClockMedia> => ({ url: await url(`${CLIPS_DIR}/${u.clip}`), start: u.t, duration: u.d })))
    if (clips.some(c => c.url)) return new ClipClock(length, clips.filter(c => c.url))
  }
  const audio = await Promise.all((track.audio ?? []).map(async (a): Promise<ClockMedia> => ({ url: await url(a.src), start: a.start * 1000, duration: a.duration * 1000 })))
  const media = audio.filter(a => a.url)
  return media.length > 0 ? new MediaClock(length, media) : new SilentClock(length)
}

let loading = 0
/** Plays a track (its time `at`), in place of the one played. */
async function start(track: LectureTrack, source: LectureSource, ops: Operations, load: number, at = 0) {
  const clock = await clockOf(track, source)
  if (load !== loading) return clock.dispose()
  player.value?.dispose()
  player.value = new LecturePlayer(track, viewer.doc.value, ops, clock)
  language.value ??= track.lang
  status.value = 'ready'
  player.value.seek(at)
  if (exporting) exportHook(player.value)
}

watch([playing, operations], async ([id, ops]) => {
  const load = ++loading
  player.value?.dispose()
  player.value = undefined
  status.value = undefined
  language.value = undefined
  if (!id || !ops) return
  status.value = 'loading'
  const source = lectureSource()
  let notYet = false
  const track = await source.track(id).catch((error: unknown) => {
    notYet = error instanceof NotYetSynthesized
    return undefined
  })
  if (load !== loading) return
  if (!track) {
    status.value = notYet ? 'not-yet' : 'missing'
    return
  }
  await start(track, source, ops, load)
}, { immediate: true })
onBeforeUnmount(() => {
  loading++
  player.value?.dispose()
})

/** `presmium-lecture export` steps the lecture: `advance(t)` shows the lecture at t once the page has drawn it. */
function exportHook(p: LecturePlayer) {
  const frame = () => new Promise<void>(done => requestAnimationFrame(() => done()))
  Object.assign(window, {
    presmiumLecture: {
      duration: p.duration,
      async advance(at: number) {
        p.advanceTo(at)
        await nextTick()
        await frame()
        await frame()
      },
    },
  })
}

// Editors work on a stored lecture's words (not on `script`, which the deck's narration makes).
const editing = computed(() => (server.available && server.member.value?.roles.some(role => role === 'editor' || role === 'owner') ? serverEditing(server) : undefined))
const editable = computed(() => Boolean(editing.value && player.value && playing.value !== SCRIPT_TRACK))
const editingUtterance = ref<string>()
const draft = ref('')
const saving = ref(false)
const editFailure = ref<string>()
/** The engine of a synthetic voice; its provider as the operator names it now (N-08), asked from the server. */
const engine = computed(() => {
  const v = player.value?.track.voice
  return editable.value && v?.kind === 'synthetic' ? v.engine : undefined
})
const engineProvider = ref<string>()
watch(engine, async (id) => {
  engineProvider.value = undefined
  const choice = id && editing.value ? await editing.value.speech(id).catch(() => undefined) : undefined
  if (id === engine.value) engineProvider.value = choice?.synthesize?.provider
}, { immediate: true })
/** A synthetic voice says a corrected sentence again: its provider, asked first (N-08); the track's when the engine is gone. */
const sayer = computed(() => {
  const v = player.value?.track.voice
  return v?.kind === 'synthetic' ? engineProvider.value || v.provider || v.engine : undefined
})
const confirmingEdit = ref(false)

/** Plays the edited track from where the lecture is. */
function changed(track: LectureTrack) {
  const ops = operations.value
  if (!ops) return
  void start(track, lectureSource(), ops, ++loading, player.value?.time.value ?? 0)
}

function edit(u: Utterance) {
  editingUtterance.value = u.id
  draft.value = u.text
  editFailure.value = undefined
  confirmingEdit.value = false
}

function submitUtterance() {
  if (sayer.value) confirmingEdit.value = true
  else void saveUtterance()
}

async function saveUtterance() {
  const id = editingUtterance.value
  const track = player.value?.track
  confirmingEdit.value = false
  if (!id || !track || !editing.value || saving.value) return
  saving.value = true
  try {
    changed(await editing.value.editUtterance(track.id, id, draft.value))
    editingUtterance.value = undefined
  } catch (error) {
    editFailure.value = t.value.editor.failed(error instanceof Error ? error.message : String(error))
  } finally {
    saving.value = false
  }
}

const time = computed(() => player.value?.time.value ?? 0)
const state = computed(() => (!player.value ? undefined : player.value.trying.value ? 'trying' : player.value.clock.playing.value ? 'playing' : 'paused'))
const titles = computed(() => new Map(viewer.doc.value.sections.map(s => [s.id, s.title])))
const chapterList = computed(() => (player.value ? chapters(player.value.events, id => titles.value.get(id)) : []))
const chapter = computed(() => chapterList.value.filter(c => c.t <= time.value).at(-1))
/** The chapters, and after each section's the later steps the lecture goes to there, in time order. */
const entries = computed(() => [
  ...chapterList.value.map(c => ({ ...c, step: undefined })),
  ...(player.value ? stepStops(player.value.events) : []).filter(s => s.step > 0).map(s => ({ ...s, title: t.value.player.step(s.step) })),
].sort((a, b) => a.t - b.t))
const entry = computed(() => entries.value.filter(e => e.t <= time.value).at(-1))
const languages = computed(() => (player.value ? captionLanguages(player.value.track) : []))
const current = computed(() => (player.value ? utteranceAt(player.value.track, time.value) : undefined))
const voice = computed(() => player.value?.track.voice)
/** The AI-generated label of a synthetic voice, with its provider when the track names it (N-08). */
const synthetic = computed(() => (voice.value?.kind === 'synthetic' && voice.value.provider ? t.value.player.syntheticBy(voice.value.provider) : t.value.player.synthetic))

function text(u: Utterance): string {
  const lang = language.value
  return lang && lang !== player.value?.track.lang ? u.translations?.[lang]?.text ?? u.text : u.text
}

/** `sha256:<hex>` of a text, as a translation records its original's (P-137); `@noble/hashes`, since a page served over plain http from another machine has no `crypto.subtle`. */
const digest = (text: string) => `sha256:${bytesToHex(sha256(utf8ToBytes(text)))}`

/** The utterances whose translation into the language shown was made from another text. */
const stale = computed(() => {
  const p = player.value
  const lang = language.value
  if (!p || !lang || lang === p.track.lang) return new Set<string>()
  return new Set(p.track.utterances.filter(u => isStale(u, lang, digest)).map(u => u.id))
})

function toggle() {
  const p = player.value
  if (!p) return
  if (p.playing) p.pause()
  else p.play()
}

function seekTo(ms: number) {
  player.value?.seek(ms)
}

function onSeek(event: Event) {
  seekTo(Number((event.target as HTMLInputElement).value))
}

function onRate(event: Event) {
  player.value?.setRate(Number((event.target as HTMLSelectElement).value))
}

function close() {
  play(undefined)
}
</script>

<template>
  <Teleport v-if="playing" to="body">
    <div class="pm-lecture-layer">
      <p v-if="status === 'loading'" class="pm-lecture-player__status">{{ t.player.loading }}</p>
      <p v-else-if="status === 'missing' || status === 'not-yet'" class="pm-lecture-player__status" role="alert">
        {{ status === 'not-yet' ? t.player.notYet : t.player.missing(playing) }}
        <button type="button" class="pm-lecture-button pm-ui-button pm-ui-button--small" @click="close">{{ t.player.close }}</button>
      </p>
      <div
        v-else-if="player && exporting"
        class="pm-lecture-export"
        :data-time="Math.round(time)"
        :data-clip="current?.clip"
      >
        <span v-if="voice?.kind === 'synthetic'" class="pm-lecture-player__ai pm-ui-badge pm-ui-badge--accent pm-ui-badge--pill">{{ synthetic }}</span>
      </div>
      <template v-else-if="player">
        <p v-if="captions && current" class="pm-lecture-caption" :lang="language" aria-live="polite" :data-stale="stale.has(current.id) ? 'true' : undefined">{{ text(current) }}<span v-if="stale.has(current.id)" class="pm-lecture-stale" role="img" :title="t.player.stale" :aria-label="t.player.stale"><PmIcon name="warning" size="1em" :stroke-width="2" /></span></p>
        <aside v-if="panel" class="pm-lecture-side" :aria-label="panel === 'transcript' ? t.player.transcript : t.player.chapters">
          <PmTabs :model-value="panel" :tabs="sideTabs" :label="side.tabs" @update:model-value="panel = $event as 'transcript' | 'chapters'">
            <TrackEditor v-if="panel === 'transcript' && editable && editing" :key="player.track.id" :track="player.track" :editing="editing" @changed="changed" />
            <ol v-if="panel === 'transcript'" class="pm-lecture-transcript" :lang="language">
              <li
                v-for="u in player.track.utterances"
                :key="u.id"
                class="pm-lecture-transcript__item"
                :data-utterance="u.id"
                :data-stale="stale.has(u.id) ? 'true' : undefined"
                :aria-current="current?.id === u.id ? 'true' : undefined"
              >
                <button type="button" class="pm-lecture-transcript__time" :aria-label="t.player.jump(clockText(u.t))" @click="seekTo(u.t)">{{ clockText(u.t) }}</button>
                <form v-if="editingUtterance === u.id" class="pm-lecture-transcript__edit" @submit.prevent="submitUtterance">
                  <input v-model="draft" class="pm-ui-input" type="text" :aria-label="t.editor.edit(u.id)" :disabled="saving">
                  <button type="submit" class="pm-lecture-button pm-ui-button pm-ui-button--small" :disabled="saving || confirmingEdit">{{ saving ? t.editor.saving : sayer ? t.editor.saveSay(sayer) : t.editor.save }}</button>
                  <button type="button" class="pm-lecture-button pm-ui-button pm-ui-button--small" :disabled="saving" @click="editingUtterance = undefined">{{ t.editor.cancel }}</button>
                  <div v-if="confirmingEdit && sayer" class="pm-lecture-editor__confirm" role="alertdialog" :aria-label="t.editor.saveSayConfirm(sayer)">
                    <p>{{ t.editor.saveSayConfirm(sayer) }}</p>
                    <button type="button" class="pm-lecture-button pm-ui-button pm-ui-button--small" @click="saveUtterance">{{ t.editor.confirm }}</button>
                    <button type="button" class="pm-lecture-button pm-ui-button pm-ui-button--small" @click="confirmingEdit = false">{{ t.editor.cancel }}</button>
                  </div>
                  <span v-if="editFailure" role="alert">{{ editFailure }}</span>
                </form>
                <template v-else>
                  <span v-if="language === player.track.lang && textPieces(u)" class="pm-lecture-transcript__text"><template v-for="(piece, i) in textPieces(u)" :key="i"><span v-if="piece.t !== undefined" class="pm-lecture-word" @click="seekTo(piece.t)">{{ piece.text }}</span><template v-else>{{ piece.text }}</template></template></span>
                  <span v-else class="pm-lecture-transcript__text" @click="seekTo(u.t)">{{ text(u) }}</span>
                  <span v-if="stale.has(u.id)" class="pm-lecture-stale" role="img" :title="t.player.stale" :aria-label="t.player.stale"><PmIcon name="warning" size="1em" :stroke-width="2" /></span>
                  <button v-if="editable && language === player.track.lang" type="button" class="pm-lecture-transcript__edit-button" :aria-label="t.editor.edit(u.id)" @click="edit(u)"><PmIcon name="edit" size="1em" /></button>
                </template>
              </li>
            </ol>
            <ol v-else class="pm-lecture-chapters">
              <li v-for="c in entries" :key="`${c.t}:${c.title}`" :aria-current="entry === c ? 'true' : undefined">
                <button
                  v-if="c.step !== undefined"
                  type="button"
                  class="pm-lecture-chapters__step"
                  :data-section="c.section"
                  :data-step="c.step"
                  @click="seekTo(c.t)"
                >
                  <span class="pm-lecture-chapters__time">{{ clockText(c.t) }}</span> {{ c.title }}
                </button>
                <button v-else type="button" class="pm-lecture-chapters__item" :data-section="c.section" @click="seekTo(c.t)">
                  <span class="pm-lecture-chapters__time">{{ clockText(c.t) }}</span> {{ c.title }}
                </button>
              </li>
            </ol>
          </PmTabs>
        </aside>
        <div class="pm-lecture-player" role="region" :aria-label="t.player.region" :data-state="state" :data-time="Math.round(time)" :data-clip="current?.clip">
          <p v-if="player.dropped > 0" class="pm-lecture-player__notice">{{ t.player.dropped(player.dropped) }}</p>
          <p v-if="state === 'trying'" class="pm-lecture-player__notice">{{ t.player.trying }}</p>
          <div class="pm-lecture-player__row">
            <button type="button" class="pm-lecture-button pm-ui-button pm-ui-button--small pm-lecture-player__play" @click="toggle">{{ state === 'playing' ? t.player.pause : t.player.play }}</button>
            <span class="pm-lecture-player__time">{{ t.player.time(clockText(time), clockText(player.duration)) }}</span>
            <input
              class="pm-lecture-player__seek pm-ui-checkbox"
              type="range"
              min="0"
              :max="player.duration"
              step="100"
              :value="Math.round(time)"
              :aria-label="t.player.seek"
              @change="onSeek"
            >
            <span v-if="chapter" class="pm-lecture-player__chapter">{{ chapter.title }}</span>
            <label class="pm-lecture-player__field">
              {{ t.player.rate }}
              <select class="pm-ui-select" :value="player.clock.rate.value" @change="onRate">
                <option v-for="r in RATES" :key="r" :value="r">{{ r }}×</option>
              </select>
            </label>
            <button type="button" class="pm-lecture-button pm-ui-button pm-ui-button--small" :aria-pressed="captions" @click="captions = !captions">{{ t.player.captions }}</button>
            <label v-if="languages.length > 1" class="pm-lecture-player__field">
              {{ t.player.language }}
              <select v-model="language" class="pm-ui-select">
                <option v-for="lang in languages" :key="lang" :value="lang">{{ lang }}</option>
              </select>
            </label>
            <button type="button" class="pm-lecture-button pm-ui-button pm-ui-button--small" :aria-pressed="panel === 'transcript'" @click="panel = panel === 'transcript' ? undefined : 'transcript'">{{ t.player.transcript }}</button>
            <button type="button" class="pm-lecture-button pm-ui-button pm-ui-button--small" :aria-pressed="panel === 'chapters'" @click="panel = panel === 'chapters' ? undefined : 'chapters'">{{ t.player.chapters }}</button>
            <button v-if="state === 'trying'" type="button" class="pm-lecture-button pm-ui-button pm-ui-button--small pm-lecture-player__back" @click="player.back()">{{ t.player.back }}</button>
            <button v-else type="button" class="pm-lecture-button pm-ui-button pm-ui-button--small pm-lecture-player__try" @click="player.tryIt()">{{ t.player.tryIt }}</button>
            <span v-if="voice?.kind === 'synthetic'" class="pm-lecture-player__ai pm-ui-badge pm-ui-badge--accent pm-ui-badge--pill">{{ synthetic }}</span>
            <button type="button" class="pm-lecture-button pm-ui-button pm-ui-button--small" :aria-label="t.player.close" @click="close">×</button>
          </div>
        </div>
      </template>
    </div>
  </Teleport>
</template>

<style>
/*
 * Over the present view and the page's effects on it (a spotlight's dimming, `--pm-cue-z`): a fixed
 * layer of its own, which lets the pointer through but where the player is. Fixed and above the
 * present view, it is part of the view's modal area (Tab reaches the player).
 */
.pm-lecture-layer {
  position: fixed;
  inset: 0;
  z-index: calc(var(--pm-cue-z, 1000) + 3);
  pointer-events: none;
}
.pm-lecture-layer > * {
  pointer-events: auto;
}
/* `presmium-lecture export` films the lecture without the present view's own controls. */
html.pm-lecture-exporting .pm-present__bar {
  display: none;
}
.pm-lecture-player,
.pm-lecture-player__status {
  position: absolute;
  left: 0;
  right: 0;
  bottom: var(--pm-overlay-bar, 3rem);
  margin: 0;
  padding: var(--pm-space-2) var(--pm-space-4);
  border-top: 1px solid var(--pm-color-line);
  background: var(--pm-color-sunk);
  color: var(--pm-color-ink);
  font-family: var(--pm-font-sans);
  font-size: var(--pm-text-md);
}
.pm-lecture-player__row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem;
}
.pm-lecture-player__seek {
  flex: 1 1 8rem;
  min-width: 6rem;
}
.pm-lecture-player__time,
.pm-lecture-chapters__time,
.pm-lecture-transcript__time {
  font-family: var(--pm-font-mono);
  font-variant-numeric: tabular-nums;
}
.pm-lecture-player__chapter {
  font-weight: 600;
}
.pm-lecture-player__notice {
  margin: 0 0 0.25rem;
  color: var(--pm-color-muted);
}
.pm-lecture-player__field {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
}
/* Captions: the ink's panel with the paper's text, legible over any slide, light or dark. */
.pm-lecture-caption {
  position: absolute;
  left: 50%;
  bottom: calc(var(--pm-overlay-bar, 3rem) + 4.5rem);
  max-width: min(48rem, 90%);
  margin: 0;
  padding: 0.35rem 0.9rem;
  transform: translateX(-50%);
  border-radius: var(--pm-radius-control);
  background: var(--pm-color-ink);
  color: var(--pm-color-bg);
  font-family: var(--pm-font-sans);
  font-size: 1.1rem;
  text-align: center;
}
.pm-lecture-side {
  position: absolute;
  top: 0.5rem;
  right: 0.5rem;
  bottom: calc(var(--pm-overlay-bar, 3rem) + 4rem);
  box-sizing: border-box;
  width: min(22rem, 40%);
  overflow: auto;
  padding: var(--pm-space-3);
  border: 1px solid var(--pm-color-line);
  border-radius: var(--pm-radius-card);
  background: var(--pm-color-surface);
  color: var(--pm-color-ink);
  box-shadow: var(--pm-shadow-float);
  font-family: var(--pm-font-sans);
  font-size: var(--pm-text-md);
}
.pm-lecture-transcript,
.pm-lecture-chapters {
  margin: 0;
  padding: 0;
  list-style: none;
}
.pm-lecture-transcript__item {
  display: flex;
  gap: 0.5rem;
  padding: 0.2rem 0.25rem;
  border-radius: 0.25rem;
}
.pm-lecture-transcript__item[aria-current='true'],
.pm-lecture-chapters li[aria-current='true'] {
  background: var(--pm-color-selected);
  box-shadow: inset 3px 0 var(--pm-color-accent);
}
.pm-lecture-transcript__time {
  border: 0;
  background: none;
  color: var(--pm-color-accent);
  font-family: var(--pm-font-mono);
  font-size: var(--pm-text-sm);
  cursor: pointer;
}
.pm-lecture-transcript__text,
.pm-lecture-word {
  cursor: pointer;
}
.pm-lecture-chapters__item,
.pm-lecture-chapters__step {
  width: 100%;
  border: 0;
  background: none;
  color: inherit;
  font: inherit;
  text-align: start;
  cursor: pointer;
}
.pm-lecture-chapters__step {
  padding-inline-start: 1.5rem;
}
.pm-lecture-transcript__edit {
  display: flex;
  flex: 1;
  flex-wrap: wrap;
  gap: 0.25rem;
}
.pm-lecture-transcript__edit input {
  flex: 1 1 8rem;
}
.pm-lecture-transcript__edit .pm-lecture-editor__confirm {
  flex-basis: 100%;
}
.pm-lecture-transcript__edit-button {
  display: inline-flex;
  align-items: center;
  margin-inline-start: auto;
  padding: 0.15em;
  border: 0;
  background: none;
  color: var(--pm-color-muted);
  cursor: pointer;
}
.pm-lecture-stale {
  display: inline-flex;
  vertical-align: -0.1em;
  margin-inline-start: 0.35em;
  color: var(--pm-color-warn);
  cursor: help;
}
.pm-lecture-export {
  position: absolute;
  top: 0.75rem;
  right: 0.75rem;
}
</style>
