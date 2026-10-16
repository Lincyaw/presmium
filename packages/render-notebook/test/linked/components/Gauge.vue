<script setup lang="ts">
// A component of the deck itself, which the web form shows and the notebook links to.
defineProps<{ level: number }>()
</script>

<template>
  <meter class="gauge" min="0" max="5" :value="level" />
</template>
