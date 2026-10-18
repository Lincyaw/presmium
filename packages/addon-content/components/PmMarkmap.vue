<script setup lang="ts">
import MarkmapView from '../src/client/MarkmapView.vue'

defineProps<{ data: string }>()
</script>

<template>
  <MarkmapView :data="data" />
</template>
