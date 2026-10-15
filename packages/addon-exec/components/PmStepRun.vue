<script setup lang="ts">
import { PmBoundary, useService, useStartReport } from '@presmium/host'
import type { StepState } from '@presmium/kernel'
import type { Ref } from 'vue'
import { computed, onMounted, provide, ref, shallowReactive, shallowRef, watch, watchEffect } from 'vue'
import { markLine, slotSource, STEP_MARKS, stringArgs } from '../src/client/index.ts'
import StepMark from '../src/client/StepMark.vue'
import { frameAt, TRACER } from '../src/domain/index.ts'
import type { Trace } from '../src/domain/index.ts'

// P-21 stepwise execution: the wrapped code is traced once; every executed line
// becomes one step of the slide. The view is a function of the step: the line
// of that step is highlighted and the output accumulated up to it is shown.
const props = withDefaults(defineProps<{
  lang?: string
  /** Source to trace; defaults to the wrapped code block. */
  code?: string
  params?: Record<string, string | number | boolean>
  timeout?: number
}>(), { lang: 'python' })

const tracer = useService(TRACER)
const report = useStartReport()
const source = ref<HTMLElement>()
const mounted = ref(false)
const trace = shallowRef<Trace>()

// Each step mark reports whether its step has been reached; the current step is the furthest one.
const marks = shallowReactive(new Map<number, Readonly<Ref<StepState>>>())
provide(STEP_MARKS, (at, state) => {
  marks.set(at, state)
  return () => marks.delete(at)
})
const step = computed(() => Math.max(0, ...[...marks].filter(([, state]) => state.value.reached).map(([at]) => at)))
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
      :data-steps="trace?.events.length"
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
            第 {{ frame?.step }} / {{ trace?.events.length }} 步<template v-if="frame?.line">
              · 第 {{ frame.line }} 行
            </template>
            <template v-if="trace?.truncated">
              （已截断）
            </template>
          </template>
        </div>
        <pre class="pm-step-run__output">{{ trace?.error ?? frame?.output }}</pre>
      </div>
      <template v-if="trace">
        <StepMark v-for="i in trace.events.length" :key="i" :at="i" />
      </template>
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
