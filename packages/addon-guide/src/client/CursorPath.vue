<script setup lang="ts">
import { useHost, usePrefersReducedMotion, useStepScope, useStepState, useStepTime } from '@lincyaw/host'
import { computed, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import type { PlannedWaypoint } from '../domain/index.ts'
import { centerIn } from './geometry.ts'
import type { Point } from './geometry.ts'
import { resolveTarget, useTargetMark } from './targets.ts'

const props = defineProps<{ plan: PlannedWaypoint[] }>()

const plan = props.plan
const scope = useStepScope()
const steps = computed(() => [...new Set(plan.map(point => point.at))].filter(step => step > 0).map(scope.step))
const reached = plan.map(point => useStepState({ from: point.at }))
const index = computed(() => reached.filter(state => state.value.reached).length - 1)
const point = computed(() => plan[index.value])
const reduced = usePrefersReducedMotion()

// The glide to a waypoint and the press of a click follow the step's time, so a lecture's video films them.
const MOVE_MS = 500
const PRESS_AT = 450
const PRESS_MS = 400
const hostStep = useHost().useStep()
const stepTime = useStepTime({ until: PRESS_AT + PRESS_MS })
const time = computed(() => (point.value && hostStep.value - scope.at.value === point.value.at ? stepTime.value : Infinity))

const cursor = ref<HTMLElement>()
const from = shallowRef<Point>()
const to = shallowRef<Point>()

function measure() {
  const el = cursor.value
  const frame = el?.offsetParent
  if (!(frame instanceof HTMLElement)) return
  const at = (i: number) => {
    const target = resolveTarget(el, plan[i]?.to)
    return target ? centerIn(target, frame) : undefined
  }
  to.value = at(Math.max(index.value, 0)) ?? to.value
  from.value = index.value > 0 ? at(index.value - 1) ?? to.value : to.value
}

const position = computed((): Point | undefined => {
  const [start, end] = [from.value, to.value]
  if (!start || !end) return end
  const k = 1 - (1 - Math.min(1, time.value / MOVE_MS)) ** 3
  return { x: start.x + (end.x - start.x) * k, y: start.y + (end.y - start.y) * k }
})
const press = computed(() => Math.min(1, Math.max(0, (time.value - PRESS_AT) / PRESS_MS)))

watch(index, measure, { flush: 'post' })

let observer: ResizeObserver | undefined
onMounted(() => {
  observer = new ResizeObserver(measure)
  const parent = cursor.value?.parentElement
  if (parent) observer.observe(parent)
  for (const { to } of plan) {
    const target = resolveTarget(cursor.value, to)
    if (target) observer.observe(target)
  }
  measure()
})
onBeforeUnmount(() => observer?.disconnect())

useTargetMark(cursor, () => point.value?.to, 'data-pm-cursor', () => (point.value?.action === 'move' ? undefined : point.value?.action))
</script>

<template>
  <div
    ref="cursor"
    class="pm-cursor"
    aria-hidden="true"
    :data-waypoint="index"
    :data-action="point?.action ?? 'none'"
    :data-motion="reduced ? 'reduced' : 'full'"
    :style="[position && { transform: `translate(${position.x}px, ${position.y}px)` }, { '--pm-cursor-press': press }]"
  >
    <span class="pm-cursor__ring" />
    <svg class="pm-cursor__arrow" width="20" height="26" viewBox="-2 -2 20 26">
      <path d="M0 0V18L5 13.5L8.5 21L11.5 19.5L8 12H14.5Z" />
    </svg>
    <span v-for="step in steps" :key="step" v-click="step" hidden />
  </div>
</template>

<style scoped>
.pm-cursor {
  position: absolute;
  left: 0;
  top: 0;
  width: 0;
  height: 0;
  z-index: 20;
  pointer-events: none;
  opacity: 0;
  transition: opacity 0.2s;
}
.pm-cursor:not([data-waypoint='-1']) {
  opacity: 1;
}
.pm-cursor__arrow {
  position: absolute;
  left: -2px;
  top: -2px;
  /* The page's base styles cap an svg at the width of its box, which is 0 here. */
  max-width: none;
  fill: #fff;
  stroke: #111;
  stroke-width: 1.5;
  stroke-linejoin: round;
  filter: drop-shadow(0 1px 2px rgb(0 0 0 / 0.35));
}
.pm-cursor__ring {
  position: absolute;
  left: -14px;
  top: -14px;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  border: 3px solid var(--pm-color-accent);
  opacity: 0;
}
.pm-cursor[data-action='hover'] .pm-cursor__ring {
  opacity: 0.35;
}
.pm-cursor[data-action='click'] .pm-cursor__ring {
  opacity: calc(0.7 * var(--pm-cursor-press, 1));
  transform: scale(calc(2.2 - 1.2 * var(--pm-cursor-press, 1)));
}
.pm-cursor[data-motion='reduced'] {
  transition: none;
}
</style>

<style>
[data-pm-cursor='hover'] {
  outline: 2px dashed var(--pm-color-accent);
  outline-offset: 3px;
}
[data-pm-cursor='click'] {
  outline: 2px solid var(--pm-color-accent);
  outline-offset: 3px;
}
</style>
