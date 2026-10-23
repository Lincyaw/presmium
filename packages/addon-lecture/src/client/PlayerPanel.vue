<script setup lang="ts">
import { PmIcon, PmTabs, useMessages, useServer } from '@lincyaw/host'
import { computed, ref } from 'vue'
import { captionLanguages, captionText, clockText, isStale, LECTURE_MESSAGES, SCRIPT_TRACK, trackChapters, utteranceAt } from '../domain/index.ts'
import type { Utterance } from '../domain/index.ts'
import ChapterList from './ChapterList.vue'
import { useLecturePlayback } from './playback.ts'
import { serverEditing } from './source.ts'
import { burnedCaptions, exporting, play, playing, useViewer } from './state.ts'
import TranscriptList from './TranscriptList.vue'

defineProps<{ view: string }>()

const RATES = [0.5, 0.75, 1, 1.25, 1.5, 2]

const t = useMessages(LECTURE_MESSAGES)
const viewer = useViewer()
const server = useServer()
const { player, status, failure, language, reloadTrack } = useLecturePlayback()
if (burnedCaptions) language.value = burnedCaptions
const captions = ref(false)
const panel = ref<'transcript' | 'chapters'>()
const sideTabs = computed(() => [{ value: 'transcript', label: t.value.player.transcript }, { value: 'chapters', label: t.value.player.chapters }])

const editing = computed(() => (server.available && server.member.value?.roles.some(role => role === 'editor' || role === 'owner') ? serverEditing(server) : undefined))
const trackEditing = computed(() => (player.value && playing.value !== SCRIPT_TRACK ? editing.value : undefined))

const time = computed(() => player.value?.time.value ?? 0)
const state = computed(() => (!player.value ? undefined : player.value.trying.value ? 'trying' : player.value.clock.playing.value ? 'playing' : 'paused'))
const titles = computed(() => new Map(viewer.doc.value.sections.map(s => [s.id, s.title])))
const chapterList = computed(() => (player.value ? trackChapters(player.value.events, id => titles.value.get(id)) : []))
const chapter = computed(() => chapterList.value.filter(c => c.t <= time.value).at(-1))
const languages = computed(() => (player.value ? captionLanguages(player.value.track) : []))
const current = computed(() => (player.value ? utteranceAt(player.value.track, time.value) : undefined))
const voice = computed(() => player.value?.track.voice)
const synthetic = computed(() => (voice.value?.kind === 'synthetic' && voice.value.provider ? t.value.player.syntheticBy(voice.value.provider) : t.value.player.synthetic))

function text(u: Utterance): string {
  const lang = language.value
  return lang && lang !== player.value?.track.lang ? u.translations?.[lang]?.text ?? u.text : u.text
}

// The captions an export draws on the frames are those of its subtitle track: a sentence without a translation has none.
const burned = computed(() => (burnedCaptions && current.value && player.value ? captionText(player.value.track, current.value, burnedCaptions) : undefined))

const stale = computed(() => {
  const p = player.value
  const lang = language.value
  if (!p || !lang || lang === p.track.lang) return new Set<string>()
  return new Set(p.track.utterances.filter(u => isStale(u, lang)).map(u => u.id))
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
  <template v-if="playing">
    <div class="pm-lecture-layer">
      <p v-if="status === 'loading'" class="pm-lecture-player__status">{{ t.player.loading }}</p>
      <p v-else-if="failure" class="pm-lecture-player__status" role="alert">
        {{ t.player.failed(failure) }}
        <button type="button" class="pm-lecture-button pm-ui-button pm-ui-button--small" @click="close">{{ t.player.close }}</button>
      </p>
      <p v-else-if="status === 'missing'" class="pm-lecture-player__status" role="alert">
        {{ t.player.missing(playing) }}
        <button type="button" class="pm-lecture-button pm-ui-button pm-ui-button--small" @click="close">{{ t.player.close }}</button>
      </p>
      <template v-else-if="player && exporting">
        <div class="pm-lecture-export" :data-time="Math.round(time)" :data-clip="current?.clip">
          <span v-if="voice?.kind === 'synthetic'" class="pm-lecture-player__ai pm-ui-badge pm-ui-badge--accent pm-ui-badge--pill">{{ synthetic }}</span>
        </div>
        <p v-if="burned" class="pm-lecture-caption" :lang="burnedCaptions">{{ burned }}</p>
      </template>
      <template v-else-if="player">
        <p v-if="captions && current" class="pm-lecture-caption" :lang="language" aria-live="polite" :data-stale="stale.has(current.id) ? 'true' : undefined">{{ text(current) }}<span v-if="stale.has(current.id)" class="pm-lecture-stale" role="img" :title="t.player.stale" :aria-label="t.player.stale"><PmIcon name="warning" size="1em" :stroke-width="2" /></span></p>
        <aside v-if="panel" class="pm-lecture-side" :aria-label="panel === 'transcript' ? t.player.transcript : t.player.chapters">
          <PmTabs :model-value="panel" :tabs="sideTabs" :label="t.player.sideTabs" @update:model-value="panel = $event as 'transcript' | 'chapters'">
            <TranscriptList
              v-if="panel === 'transcript'"
              :track="player.track"
              :editing="trackEditing"
              :language="language"
              :current="current?.id"
              :stale="stale"
              @seek="seekTo"
              @changed="reloadTrack"
            />
            <ChapterList v-else :chapters="chapterList" :events="player.events" :time="time" @seek="seekTo" />
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
            <button type="button" class="pm-lecture-button pm-ui-button pm-ui-button--small" :aria-label="t.player.close" @click="close"><PmIcon name="close" size="1em" /></button>
          </div>
        </div>
      </template>
    </div>
  </template>
</template>

<style>
.pm-lecture-layer {
  position: fixed;
  inset: 0;
  z-index: calc(var(--pm-cue-z, 1000) + 3);
  pointer-events: none;
}
.pm-lecture-layer > * {
  pointer-events: auto;
}
html.pm-lecture-exporting .pm-lecture-caption {
  bottom: 2.5rem;
}
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
