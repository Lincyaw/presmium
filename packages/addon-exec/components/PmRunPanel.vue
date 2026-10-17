<script setup lang="ts">
import { usePresentationMode, useSectionConfig, useService, useStartReport } from '@presmium/host'
import { EXECUTOR, isRecord } from '@presmium/kernel'
import type { ParamsDisplay } from '@presmium/kernel'
import { computed, reactive, ref, shallowRef } from 'vue'
import { languageName, runPlace, seconds, useMessages, useSlideRoom } from '../src/client/index.ts'
import { appendRun, compareRuns, configuredTimeout, defaultPair, EXEC_ID, fallbackReason, stringArgs, withRecordedFallback } from '../src/domain/index.ts'
import type { RunHistory, RunRecord } from '../src/domain/index.ts'

// P-20 run panel: wraps a code block; runs it with the parameters in the form,
// keeps a run history in this view and compares two runs. In 书卷 (N-10,
// docs/design/slide.dc.html) its bar above the code names the language and
// where it runs, with the parameters and the run button; the output beside
// the code (where there is room) is labelled with the run's duration. P-24: a failed or
// timed-out run shows `recorded` instead, marked as recorded; a run that could
// not happen (no runtime, no GPU adapter, a timeout) shows the output recorded
// at compile time, with the reason. Any language an executor runs (e.g. `wgsl`);
// its executor may name the parameters for learners (`Executor.params`, D-10).
// In the slides and the present view it keeps to the slide (N-05).
const props = withDefaults(defineProps<{
  lang?: string
  /** The code to run; the wrapped code block shows it. */
  code?: string
  /** Parameters and their initial values, injected into the program as variables (other languages' executors read them, e.g. a shader's buffers). */
  params?: Record<string, unknown>
  /** The `RecordedOutput`, shown when the run fails or times out. */
  recorded?: string
  /** The output recorded at compile time, shown with the reason when a run cannot happen. */
  compiledOutput?: string
  /** Timeout in ms; else `presmium.exec.timeoutMs` of the section, else the executor's default. */
  timeout?: number
  /** The executor of its environment (`:env:`, docs/ir.md 2.7); without it the router chooses by language. */
  executor?: string
  /** The execution session (`:session:`) it shares with code blocks and panels of the page. */
  session?: string
}>(), { lang: 'python', code: '' })

const executor = useService(EXECUTOR)
const report = useStartReport()
const config = useSectionConfig(EXEC_ID)
const t = useMessages()
const args = reactive(stringArgs(props.params))
// A mapping parameter as one field per key, kept apart for when its executor shows it so (a shader's buffers).
const fields = reactive(Object.fromEntries(Object.entries(props.params ?? {})
  .filter(([, value]) => isRecord(value))
  .map(([name, value]) => [name, stringArgs(value as Record<string, unknown>)])))
const presenting = usePresentationMode() === 'slides'
const root = shallowRef<HTMLElement>()
// In a slide: the room below the panel's top, and what of it the code has.
const room = ref<{ panel: number, code: number }>()
useSlideRoom(root, presenting, (panel) => {
  const main = root.value?.querySelector<HTMLElement>('.pm-run-panel__main')
  const pre = main?.querySelector<HTMLElement>('.pm-run-panel__source pre')
  if (!main || !pre) return
  // The bar above the code keeps its height; the code takes the rest.
  const code = panel - (main.offsetHeight - pre.offsetHeight)
  if (room.value?.panel !== panel || room.value.code !== code) room.value = { panel, code }
})
const history = shallowRef<RunHistory>([])
const running = ref(false)
// The runs being compared; each new run selects the last two.
const selected = ref<number[]>([])

/** The executor that runs this code: its environment's, else the one the router chooses for its language. */
const routed = computed(() => {
  const executors = executor.value?.list() ?? []
  return props.executor ? executors.find(e => e.id === props.executor) : executors.find(e => e.supports(props.lang))
})
/** How the executor that runs this code shows its parameters, if it says. */
const display = computed((): ParamsDisplay | undefined => routed.value?.params?.(props.lang))
/** Where the code runs, as the bar says it (./src/client/place.ts); nothing for an executor that does not say. */
const where = computed(() => {
  const place = runPlace(props.executor ?? routed.value?.id ?? latest.value?.result.executorId)
  if (!place) return undefined
  const said = t.value.runsIn
  return place.kind === 'browser' || place.kind === 'machine' ? said[place.kind] : said[place.kind](place.name)
})
const label = (name: string) => display.value?.labels[name] ?? name
const split = (name: string) => Boolean(display.value?.fields?.includes(name) && fields[name])

