<script setup lang="ts">
import { useMessages, usePresentationMode, useSectionConfig, useService, useStartReport } from '@lincyaw/host'
import { EXECUTOR, isRecord } from '@lincyaw/kernel'
import type { ParamsDisplay } from '@lincyaw/kernel'
import { computed, onBeforeUnmount, reactive, ref, shallowRef } from 'vue'
import { languageName, MESSAGES, runsInOf, seconds, useSlideSpaceBelow } from '../src/client/index.ts'
import { appendRun, compareRuns, configuredTimeout, defaultPair, EXEC_ID, fallbackReason, stringArgs, withRecordedFallback } from '../src/domain/index.ts'
import type { RunHistory, RunRecord } from '../src/domain/index.ts'
import RunOutputs from '../src/client/RunOutputs.vue'

const props = withDefaults(defineProps<{
  lang?: string
  code?: string
  params?: Record<string, unknown>
  recorded?: string
  compiledOutput?: string
  timeout?: number
  executor?: string
  session?: string
  place?: { section: string, block: string }
}>(), { lang: 'python', code: '' })

const executor = useService(EXECUTOR)
const report = useStartReport()
const config = useSectionConfig(EXEC_ID)
const t = useMessages(MESSAGES)
const args = reactive(stringArgs(props.params))
const fields = reactive(Object.fromEntries(Object.entries(props.params ?? {})
  .filter(([, value]) => isRecord(value))
  .map(([name, value]) => [name, stringArgs(value as Record<string, unknown>)])))
const presenting = usePresentationMode() === 'slides'
const root = shallowRef<HTMLElement>()
const space = ref<{ panel: number, code: number }>()
useSlideSpaceBelow(root, presenting, (panel) => {
  const main = root.value?.querySelector<HTMLElement>('.pm-run-panel__main')
  const pre = main?.querySelector<HTMLElement>('.pm-run-panel__source pre')
  if (!main || !pre) return
  const code = panel - (main.offsetHeight - pre.offsetHeight)
  if (space.value?.panel !== panel || space.value.code !== code) space.value = { panel, code }
})
const history = shallowRef<RunHistory>([])
const running = ref(false)
const resetting = ref(false)
const selected = ref<number[]>([])
let current: AbortController | undefined
onBeforeUnmount(() => current?.abort())

const routed = computed(() => {
  void history.value
  const executors = executor.value?.list() ?? []
  return props.executor ? executors.find(e => e.id === props.executor) : executors.find(e => e.supports(props.lang))
})
const display = computed((): ParamsDisplay | undefined => routed.value?.params?.(props.lang))
const runsInText = computed(() => {
  const id = latest.value?.result.executorId ?? props.executor ?? routed.value?.id
  const runsIn = runsInOf(id, id === routed.value?.id ? routed.value : executor.value?.list().find(e => e.id === id))
  if (!runsIn) return undefined
  const said = t.value.runsIn
  return runsIn.kind === 'browser' || runsIn.kind === 'machine' ? said[runsIn.kind] : said[runsIn.kind](runsIn.name)
})
const label = (name: string) => display.value?.labels[name] ?? name
const split = (name: string) => Boolean(display.value?.fields?.includes(name) && fields[name])

function runArgs(): Record<string, string> {
  return Object.fromEntries(Object.entries(args).map(([name, value]) => [name, split(name)
    ? `{${Object.entries(fields[name]!).map(([key, field]) => `${JSON.stringify(key)}: ${field.trim() || 'null'}`).join(', ')}}`
    : value]))
}

const latest = computed(() => history.value.at(-1))
const reason = computed(() => {
  const result = latest.value?.result
  const why = result && fallbackReason(result)
  if (!why) return undefined
  return why === 'failed' && result.exitCode === null && result.stderr.trim() ? result.stderr.trim() : t.value[why]
})
const outputLabel = computed(() => {
  const result = latest.value?.result
  return result && result.source === 'live' ? t.value.outputTook(seconds(result.durationMs)) : t.value.output
})
const comparison = computed(() => {
  const [before, after] = [...selected.value].sort((a, b) => a - b).map(id => history.value.find(record => record.id === id))
  return before && after ? compareRuns(before, after) : undefined
})

async function run() {
  if (!executor.value || running.value || resetting.value) return
  const controller = new AbortController()
  current = controller
  running.value = true
  try {
    const request = { lang: props.lang, code: props.code, args: runArgs(), timeoutMs: props.timeout ?? configuredTimeout(config.value), executor: props.executor, session: props.session, place: props.place }
    const result = await executor.value.run(request, controller.signal)
    if (controller.signal.aborted) return
    const recorded = props.recorded ?? (!result.ok && result.exitCode === null ? props.compiledOutput : undefined)
    history.value = appendRun(history.value, request.args, withRecordedFallback(result, recorded))
    selected.value = defaultPair(history.value) ?? []
  } finally {
    if (current === controller) {
      current = undefined
      running.value = false
    }
  }
}

async function reset() {
  if (!executor.value || !props.session || resetting.value) return
  resetting.value = true
  current?.abort()
  current = undefined
  running.value = false
  try {
    await executor.value.endSession?.(props.session)
    history.value = []
    selected.value = []
  } finally {
    resetting.value = false
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

function fieldSize(value: string | undefined): number {
  return Math.min(60, Math.max(8, (value ?? '').length + 1))
}
</script>

<template>
  <div
    ref="root"
    class="pm-run-panel"
    :class="{ 'pm-run-panel--present': presenting }"
    :style="space && { '--pm-run-panel-space': `${space.panel}px`, '--pm-run-code-space': `${space.code}px` }"
    :data-state="running ? 'running' : latest ? 'done' : 'idle'"
    :data-runs="history.length"
  >
    <div class="pm-run-panel__main">
      <form class="pm-run-panel__bar pm-run-panel__form" @submit.prevent="run">
        <span class="pm-run-panel__where"><span class="pm-run-panel__lang">{{ languageName(lang) }}</span><template v-if="runsInText"> · {{ runsInText }}</template></span>
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
          <button v-if="session" type="button" class="pm-run-panel__reset pm-ui-button" :disabled="resetting || !executor" @click="reset">
            {{ t.resetSession }}
          </button>
          <button type="submit" class="pm-run-panel__run pm-ui-button pm-ui-button--primary" :disabled="running || resetting || !executor">
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
    <div v-if="latest || history.length" class="pm-run-panel__side">
      <div v-if="latest" class="pm-run-panel__output" :data-source="latest.result.source" :data-ok="latest.result.ok">
        <div class="pm-run-panel__label">
          {{ outputLabel }}
        </div>
        <div v-if="reason" class="pm-run-panel__badge pm-ui-badge pm-ui-badge--warn">
          {{ t.recordedBadge(reason) }}
        </div>
        <RunOutputs :result="latest.result" :hide-error="Boolean(reason)" />
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
.pm-run-panel {
  --pm-text-sm: 0.875em;
  --pm-text-md: 1em;

  display: grid;
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
  --slidev-code-margin: 0;
  --slidev-code-radius: 0;

  font-size: 1.25em;
}
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
.pm-run-panel--present {
  align-items: start;
}
.pm-run-panel--present .pm-run-panel__source :deep(pre) {
  max-height: max(var(--pm-run-code-space, 20em), 6em);
}
.pm-run-panel--present .pm-run-panel__side {
  max-height: var(--pm-run-panel-space);
  overflow: auto;
}
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
