<script setup lang="ts">
import { PmIcon, useHost, useMessages, usePresentationMode, useSectionConfig, useService, useStartReport, useViewRole } from '@lincyaw/host'
import type { StepState } from '@lincyaw/kernel'
import type { Ref } from 'vue'
import { computed, onBeforeUnmount, onMounted, provide, ref, shallowReactive, shallowRef, watch, watchEffect } from 'vue'
import { markLine, MESSAGES, STEP_MARKS } from '../src/client/index.ts'
import StepMark from '../src/client/StepMark.vue'
import { configuredTimeout, EXEC_ID, frameAt, stringArgs, TRACER } from '../src/domain/index.ts'
import type { Trace } from '../src/domain/index.ts'

const props = withDefaults(defineProps<{
  lang?: string
  code?: string
  params?: Record<string, string | number | boolean>
  timeout?: number
  steps?: number
}>(), { lang: 'python', code: '' })

const tracer = useService(TRACER)
const report = useStartReport()
const config = useSectionConfig(EXEC_ID)
const t = useMessages(MESSAGES)
const root = ref<HTMLElement>()
const source = ref<HTMLElement>()
const mounted = ref(false)
const near = ref(false)
const trace = shallowRef<Trace>()

const count = computed(() => props.steps ?? trace.value?.events.length ?? 0)
const traced = computed(() => (trace.value?.error === undefined ? trace.value?.events.length : undefined))
const mismatch = computed(() => props.steps !== undefined && traced.value !== undefined && traced.value !== props.steps)
const role = useViewRole()
const authoring = computed(() => role.value === 'presenter' || import.meta.env.DEV)

const marks = shallowReactive(new Map<number, Readonly<Ref<StepState>>>())
provide(STEP_MARKS, (k, state) => {
  marks.set(k, state)
  return () => marks.delete(k)
})
const sectionStep = computed(() => [...marks.values()].filter(state => state.value.reached).length)

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
        <button type="button" class="pm-ui-button pm-ui-button--small" :aria-label="t.previousStep" :disabled="(frame?.step ?? 0) <= 0" @click="go((frame?.step ?? 0) - 1)">
          <PmIcon name="chevron-left" size="1.1em" :stroke-width="2" />
        </button>
        <input
          type="range"
          class="pm-ui-checkbox"
          min="0"
          :max="last"
          :value="frame?.step ?? 0"
          :aria-label="t.stepper"
          :aria-valuetext="t.stepOf(frame?.step ?? 0, last)"
          @input="go(Number(($event.target as HTMLInputElement).value))"
        >
        <button type="button" class="pm-ui-button pm-ui-button--small" :aria-label="t.nextStep" :disabled="(frame?.step ?? 0) >= last" @click="go((frame?.step ?? 0) + 1)">
          <PmIcon name="chevron-right" size="1.1em" :stroke-width="2" />
        </button>
      </div>
      <pre class="pm-step-run__output">{{ trace?.error ?? frame?.output }}</pre>
    </div>
    <StepMark v-for="k in count" :key="k" :step="k" />
  </div>
</template>

<style scoped>
.pm-step-run {
  --pm-text-sm: 0.875em;

  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 20rem), 1fr));
  gap: 0.75em;
  color: var(--pm-color-ink);
  font-family: var(--pm-font-sans);
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
  background: var(--pm-color-selected);
  box-shadow: inset 3px 0 var(--pm-color-accent);
}
.pm-step-run__side {
  min-width: 0;
}
.pm-step-run__status {
  margin-bottom: 0.4em;
  color: var(--pm-color-muted);
}
.pm-step-run__warning {
  color: var(--pm-color-warn);
}
.pm-step-run__stepper {
  display: flex;
  align-items: center;
  gap: 0.5em;
  margin-bottom: 0.4em;
}
.pm-step-run__stepper .pm-ui-button {
  min-width: 2.25em;
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
  padding: 0.6em 0.9em;
  border-radius: var(--pm-radius-panel);
  background: var(--pm-color-sunk);
  color: var(--pm-color-ink);
  font-family: var(--pm-font-mono);
  font-size: 0.95em;
  line-height: 1.6;
  white-space: pre-wrap;
}
</style>
