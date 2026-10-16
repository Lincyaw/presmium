<script setup lang="ts">
import { useStepScope, useStepState } from '@presmium/host'
import { computed } from 'vue'

const props = withDefaults(defineProps<{ steps?: string[] }>(), {
  steps: () => ['解析文稿', '启动插件', '渲染页面'],
})

// N labels take N internal steps after the initial state (`:span: N`): internal step k
// reveals label k and highlights it until the next one; the last stays highlighted.
// Steps count from the block (`useStepState`); each is registered with the host at its
// step of the slide (`scope.step`).
const scope = useStepScope()
const states = props.steps.map((_, i) => useStepState({ from: i + 1, to: i + 1 < props.steps.length ? i + 2 : undefined }))
const reached = computed(() => states.filter(state => state.value.reached).length)

function status(i: number): string {
  const state = states[i]!.value
  return state.active ? 'active' : state.done ? 'done' : 'pending'
}
</script>

<template>
  <ol class="pm-demo-stepper" :data-step="reached">
    <li v-for="(label, i) in steps" :key="label" v-click="scope.step(i + 1)" :data-status="status(i)">
      {{ label }}
    </li>
  </ol>
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
