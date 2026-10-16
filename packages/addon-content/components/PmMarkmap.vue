<script setup lang="ts">
import MarkmapView from '../src/client/MarkmapView.vue'

/** Mindmap of a `{markmap}` directive (P-41); `data` is produced by the directive. */
defineProps<{ data: string }>()
</script>

<template>
  <MarkmapView :data="data" />
</template>