/** The arguments of a run: a parameter shown as fields written back as a YAML flow mapping of them. */
function runArgs(): Record<string, string> {
  return Object.fromEntries(Object.entries(args).map(([name, value]) => [name, split(name)
    ? `{${Object.entries(fields[name]!).map(([key, field]) => `${JSON.stringify(key)}: ${field.trim() || 'null'}`).join(', ')}}`
    : value]))
}

const latest = computed(() => history.value.at(-1))
// Why a recorded output shows: a timeout, the program's failure, or what kept the run from happening.
const reason = computed(() => {
  const result = latest.value?.result
  const why = result && fallbackReason(result)
  if (!why) return undefined
  return why === 'failed' && result.exitCode === null && result.stderr.trim() ? result.stderr.trim() : t.value[why]
})
/** The output's label: with the run's duration when it ran, not for a recorded output. */
const outputLabel = computed(() => {
  const result = latest.value?.result
  return result && result.source === 'live' ? t.value.outputTook(seconds(result.durationMs)) : t.value.output
})
const comparison = computed(() => {
  const [before, after] = [...selected.value].sort((a, b) => a - b).map(id => history.value.find(record => record.id === id))
  return before && after ? compareRuns(before, after) : undefined
})

async function run() {
  if (!executor.value || running.value) return
  running.value = true
  try {
    const request = { lang: props.lang, code: props.code, args: runArgs(), timeoutMs: props.timeout ?? configuredTimeout(config.value), executor: props.executor, session: props.session }
    const result = await executor.value.run(request)
    const recorded = props.recorded ?? (!result.ok && result.exitCode === null ? props.compiledOutput : undefined)
    history.value = appendRun(history.value, request.args, withRecordedFallback(result, recorded))
    selected.value = defaultPair(history.value) ?? []
  } finally {
    running.value = false
  }
}

function select(id: number) {
  selected.value = selected.value.includes(id) ? selected.value.filter(s => s !== id) : [...selected.value, id].slice(-2)
}

function describe(record: RunRecord): string {
  const params = display.value?.summary?.(record.args) ?? Object.entries(record.args).map(([name, value]) => `${name}=${value}`).join(' ')
  const status = record.result.source === 'recorded' ? t.value.recorded : record.result.ok ? t.value.succeeded : t.value.failedShort
  return [params, status, `${record.result.durationMs} ms`].filter(Boolean).join(' · ')
}

const SIGN = { same: ' ', added: '+', removed: '-' } as const

/** The width of a parameter's field in characters: its value's, between 8 and 60. */
function fieldSize(value: string | undefined): number {
  return Math.min(60, Math.max(8, (value ?? '').length + 1))
}
</script>

