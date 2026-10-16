<script setup lang="ts">
// The lecture player over the present view (P-131): it drives the real page from the track (see
// player.ts); play and pause, the time and a seek bar, the speed, captions in the lecture's
// language or a translation, the transcript (a word or a sentence's time seeks to it), the
// chapters with the steps of each section (one seeks to its time), "try it" and "back to the
// lecture", and a label on a synthesized voice.
import { OPERATIONS, useMessages, useServer, useService } from '@presmium/host'
import { isRecord } from '@presmium/kernel'
import { computed, onBeforeUnmount, ref, shallowRef, watch } from 'vue'
import { captionLanguages, chapters, clockText, LECTURE_ID, LECTURE_MESSAGES, stepStops, trackDuration, utteranceAt } from '../domain/index.ts'
import type { Utterance } from '../domain/index.ts'
import { MediaClock, SilentClock } from './clock.ts'
import { LecturePlayer } from './player.ts'
import { serverSource, staticBase, staticSource } from './source.ts'
import { play, playing, useViewer } from './state.ts'

defineProps<{ view: string }>()

const RATES = [0.5, 0.75, 1, 1.25, 1.5, 2]

const t = useMessages(LECTURE_MESSAGES)
const viewer = useViewer()
const server = useServer()
const operations = useService(OPERATIONS)
const player = shallowRef<LecturePlayer>()
const status = ref<'loading' | 'missing' | 'ready'>()
const captions = ref(false)
const language = ref<string>()
const panel = ref<'transcript' | 'chapters'>()

let loading = 0
watch([playing, operations], async ([id, ops]) => {
  const load = ++loading
  player.value?.dispose()
  player.value = undefined
  status.value = undefined
  if (!id || !ops) return
  status.value = 'loading'
  const config = viewer.doc.value.config.presmium[LECTURE_ID]
  const source = server.available ? serverSource(server) : staticSource(staticBase(isRecord(config) ? config : undefined))
  const track = await source.track(id).catch(() => undefined)
  if (load !== loading) return
  if (!track) {
    status.value = 'missing'
    return
  }
  const audio = await Promise.all((track.audio ?? []).map(async a => ({ url: await source.media(id, a.src).catch(() => ''), start: a.start * 1000, duration: a.duration * 1000 })))
  if (load !== loading) return
  const length = trackDuration(track)
  const media = audio.filter(a => a.url)
  const clock = media.length > 0 ? new MediaClock(length, media) : new SilentClock(length)
  player.value = new LecturePlayer(track, viewer.doc.value, ops, clock)
  language.value = track.lang
  status.value = 'ready'
  player.value.seek(0)
}, { immediate: true })
onBeforeUnmount(() => {
  loading++
  player.value?.dispose()
})

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

