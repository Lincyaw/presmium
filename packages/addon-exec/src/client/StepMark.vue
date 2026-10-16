<script setup lang="ts">
import { useStepScope, useStepState } from '@presmium/host'
import { inject, onBeforeUnmount } from 'vue'
import { STEP_MARKS } from './source.ts'

// Internal step k of the block: the v-click registers it with the host at its
// step of the slide, and the step state tells the parent whether it is reached.
const props = defineProps<{ step: number }>()
const scope = useStepScope()
const unregister = inject(STEP_MARKS)?.(props.step, useStepState({ from: props.step }))
onBeforeUnmount(() => unregister?.())
</script>

<template>
  <span v-click="scope.step(step)" class="pm-step-mark" aria-hidden="true" />
</template>

<style scoped>
/* A mark has no box: in the grid of a stepwise run it would take a cell of its own (R-27). */
.pm-step-mark {
  display: none;
}
</style>
