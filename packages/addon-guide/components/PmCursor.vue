<script setup lang="ts">
import { computed } from 'vue'
import CursorPath from '../src/client/CursorPath.vue'
import { planCursorPath } from '../src/domain/index.ts'
import type { Waypoint } from '../src/domain/index.ts'

const props = defineProps<{
  /** Waypoints in order: `{ to: '#selector', action?: 'move' | 'hover' | 'click', at?: step }`. */
  path: Waypoint[]
}>()

const plan = computed(() => planCursorPath(props.path ?? []))
// A changed path (an edit of the deck) mounts a new cursor, which registers the new steps.
const key = computed(() => JSON.stringify(plan.value))
</script>

<template>
  <CursorPath :key="key" :plan="plan" />
</template>
