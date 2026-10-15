<script setup lang="ts">
import { PmBoundary, useService, useStartReport } from '@presmium/host'
import { EXECUTOR } from '@presmium/kernel'
import { computed, reactive, ref, shallowRef } from 'vue'
import { slotSource, stringArgs } from '../src/client/index.ts'
import { appendRun, compareRuns, defaultPair, fallbackReason, withRecordedFallback } from '../src/domain/index.ts'
import type { RunHistory, RunRecord } from '../src/domain/index.ts'

// P-20 run panel: wraps a code block; runs it with the parameters in the form,
// keeps a run history in this view and compares two runs. P-24: a failed or
// timed-out run shows `recorded` instead, marked as recorded.
const props = withDefaults(defineProps<{
  lang?: string
  /** Source to run; defaults to the wrapped code block. */
  code?: string
  /** Parameters and their initial values, injected into the program as variables. */
  params?: Record<string, string | number | boolean>
  /** The `RecordedOutput`, shown when the run fails or times out. */
  recorded?: string
  /** Timeout in ms; the executor's default when omitted. */
  timeout?: number
}>(), { lang: 'python' })

const executor = useService(EXECUTOR)
const report = useStartReport()
const source = ref<HTMLElement>()
const args = reactive(stringArgs(props.params))
const history = shallowRef<RunHistory>([])
const running = ref(false)
// The runs being compared; each new run selects the last two.
const selected = ref<number[]>([])

const latest = computed(() => history.value.at(-1))
const reason = computed(() => latest.value && fallbackReason(latest.value.result))
const comparison = computed(() => {
  const [before, after] = [...selected.value].sort((a, b) => a - b).map(id => history.value.find(record => record.id === id))
  return before && after ? compareRuns(before, after) : undefined
})

async function run() {
  if (!executor.value || running.value) return
  running.value = true
  try {
    const request = { lang: props.lang, code: props.code ?? slotSource(source.value), args: { ...args }, timeoutMs: props.timeout }
    const result = await executor.value.run(request)
    history.value = appendRun(history.value, request.args, withRecordedFallback(result, props.recorded))
    selected.value = defaultPair(history.value) ?? []
  } finally {
    running.value = false
  }
}

function select(id: number) {
  selected.value = selected.value.includes(id) ? selected.value.filter(s => s !== id) : [...selected.value, id].slice(-2)
}

function describe(record: RunRecord): string {
  const params = Object.entries(record.args).map(([name, value]) => `${name}=${value}`).join(' ')
  const status = record.result.source === 'recorded' ? '预录' : record.result.ok ? '成功' : '失败'
  return [params, status, `${record.result.durationMs} ms`].filter(Boolean).join(' · ')
}

const SIGN = { same: ' ', added: '+', removed: '-' } as const
</script>

<template>
  <PmBoundary name="PmRunPanel">
    <div class="pm-run-panel" :data-state="running ? 'running' : latest ? 'done' : 'idle'" :data-runs="history.length">
      <div class="pm-run-panel__main">
        <div ref="source" class="pm-run-panel__source">
          <slot>
            <pre><code>{{ code }}</code></pre>
          </slot>
        </div>
        <form class="pm-run-panel__form" @submit.prevent="run">
          <label v-for="(_, name) in args" :key="name" class="pm-run-panel__param">
            <span>{{ name }}</span>
            <input v-model="args[name]" :name="name" spellcheck="false" autocomplete="off">
          </label>
          <button type="submit" class="pm-run-panel__run" :disabled="running || !executor">
            {{ running ? '运行中…' : history.length ? '重跑' : '运行' }}
          </button>
          <span v-if="!executor && report" class="pm-run-panel__hint">执行服务不可用</span>
        </form>
      </div>
      <div class="pm-run-panel__side">
        <div v-if="latest" class="pm-run-panel__output" :data-source="latest.result.source" :data-ok="latest.result.ok">
          <div v-if="reason" class="pm-run-panel__badge">
            预录输出 · {{ reason }}
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
            对比 #{{ comparison.before.id }} → #{{ comparison.after.id }}
          </div>
          <div v-for="change in comparison.args" :key="change.name" class="pm-run-panel__arg" :data-arg="change.name">
            {{ change.name }}：{{ change.before ?? '—' }} → {{ change.after ?? '—' }}
          </div>
          <pre class="pm-run-panel__diff"><span v-for="(line, i) in comparison.output" :key="i" :data-kind="line.kind">{{ SIGN[line.kind] }} {{ line.text }}</span></pre>
        </div>
      </div>
    </div>
  </PmBoundary>
</template>

<style scoped>
.pm-run-panel {
  display: grid;
  grid-template-columns: minmax(0, 3fr) minmax(0, 2fr);
  gap: 0.75rem;
  font-size: 0.8rem;
}
.pm-run-panel__source :deep(pre) {
  margin: 0;
  max-height: 16rem;
  overflow: auto;
}
.pm-run-panel__form {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem;
  margin-top: 0.5rem;
}
.pm-run-panel__param {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
}
.pm-run-panel__param input {
  width: 6rem;
  padding: 0.1rem 0.35rem;
  border: 1px solid rgba(125, 125, 125, 0.5);
  border-radius: 0.25rem;
  background: transparent;
  font-family: var(--slidev-code-font-family, monospace);
}
.pm-run-panel__run {
  padding: 0.15rem 0.75rem;
  border-radius: 0.25rem;
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
  gap: 0.5rem;
  min-width: 0;
}
.pm-run-panel__side pre {
  margin: 0;
  padding: 0.35rem 0.5rem;
  max-height: 6rem;
  overflow: auto;
  border-radius: 0.25rem;
  background: rgba(125, 125, 125, 0.12);
  font-size: 0.75rem;
  white-space: pre-wrap;
}
.pm-run-panel__badge {
  display: inline-block;
  margin-bottom: 0.25rem;
  padding: 0 0.4rem;
  border-radius: 0.25rem;
  background: #f59e0b;
  color: black;
  font-size: 0.7rem;
}
.pm-run-panel__stderr {
  color: #dc2626;
}
.pm-run-panel__history {
  margin: 0;
  padding: 0;
  list-style: none;
  max-height: 5rem;
  overflow: auto;
}
.pm-run-panel__compare-title {
  font-weight: 600;
}
.pm-run-panel__side .pm-run-panel__diff {
  max-height: 9rem;
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
