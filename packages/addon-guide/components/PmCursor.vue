<script setup lang="ts">
import { computed } from 'vue'
import CursorPath from '../src/client/CursorPath.vue'
import { planCursorPath } from '../src/domain/index.ts'
import type { Waypoint } from '../src/domain/index.ts'

const props = defineProps<{
  path: Waypoint[]
}>()

const plan = computed(() => planCursorPath(props.path ?? []))
const key = computed(() => JSON.stringify(plan.value))
</script>

<template>
  <CursorPath :key="key" :plan="plan" />
</template>
