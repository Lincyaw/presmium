<script setup lang="ts">
import { usePresentationMode, useSectionConfig, useService, useStartReport } from '@presmium/host'
import { EXECUTOR, isRecord } from '@presmium/kernel'
import type { ParamsDisplay } from '@presmium/kernel'
import { computed, reactive, ref, shallowRef } from 'vue'
import { useMessages, useSlideRoom } from '../src/client/index.ts'
import { appendRun, compareRuns, configuredTimeout, defaultPair, EXEC_ID, fallbackReason, stringArgs, withRecordedFallback } from '../src/domain/index.ts'
import type { RunHistory, RunRecord } from '../src/domain/index.ts'

// P-20 run panel: wraps a code block; runs it with the parameters in the form,
// keeps a run history in this view and compares two runs. P-24: a failed or
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
  // The controls below the code keep their height; the code takes the rest.
  const code = panel - (main.offsetHeight - pre.offsetHeight)
  if (room.value?.panel !== panel || room.value.code !== code) room.value = { panel, code }
})
const history = shallowRef<RunHistory>([])
const running = ref(false)
// The runs being compared; each new run selects the last two.
const selected = ref<number[]>([])

/** How the executor that runs this code shows its parameters, if it says. */
const display = computed((): ParamsDisplay | undefined => {
  const executors = executor.value?.list() ?? []
  const routed = props.executor ? executors.find(e => e.id === props.executor) : executors.find(e => e.supports(props.lang))
  return routed?.params?.(props.lang)
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
      <div class="pm-run-panel__source">
        <slot>
          <pre><code>{{ code }}</code></pre>
        </slot>
      </div>
      <form class="pm-run-panel__form" @submit.prevent="run">
        <template v-for="(_, name) in args" :key="name">
          <template v-if="split(name)">
            <label v-for="(__, key) in fields[name]" :key="`${name}.${key}`" class="pm-run-panel__param">
              <span>{{ label(name) }} <code>{{ key }}</code></span>
              <input v-model="fields[name]![key]" :name="`${name}.${key}`" :size="fieldSize(fields[name]![key])" spellcheck="false" autocomplete="off">
            </label>
          </template>
          <label v-else class="pm-run-panel__param">
            <span>{{ label(name) }}</span>
            <input v-model="args[name]" :name="name" :size="fieldSize(args[name])" spellcheck="false" autocomplete="off">
          </label>
        </template>
        <button type="submit" class="pm-run-panel__run" :disabled="running || !executor">
          {{ running ? t.running : history.length ? t.rerun : t.run }}
        </button>
        <span v-if="!executor && report" class="pm-run-panel__hint">{{ t.unavailable }}</span>
      </form>
    </div>
    <!-- Until the first run there is nothing to show beside the code, which keeps the full width. -->
    <div v-if="latest || history.length" class="pm-run-panel__side">
      <div v-if="latest" class="pm-run-panel__output" :data-source="latest.result.source" :data-ok="latest.result.ok">
        <div v-if="reason" class="pm-run-panel__badge">
          {{ t.recordedBadge(reason) }}
        </div>
        <pre class="pm-run-panel__stdout">{{ latest.result.stdout }}</pre>
        <pre v-if="latest.result.stderr && !reason" class="pm-run-panel__stderr">{{ latest.result.stderr }}</pre>
      </div>
      <ol v-if="history.length" class="pm-run-panel__history">
        <li v-for="record in history" :key="record.id" :data-run="record.id">
          <label>
            <input type="checkbox" :checked="selected.includes(record.id)" @change="select(record.id)">
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
.pm-run-panel {
  display: grid;
  /* Code and output side by side where there is room (a slide); in a narrow place (a board in
     the document view, a phone) they stack, so the code keeps the full width. Sizes follow the
     font size of the slide, which the present view scales with the screen (N-05). */
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 26rem), 1fr));
  gap: 0.75em;
  font-size: 0.8em;
}
.pm-run-panel__main,
.pm-run-panel__side {
  min-width: 0;
}
.pm-run-panel__source {
  /* The code keeps the size of the deck's other code blocks; only the controls and output are smaller. */
  font-size: 1.25em;
}
.pm-run-panel__source :deep(pre) {
  margin: 0;
  max-height: 20em;
  overflow: auto;
}
/* In the slides and the present view (projected) the panel keeps to the room below its top on the
   slide: the code takes what the controls leave and scrolls only when it is longer, the output
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
.pm-run-panel__form {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5em;
  margin-top: 0.5em;
}
.pm-run-panel__param {
  display: inline-flex;
  align-items: center;
  gap: 0.25em;
}
.pm-run-panel__param {
  max-width: 100%;
}
.pm-run-panel__param input {
  /* As wide as its value (the size attribute), within the panel: a shader's buffers are a long JSON value. */
  min-width: 7.5em;
  max-width: 100%;
  padding: 0.1em 0.35em;
  border: 1px solid rgba(125, 125, 125, 0.5);
  border-radius: 0.25em;
  background: transparent;
  font-family: var(--slidev-code-font-family, monospace);
}
.pm-run-panel__run {
  padding: 0.15em 0.75em;
  border-radius: 0.25em;
  background: #0ea5e9;
  color: white;
}
.pm-run-panel__run:disabled {
  opacity: 0.6;
}
.pm-run-panel__hint {
  color: #dc2626;
}
.pm-run-panel__side {
  display: flex;
  flex-direction: column;
  gap: 0.5em;
}
.pm-run-panel__side pre {
  margin: 0;
  padding: 0.35em 0.5em;
  max-height: 8em;
  overflow: auto;
  border-radius: 0.25em;
  background: rgba(125, 125, 125, 0.12);
  font-size: 0.95em;
  white-space: pre-wrap;
}
.pm-run-panel__badge {
  display: inline-block;
  margin-bottom: 0.25em;
  padding: 0 0.4em;
  border-radius: 0.25em;
  background: #f59e0b;
  color: black;
  font-size: 0.875em;
}
.pm-run-panel__stderr {
  color: #dc2626;
}
.pm-run-panel__history {
  margin: 0;
  padding: 0;
  list-style: none;
  max-height: 6.5em;
  overflow: auto;
}
.pm-run-panel__compare-title {
  font-weight: 600;
}
.pm-run-panel__side .pm-run-panel__diff {
  max-height: 11em;
}
.pm-run-panel__diff span {
  display: block;
}
.pm-run-panel__diff span[data-kind='added'] {
  color: #16a34a;
}
.pm-run-panel__diff span[data-kind='removed'] {
  color: #dc2626;
  text-decoration: line-through;
}
</style>
