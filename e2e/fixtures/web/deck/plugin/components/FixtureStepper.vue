<script setup lang="ts">
// N labels take N internal steps after the initial state (`:span: N`): internal step k reveals
// label k and highlights it until the next one. Steps count from the component's block.
import { PmBoundary, useStepScope, useStepState } from '@presmium/host'
import { computed } from 'vue'

const props = defineProps<{ steps: string[] }>()

const scope = useStepScope()
const states = props.steps.map((_, i) => useStepState({ from: i + 1, to: i + 1 < props.steps.length ? i + 2 : undefined }))
const reached = computed(() => states.filter(state => state.value.reached).length)

function status(i: number): string {
  const state = states[i]!.value
  return state.active ? 'active' : state.done ? 'done' : 'pending'
}
</script>

<template>
  <PmBoundary name="FixtureStepper">
    <ol class="fx-stepper" :data-step="reached">
      <li v-for="(label, i) in steps" :key="label" v-click="scope.step(i + 1)" :data-status="status(i)">
        {{ label }}
      </li>
    </ol>
  </PmBoundary>
</template>
