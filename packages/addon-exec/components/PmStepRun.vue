<script setup lang="ts">
import { useHost, usePresentationMode, useSectionConfig, useService, useStartReport, useViewRole } from '@presmium/host'
import type { StepState } from '@presmium/kernel'
import type { Ref } from 'vue'
import { computed, onBeforeUnmount, onMounted, provide, ref, shallowReactive, shallowRef, watch, watchEffect } from 'vue'
import { markLine, STEP_MARKS, useMessages } from '../src/client/index.ts'
import StepMark from '../src/client/StepMark.vue'
import { configuredTimeout, EXEC_ID, frameAt, stringArgs, TRACER } from '../src/domain/index.ts'
import type { Trace } from '../src/domain/index.ts'

// P-21 stepwise execution: the code is traced once; every executed line
// becomes one internal step of the block (`:span:` = `steps`): internal step k
// highlights the line executed k-th and shows the output accumulated up to it;
// step 0 is the state before the first line.
//
// Where the host shows the final state of every step (the document view), a
// stepper of the component's own lets the reader go through the lines: what
// the component shows is a function of the section's step and the reader's
// local step, as the result of a run is of the reader's input.
const props = withDefaults(defineProps<{
  lang?: string
  /** The code to trace; the wrapped code block shows it. */
  code?: string
  params?: Record<string, string | number | boolean>
  /** Timeout in ms; else `presmium.exec.timeoutMs` of the section, else the executor's default. */
  timeout?: number
  /**
   * Number of steps (executed lines), shown in the status once traced. Declare it:
   * the steps then exist before the trace has run, so opening the slide at a
   * step (link, reload, going back from the next slide) shows that step (K-04).
   * Without it the steps appear only once the trace is ready.
   */
  steps?: number
}>(), { lang: 'python', code: '' })

const tracer = useService(TRACER)
const report = useStartReport()
const config = useSectionConfig(EXEC_ID)
const t = useMessages()
const root = ref<HTMLElement>()
const source = ref<HTMLElement>()
const mounted = ref(false)
const near = ref(false)
const trace = shallowRef<Trace>()

const count = computed(() => props.steps ?? trace.value?.events.length ?? 0)
const traced = computed(() => (trace.value?.error === undefined ? trace.value?.events.length : undefined))
const mismatch = computed(() => props.steps !== undefined && traced.value !== undefined && traced.value !== props.steps)
// What `:steps:` should be is for the author (the build reports it too, presmium.exec): the presenter
// view and the dev server say it, the audience and readers see only the steps.
const role = useViewRole()
const authoring = computed(() => role.value === 'presenter' || import.meta.env.DEV)

// Each step mark reports whether its step has been reached; marks are consecutive, so the step is how many are.
const marks = shallowReactive(new Map<number, Readonly<Ref<StepState>>>())
provide(STEP_MARKS, (k, state) => {
  marks.set(k, state)
  return () => marks.delete(k)
})
const sectionStep = computed(() => [...marks.values()].filter(state => state.value.reached).length)

// The host shows every step at once (its step is infinite) in the document view.
const hostStep = useHost().useStep()
const expanded = computed(() => !Number.isFinite(hostStep.value))
const local = ref<number>()
const last = computed(() => traced.value ?? count.value)
const step = computed(() => (expanded.value ? local.value ?? last.value : sectionStep.value))
const frame = computed(() => (trace.value ? frameAt(trace.value, step.value) : undefined))
const state = computed(() => {
  if (trace.value) return trace.value.error === undefined ? 'ready' : 'failed'
  return !tracer.value && report.value ? 'unavailable' : 'loading'
})

function go(target: number) {
  local.value = Math.max(0, Math.min(last.value, target))
}

// The slides trace at once. In the document form, where every section of a page is mounted,
// tracing (which loads the Python runtime) waits until the block nears the viewport or its
// section reaches one of its steps (scrolly).
const lazy = usePresentationMode() === 'document'
const wanted = computed(() => !lazy || near.value || (!expanded.value && sectionStep.value > 0))
let observer: IntersectionObserver | undefined

onMounted(() => {
  mounted.value = true
  if (!lazy || !root.value || typeof IntersectionObserver === 'undefined') {
    near.value = true
    return
  }
  observer = new IntersectionObserver((entries) => {
    if (!entries.some(entry => entry.isIntersecting)) return
    near.value = true
    observer?.disconnect()
  }, { rootMargin: '200px 0px' })
  observer.observe(root.value)
})
onBeforeUnmount(() => observer?.disconnect())

