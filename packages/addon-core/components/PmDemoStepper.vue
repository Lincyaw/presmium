<script setup lang="ts">
import { useStepScope, useStepState } from '@lincyaw/host'
import { computed } from 'vue'

const props = withDefaults(defineProps<{ steps?: string[] }>(), {
  steps: () => ['解析文稿', '启动插件', '渲染页面'],
})

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
  color: var(--pm-color-accent);
}
.pm-demo-stepper li[data-status='done'] {
  color: var(--pm-color-muted);
}
</style>
