<script setup lang="ts">
import { PmBoundary } from '@presmium/host'
import MarkmapView from '../src/client/MarkmapView.vue'

/** Mindmap of a `{markmap}` directive (P-41); `data` is produced by the directive. */
defineProps<{ data: string }>()
</script>

<template>
  <PmBoundary name="PmMarkmap">
    <MarkmapView :data="data" />
  </PmBoundary>
</template>
