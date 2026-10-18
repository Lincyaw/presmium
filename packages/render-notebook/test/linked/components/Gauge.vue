<script setup lang="ts">
defineProps<{ level: number }>()
</script>

<template>
  <meter class="gauge" min="0" max="5" :value="level" />
</template>
