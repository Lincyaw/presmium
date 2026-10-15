<script setup lang="ts">
import { PmBoundary, useStepState } from '@presmium/host'
import { computed } from 'vue'

const props = withDefaults(defineProps<{ steps?: string[] }>(), {
  steps: () => ['解析文稿', '启动插件', '渲染页面'],
})

// Step i (1-based) is revealed by its v-click and highlighted while it is the current step.
const states = props.steps.map((_, i) => useStepState({ from: i + 1, to: i + 2 }))
const reached = computed(() => states.filter(state => state.value.reached).length)

function status(i: number): string {
  const state = states[i]!.value
  return state.active ? 'active' : state.done ? 'done' : 'pending'
}
</script>

<template>
  <PmBoundary name="PmDemoStepper">
    <ol class="pm-demo-stepper" :data-step="reached">
      <li v-for="(label, i) in steps" :key="label" v-click="i + 1" :data-status="status(i)">
        {{ label }}
      </li>
    </ol>
  </PmBoundary>
</template>

<style scoped>
.pm-demo-stepper li[data-status='active'] {
  font-weight: 700;
  color: #0ea5e9;
}
.pm-demo-stepper li[data-status='done'] {
  opacity: 0.6;
}
</style>
