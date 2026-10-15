<script setup lang="ts">
import { useStepState } from '@presmium/host'
import { inject, onBeforeUnmount } from 'vue'
import { STEP_MARKS } from './source.ts'

// One click of the slide: the v-click registers it with the host (at its
// absolute position), and the step state tells the parent whether it is reached.
const props = defineProps<{ at: number }>()
const unregister = inject(STEP_MARKS)?.(props.at, useStepState({ from: props.at }))
onBeforeUnmount(() => unregister?.())
</script>

<template>
  <span v-click="at" class="pm-step-mark" aria-hidden="true" />
</template>