function text(u: Utterance): string {
  const lang = language.value
  return lang && lang !== player.value?.track.lang ? u.translations?.[lang]?.text ?? u.text : u.text
}

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
    <p v-if="status === 'loading'" class="pm-lecture-player__status">{{ t.player.loading }}</p>
    <p v-else-if="status === 'missing'" class="pm-lecture-player__status" role="alert">
      {{ t.player.missing(playing) }}
      <button type="button" class="pm-lecture-button" @click="close">{{ t.player.close }}</button>
    </p>
    <template v-else-if="player">
      <p v-if="captions && current" class="pm-lecture-caption" :lang="language" aria-live="polite">{{ text(current) }}</p>
      <aside v-if="panel" class="pm-lecture-side" :aria-label="panel === 'transcript' ? t.player.transcript : t.player.chapters">
        <ol v-if="panel === 'transcript'" class="pm-lecture-transcript" :lang="language">
          <li
            v-for="u in player.track.utterances"
            :key="u.id"
            class="pm-lecture-transcript__item"
            :data-utterance="u.id"
            :aria-current="current?.id === u.id ? 'true' : undefined"
          >
            <button type="button" class="pm-lecture-transcript__time" :aria-label="t.player.jump(clockText(u.t))" @click="seekTo(u.t)">{{ clockText(u.t) }}</button>
            <span v-if="u.words?.length && language === player.track.lang" class="pm-lecture-transcript__text">
              <span v-for="(w, i) in u.words" :key="i" class="pm-lecture-word" @click="seekTo(w[0])">{{ w[2] }}</span>
            </span>
            <span v-else class="pm-lecture-transcript__text" @click="seekTo(u.t)">{{ text(u) }}</span>
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
      </aside>
      <div class="pm-lecture-player" role="region" :aria-label="t.player.region" :data-state="state" :data-time="Math.round(time)">
        <p v-if="player.dropped > 0" class="pm-lecture-player__notice">{{ t.player.dropped(player.dropped) }}</p>
        <p v-if="state === 'trying'" class="pm-lecture-player__notice">{{ t.player.trying }}</p>
        <div class="pm-lecture-player__row">
          <button type="button" class="pm-lecture-button pm-lecture-player__play" @click="toggle">{{ state === 'playing' ? t.player.pause : t.player.play }}</button>
          <span class="pm-lecture-player__time">{{ t.player.time(clockText(time), clockText(player.duration)) }}</span>
          <input
            class="pm-lecture-player__seek"
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
            <select :value="player.clock.rate.value" @change="onRate">
              <option v-for="r in RATES" :key="r" :value="r">{{ r }}×</option>
            </select>
          </label>
          <button type="button" class="pm-lecture-button" :aria-pressed="captions" @click="captions = !captions">{{ t.player.captions }}</button>
          <label v-if="languages.length > 1" class="pm-lecture-player__field">
            {{ t.player.language }}
            <select v-model="language">
              <option v-for="lang in languages" :key="lang" :value="lang">{{ lang }}</option>
            </select>
          </label>
          <button type="button" class="pm-lecture-button" :aria-pressed="panel === 'transcript'" @click="panel = panel === 'transcript' ? undefined : 'transcript'">{{ t.player.transcript }}</button>
          <button type="button" class="pm-lecture-button" :aria-pressed="panel === 'chapters'" @click="panel = panel === 'chapters' ? undefined : 'chapters'">{{ t.player.chapters }}</button>
          <button v-if="state === 'trying'" type="button" class="pm-lecture-button pm-lecture-player__back" @click="player.back()">{{ t.player.back }}</button>
          <button v-else type="button" class="pm-lecture-button pm-lecture-player__try" @click="player.tryIt()">{{ t.player.tryIt }}</button>
          <span v-if="player.track.voice.kind === 'synthetic'" class="pm-lecture-player__ai">{{ t.player.synthetic }}</span>
          <button type="button" class="pm-lecture-button" :aria-label="t.player.close" @click="close">×</button>
        </div>
      </div>
    </template>
  </template>
</template>

<style>
.pm-lecture-player,
.pm-lecture-player__status {
  position: absolute;
  left: 0;
  right: 0;
  bottom: var(--pm-overlay-bar, 3rem);
  z-index: 4;
  margin: 0;
  padding: 0.4rem 0.75rem;
  background: var(--vp-c-bg-soft, #f6f6f7);
  border-top: 1px solid var(--vp-c-divider, rgb(125 125 125 / 0.3));
  font-size: 0.85rem;
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
  font-variant-numeric: tabular-nums;
}
.pm-lecture-player__chapter {
  font-weight: 600;
}
.pm-lecture-player__notice {
  margin: 0 0 0.25rem;
  color: var(--vp-c-text-2, #555);
}
.pm-lecture-player__ai {
  padding: 0.1rem 0.5rem;
  border-radius: 999px;
  background: #7c3aed;
  color: #fff;
}
.pm-lecture-player__field {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
}
.pm-lecture-button {
  padding: 0.15rem 0.6rem;
  border: 1px solid var(--vp-c-divider, rgb(125 125 125 / 0.4));
  border-radius: 0.3rem;
  background: var(--vp-c-bg, #fff);
  color: inherit;
  font: inherit;
  cursor: pointer;
}
.pm-lecture-button[aria-pressed='true'] {
  background: var(--vp-c-brand-soft, #e0e7ff);
}
.pm-lecture-caption {
  position: absolute;
  left: 50%;
  bottom: calc(var(--pm-overlay-bar, 3rem) + 4.5rem);
  z-index: 4;
  max-width: min(48rem, 90%);
  margin: 0;
  padding: 0.3rem 0.8rem;
  transform: translateX(-50%);
  border-radius: 0.3rem;
  background: rgb(0 0 0 / 0.75);
  color: #fff;
  font-size: 1.1rem;
  text-align: center;
}
.pm-lecture-side {
  position: absolute;
  top: 0.5rem;
  right: 0.5rem;
  bottom: calc(var(--pm-overlay-bar, 3rem) + 4rem);
  z-index: 4;
  width: min(22rem, 40%);
  overflow: auto;
  padding: 0.5rem;
  border: 1px solid var(--vp-c-divider, rgb(125 125 125 / 0.3));
  border-radius: 0.4rem;
  background: var(--vp-c-bg, #fff);
  font-size: 0.9rem;
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
  background: var(--vp-c-brand-soft, #e0e7ff);
}
.pm-lecture-transcript__time {
  border: 0;
  background: none;
  color: var(--vp-c-brand-1, #3451b2);
  font: inherit;
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
</style>
