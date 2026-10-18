<script setup lang="ts">
import { useStepScope, useStepState } from '@presmium/host'
import { inject, onBeforeUnmount } from 'vue'
import { STEP_MARKS } from './source.ts'

const props = defineProps<{ step: number }>()
const scope = useStepScope()
const unregister = inject(STEP_MARKS)?.(props.step, useStepState({ from: props.step }))
onBeforeUnmount(() => unregister?.())
</script>

<template>
  <span v-click="scope.step(step)" class="pm-step-mark" aria-hidden="true" />
</template>

<style scoped>
.pm-step-mark {
  display: none;
}
</style>
