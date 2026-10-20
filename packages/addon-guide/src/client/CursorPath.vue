<script setup lang="ts">
import { usePrefersReducedMotion, useStepScope, useStepState } from '@lincyaw/host'
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

const cursor = ref<HTMLElement>()
const position = shallowRef<Point>()

function measure() {
  const el = cursor.value
  const frame = el?.offsetParent
  const target = resolveTarget(el, plan[Math.max(index.value, 0)]?.to)
  if (frame instanceof HTMLElement && target) position.value = centerIn(target, frame) ?? position.value
}

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
    :style="position && { transform: `translate(${position.x}px, ${position.y}px)` }"
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
  transition: transform 0.5s cubic-bezier(0.3, 0.7, 0.4, 1), opacity 0.2s;
}
.pm-cursor:not([data-waypoint='-1']) {
  opacity: 1;
}
.pm-cursor__arrow {
  position: absolute;
  left: -2px;
  top: -2px;
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
  opacity: 0.7;
}
.pm-cursor[data-motion='full'][data-action='click'] .pm-cursor__ring {
  animation: pm-cursor-press 0.4s ease-out 0.45s both;
}
.pm-cursor[data-motion='reduced'] {
  transition: none;
}
@keyframes pm-cursor-press {
  from {
    opacity: 0;
    transform: scale(2.2);
  }
  to {
    opacity: 0.7;
    transform: scale(1);
  }
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