const stopLoading = watch([tracer, mounted, wanted], async ([service, ready, want]) => {
  if (!service || !ready || !want) return
  stopLoading()
  const timeoutMs = props.timeout ?? configuredTimeout(config.value)
  trace.value = await service.trace({ lang: props.lang, code: props.code, args: stringArgs(props.params), timeoutMs })
})

watchEffect(() => markLine(source.value, frame.value?.line, 'pm-step-run__line'), { flush: 'post' })
</script>

<template>
  <div
    ref="root"
    class="pm-step-run"
    :data-state="state"
    :data-steps="count"
    :data-step="frame?.step"
    :data-line="frame?.line"
  >
    <div ref="source" class="pm-step-run__source">
      <slot>
        <pre><code><template v-for="(text, i) in code.split('\n')" :key="i"><span class="line">{{ text }}</span>{{ '\n' }}</template></code></pre>
      </slot>
    </div>
    <div class="pm-step-run__side">
      <div class="pm-step-run__status">
        <template v-if="state === 'loading'">
          {{ t.tracing }}
        </template>
        <template v-else-if="state === 'unavailable'">
          {{ t.unavailable }}
        </template>
        <template v-else-if="state === 'failed'">
          {{ t.traceFailed }}
        </template>
        <template v-else>
          {{ t.stepOf(frame?.step ?? 0, traced ?? 0) }}{{ frame?.line ? t.atLine(frame.line) : '' }}{{ trace?.truncated ? t.truncated : '' }}
          <div v-if="authoring && mismatch" class="pm-step-run__warning">
            {{ t.stepsMismatch(steps ?? 0, traced ?? 0) }}
          </div>
          <div v-else-if="authoring && steps === undefined" class="pm-step-run__warning">
            {{ t.stepsMissing(traced ?? 0) }}
          </div>
        </template>
      </div>
      <div v-if="expanded && state === 'ready'" class="pm-step-run__stepper" role="group" :aria-label="t.stepper" @keydown.stop>
        <button type="button" :aria-label="t.previousStep" :disabled="(frame?.step ?? 0) <= 0" @click="go((frame?.step ?? 0) - 1)">
          ◀
        </button>
        <input
          type="range"
          min="0"
          :max="last"
          :value="frame?.step ?? 0"
          :aria-label="t.stepper"
          :aria-valuetext="t.stepOf(frame?.step ?? 0, last)"
          @input="go(Number(($event.target as HTMLInputElement).value))"
        >
        <button type="button" :aria-label="t.nextStep" :disabled="(frame?.step ?? 0) >= last" @click="go((frame?.step ?? 0) + 1)">
          ▶
        </button>
      </div>
      <pre class="pm-step-run__output">{{ trace?.error ?? frame?.output }}</pre>
    </div>
    <StepMark v-for="k in count" :key="k" :step="k" />
  </div>
</template>

<style scoped>
.pm-step-run {
  display: grid;
  /* Code and output side by side where there is room; stacked where it is narrow (a phone),
     so the code keeps the full width. Sizes follow the slide's font size (N-05). */
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 20rem), 1fr));
  gap: 0.75em;
  font-size: 0.8em;
}
.pm-step-run__source {
  min-width: 0;
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
.pm-step-run__side {
  min-width: 0;
}
.pm-step-run__status {
  margin-bottom: 0.35em;
  opacity: 0.75;
}
.pm-step-run__warning {
  color: #d97706;
}
.pm-step-run__stepper {
  display: flex;
  align-items: center;
  gap: 0.5em;
  margin-bottom: 0.35em;
}
.pm-step-run__stepper button {
  min-width: 2.25em;
  padding: 0.1em 0.5em;
  border: 1px solid rgba(125, 125, 125, 0.5);
  border-radius: 0.25em;
}
.pm-step-run__stepper button:disabled {
  opacity: 0.4;
}
.pm-step-run__stepper input {
  flex: 1;
  min-width: 0;
}
.pm-step-run__output {
  margin: 0;
  min-height: 3em;
  max-height: 18em;
  overflow: auto;
  padding: 0.35em 0.5em;
  border-radius: 0.25em;
  background: rgba(125, 125, 125, 0.12);
  font-size: 0.95em;
  white-space: pre-wrap;
}
</style>