<template>
  <div
    ref="root"
    class="pm-run-panel"
    :class="{ 'pm-run-panel--present': presenting }"
    :style="room && { '--pm-run-room': `${room.panel}px`, '--pm-run-code': `${room.code}px` }"
    :data-state="running ? 'running' : latest ? 'done' : 'idle'"
    :data-runs="history.length"
  >
    <div class="pm-run-panel__main">
      <form class="pm-run-panel__bar pm-run-panel__form" @submit.prevent="run">
        <span class="pm-run-panel__where"><span class="pm-run-panel__lang">{{ languageName(lang) }}</span><template v-if="where"> · {{ where }}</template></span>
        <!-- The parameters stay with the run button: where the bar wraps, they go to its second line together. -->
        <span class="pm-run-panel__controls">
          <template v-for="(_, name) in args" :key="name">
            <template v-if="split(name)">
              <label v-for="(__, key) in fields[name]" :key="`${name}.${key}`" class="pm-run-panel__param">
                <span>{{ label(name) }} <code>{{ key }}</code></span>
                <input v-model="fields[name]![key]" class="pm-ui-input" :name="`${name}.${key}`" :size="fieldSize(fields[name]![key])" spellcheck="false" autocomplete="off">
              </label>
            </template>
            <label v-else class="pm-run-panel__param">
              <span>{{ label(name) }}</span>
              <input v-model="args[name]" class="pm-ui-input" :name="name" :size="fieldSize(args[name])" spellcheck="false" autocomplete="off">
            </label>
          </template>
          <span v-if="!executor && report" class="pm-run-panel__hint">{{ t.unavailable }}</span>
          <button type="submit" class="pm-run-panel__run pm-ui-button pm-ui-button--primary" :disabled="running || !executor">
            <svg class="pm-ui-icon" width="0.75em" height="0.75em" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 4v16l13-8z" /></svg>
            {{ running ? t.running : history.length ? t.rerun : t.run }}
          </button>
        </span>
      </form>
      <div class="pm-run-panel__source">
        <slot>
          <pre><code>{{ code }}</code></pre>
        </slot>
      </div>
    </div>
    <!-- Until the first run there is nothing to show beside the code, which keeps the full width. -->
    <div v-if="latest || history.length" class="pm-run-panel__side">
      <div v-if="latest" class="pm-run-panel__output" :data-source="latest.result.source" :data-ok="latest.result.ok">
        <div class="pm-run-panel__label">
          {{ outputLabel }}
        </div>
        <div v-if="reason" class="pm-run-panel__badge pm-ui-badge pm-ui-badge--warn">
          {{ t.recordedBadge(reason) }}
        </div>
        <pre class="pm-run-panel__stdout">{{ latest.result.stdout }}</pre>
        <pre v-if="latest.result.stderr && !reason" class="pm-run-panel__stderr">{{ latest.result.stderr }}</pre>
      </div>
      <ol v-if="history.length" class="pm-run-panel__history">
        <li v-for="record in history" :key="record.id" :data-run="record.id">
          <label>
            <input type="checkbox" class="pm-ui-checkbox" :checked="selected.includes(record.id)" @change="select(record.id)">
            #{{ record.id }} {{ describe(record) }}
          </label>
        </li>
      </ol>
      <div v-if="comparison" class="pm-run-panel__compare" :data-changed="comparison.changed">
        <div class="pm-run-panel__compare-title">
          {{ t.compare(comparison.before.id, comparison.after.id) }}
        </div>
        <div v-for="change in comparison.args" :key="change.name" class="pm-run-panel__arg" :data-arg="change.name">
          {{ t.argChange(label(change.name), change.before ?? '—', change.after ?? '—') }}
        </div>
        <pre class="pm-run-panel__diff"><span v-for="(line, i) in comparison.output" :key="i" :data-kind="line.kind">{{ SIGN[line.kind] }} {{ line.text }}</span></pre>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* The run panel in 书卷 (N-10, docs/design/slide.dc.html): a card of the code under its bar (the language, where it
   runs, the parameters, the ink run button); the output in the paper's sunk panel beside it, labelled with the run's
   duration. Sizes follow the font size of the slide, which the present view scales with the screen (N-05); the
   host's controls follow it too. */
.pm-run-panel {
  --pm-text-sm: 0.875em;
  --pm-text-md: 1em;

  display: grid;
  /* Code and output side by side where there is room (a slide); in a narrow place (a board in
     the document view, a phone) they stack, so the code keeps the full width. */
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 26rem), 1fr));
  gap: 0.75em 1.25em;
  color: var(--pm-color-ink);
  font-family: var(--pm-font-sans);
  font-size: 0.8em;
}
.pm-run-panel__main,
.pm-run-panel__side {
  min-width: 0;
}
.pm-run-panel__main {
  overflow: hidden;
  border: 1px solid var(--pm-color-line);
  border-radius: var(--pm-radius-panel);
  background: var(--pm-color-surface);
}
.pm-run-panel__bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.4em 0.75em;
  padding: 0.45em 0.6em 0.45em 1.1em;
  border-bottom: 1px solid var(--pm-color-line);
  color: var(--pm-color-muted);
}
.pm-run-panel__lang {
  font-family: var(--pm-font-mono);
}
.pm-run-panel__controls {
  display: flex;
  flex: 1 1 auto;
  flex-wrap: wrap;
  align-items: center;
  justify-content: flex-end;
  gap: 0.4em 0.75em;
  min-width: 0;
}
.pm-run-panel__source {
  /* The slides' code block: no margin, no corners of its own (Slidev's variables for them). */
  --slidev-code-margin: 0;
  --slidev-code-radius: 0;

  /* The code keeps the size of the deck's other code blocks; only the controls and output are smaller. */
  font-size: 1.25em;
}
/* The code is the card's body: the code block's own frame and margins give way (the slides' and the web form's). */
.pm-run-panel__source :deep(:is(.pm-code-block, .slidev-code-wrapper)) {
  margin: 0;
}
.pm-run-panel__source :deep(pre) {
  margin: 0;
  border: 0;
  border-radius: 0;
  max-height: 20em;
  overflow: auto;
}
/* In the slides and the present view (projected) the panel keeps to the room below its top on the
   slide: the code takes what the bar leaves and scrolls only when it is longer, the output
   beside it scrolls in that height. Its size stays the slide's, which a long panel would otherwise
   push off the slide or (the present view) shrink (N-05, F-19). */
