<script setup lang="ts">
import { computed } from 'vue'
import SceneView from '../src/client/SceneView.vue'

const props = defineProps<{
  scene: string
  durations?: number[]
  aspect?: string
  height?: string
  alt?: string
  still?: string
}>()

// The view reads the scene and its steps once: another scene or other durations in the source make a new view.
const key = computed(() => JSON.stringify([props.scene, props.durations ?? []]))
</script>

<template>
  <SceneView :key="key" v-bind="props" />
</template>
