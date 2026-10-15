<script setup lang="ts">
import { PmBoundary, useService, useStartReport } from '@presmium/host'
import type { StepState } from '@presmium/kernel'
import type { Ref } from 'vue'
import { computed, onMounted, provide, ref, shallowReactive, shallowRef, watch, watchEffect } from 'vue'
import { markLine, slotSource, STEP_MARKS } from '../src/client/index.ts'
import StepMark from '../src/client/StepMark.vue'
import { frameAt, stringArgs, TRACER } from '../src/domain/index.ts'
import type { Trace } from '../src/domain/index.ts'

// P-21 stepwise execution: the wrapped code is traced once; every executed line
// becomes one internal step of the block (`:span:` = `steps`): internal step k
// highlights the line executed k-th and shows the output accumulated up to it;
// step 0 is the state before the first line.
const props = withDefaults(defineProps<{
  lang?: string
  /** Source to trace; defaults to the wrapped code block. */
  code?: string
  params?: Record<string, string | number | boolean>
  timeout?: number
  /**
   * Number of steps (executed lines), shown in the status once traced. Declare it:
   * the steps then exist before the trace has run, so opening the slide at a
   * step (link, reload, going back from the next slide) shows that step (K-04).
   * Without it the steps appear only once the trace is ready.
   */
  steps?: number
}>(), { lang: 'python' })

const tracer = useService(TRACER)
const report = useStartReport()
const source = ref<HTMLElement>()
const mounted = ref(false)
const trace = shallowRef<Trace>()

const count = computed(() => props.steps ?? trace.value?.events.length ?? 0)
const traced = computed(() => (trace.value?.error === undefined ? trace.value?.events.length : undefined))
const mismatch = computed(() => props.steps !== undefined && traced.value !== undefined && traced.value !== props.steps)

// Each step mark reports whether its step has been reached; marks are consecutive, so the step is how many are.
const marks = shallowReactive(new Map<number, Readonly<Ref<StepState>>>())
provide(STEP_MARKS, (k, state) => {
  marks.set(k, state)
  return () => marks.delete(k)
})
const step = computed(() => [...marks.values()].filter(state => state.value.reached).length)
const frame = computed(() => (trace.value ? frameAt(trace.value, step.value) : undefined))
const state = computed(() => {
  if (trace.value) return trace.value.error === undefined ? 'ready' : 'failed'
  return !tracer.value && report.value ? 'unavailable' : 'loading'
})

onMounted(() => {
  mounted.value = true
})

const stopLoading = watch([tracer, mounted], async ([service, ready]) => {
  if (!service || !ready) return
  stopLoading()
  const code = props.code ?? slotSource(source.value)
  trace.value = await service.trace({ lang: props.lang, code, args: stringArgs(props.params), timeoutMs: props.timeout })
})

watchEffect(() => markLine(source.value, frame.value?.line, 'pm-step-run__line'), { flush: 'post' })
</script>

<template>
  <PmBoundary name="PmStepRun">
    <div
      class="pm-step-run"
      :data-state="state"
      :data-steps="count"
      :data-step="frame?.step"
      :data-line="frame?.line"
    >
      <div ref="source" class="pm-step-run__source">
        <slot>
          <pre><code><template v-for="(text, i) in (code ?? '').split('\n')" :key="i"><span class="line">{{ text }}</span>{{ '\n' }}</template></code></pre>
        </slot>
      </div>
      <div class="pm-step-run__side">
        <div class="pm-step-run__status">
          <template v-if="state === 'loading'">
            正在追踪执行……
          </template>
          <template v-else-if="state === 'unavailable'">
            执行服务不可用
          </template>
          <template v-else-if="state === 'failed'">
            追踪失败
          </template>
          <template v-else>
            第 {{ frame?.step }} / {{ traced }} 步<template v-if="frame?.line">
              · 第 {{ frame.line }} 行
            </template>
            <template v-if="trace?.truncated">
              （已截断）
            </template>
            <div v-if="mismatch" class="pm-step-run__warning">
              steps 声明为 {{ steps }}，实际执行 {{ traced }} 行
            </div>
            <div v-else-if="steps === undefined" class="pm-step-run__warning">
              未声明 steps（应为 {{ traced }}），直接打开某一步时无法恢复
            </div>
          </template>
        </div>
        <pre class="pm-step-run__output">{{ trace?.error ?? frame?.output }}</pre>
      </div>
      <StepMark v-for="k in count" :key="k" :step="k" />
    </div>
  </PmBoundary>
</template>

<style scoped>
.pm-step-run {
  display: grid;
  grid-template-columns: minmax(0, 3fr) minmax(0, 2fr);
  gap: 0.75rem;
  font-size: 0.8rem;
}
.pm-step-run__source :deep(pre) {
  margin: 0;
}
.pm-step-run__source :deep(.line) {
  display: inline-block;
  min-width: 100%;
}
.pm-step-run__source :deep(.pm-step-run__line) {
  background: rgba(14, 165, 233, 0.25);
  box-shadow: inset 3px 0 #0ea5e9;
}
.pm-step-run__status {
  margin-bottom: 0.35rem;
  opacity: 0.75;
}
.pm-step-run__warning {
  color: #d97706;
}
.pm-step-run__output {
  margin: 0;
  min-height: 3rem;
  max-height: 14rem;
  overflow: auto;
  padding: 0.35rem 0.5rem;
  border-radius: 0.25rem;
  background: rgba(125, 125, 125, 0.12);
  font-size: 0.75rem;
  white-space: pre-wrap;
}
</style>