.pm-run-panel--present {
  align-items: start;
}
.pm-run-panel--present .pm-run-panel__source :deep(pre) {
  max-height: max(var(--pm-run-code, 20em), 6em);
}
.pm-run-panel--present .pm-run-panel__side {
  max-height: var(--pm-run-room);
  overflow: auto;
}
/* Projected, a line too long for the code's half of the panel (the output beside it after a run) wraps
   rather than being cut at its edge; the parameters and the run button read at the code's size, as form
   controls take no size of their own from the page (R-27, N-05); the bar's words are a little smaller. */
.pm-run-panel--present .pm-run-panel__source :deep(:is(pre, code)) {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
.pm-run-panel--present .pm-run-panel__bar {
  font-size: 1.25em;
}
.pm-run-panel--present .pm-run-panel__where {
  font-size: 0.8em;
}
.pm-run-panel__bar :is(input, button) {
  font-size: inherit;
}
.pm-run-panel__param {
  display: inline-flex;
  align-items: center;
  gap: 0.4em;
  max-width: 100%;
}
.pm-run-panel__param code {
  color: var(--pm-color-ink);
}
.pm-run-panel__param input {
  /* As wide as its value (the size attribute), within the panel: a shader's buffers are a long JSON value. */
  min-width: 7.5em;
  max-width: 100%;
  min-height: 0;
  padding: 0.2em 0.5em;
  font-family: var(--pm-font-mono);
}
.pm-run-panel__run {
  min-height: 0;
  padding: 0.3em 1em;
}
.pm-run-panel__hint {
  color: var(--pm-color-danger);
}
.pm-run-panel__side {
  display: flex;
  flex-direction: column;
  gap: 0.5em;
}
.pm-run-panel__output {
  padding: 0.75em 1.1em;
  border-radius: var(--pm-radius-panel);
  background: var(--pm-color-sunk);
}
.pm-run-panel__label {
  margin-bottom: 0.4em;
  color: var(--pm-color-muted);
  font-size: 0.9em;
}
.pm-run-panel__side pre {
  margin: 0;
  max-height: 8em;
  overflow: auto;
  font-family: var(--pm-font-mono);
  font-size: 1.1em;
  line-height: 1.6;
  white-space: pre-wrap;
}
.pm-run-panel__badge {
  margin-bottom: 0.5em;
  white-space: normal;
}
.pm-run-panel__stderr {
  color: var(--pm-color-danger);
}
.pm-run-panel__history {
  margin: 0;
  padding: 0;
  list-style: none;
  max-height: 6.5em;
  overflow: auto;
  color: var(--pm-color-muted);
}
.pm-run-panel__history label {
  display: inline-flex;
  align-items: center;
  gap: 0.4em;
}
.pm-run-panel__compare {
  padding: 0.6em 0.9em;
  border: 1px solid var(--pm-color-line);
  border-radius: var(--pm-radius-control);
}
.pm-run-panel__compare-title {
  font-weight: 600;
}
.pm-run-panel__side .pm-run-panel__diff {
  max-height: 11em;
  font-size: 0.95em;
}
.pm-run-panel__diff span {
  display: block;
}
.pm-run-panel__diff span[data-kind='added'] {
  color: var(--pm-color-add);
}
.pm-run-panel__diff span[data-kind='removed'] {
  color: var(--pm-color-del);
  text-decoration: line-through;
}
</style>
