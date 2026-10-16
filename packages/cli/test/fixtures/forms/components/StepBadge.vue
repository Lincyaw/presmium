<script setup lang="ts">
// A component of the deck itself (`components/`), as the slides form registers it.
defineProps<{ label: string }>()
</script>

<template>
  <span class="step-badge">{{ label }}</span>
</template>
