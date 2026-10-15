<script setup lang="ts">
import { PmBoundary } from '@presmium/host'
import MarkmapView from '../src/client/MarkmapView.vue'

/** Mindmap of a `markmap` code block (P-41); `data` is produced by the Markdown transform. */
defineProps<{ data: string }>()
</script>

<template>
  <PmBoundary name="PmMarkmap">
    <MarkmapView :data="data" />
  </PmBoundary>
</template>
