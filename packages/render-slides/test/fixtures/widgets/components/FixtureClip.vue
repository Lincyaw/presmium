<script setup lang="ts">
// A media file the slides publish: `src` is its published URL (`ComponentNode.assets`).
defineProps<{ src: string }>()
</script>

<template>
  <video class="fixture-clip" :src="src" />
</template>
