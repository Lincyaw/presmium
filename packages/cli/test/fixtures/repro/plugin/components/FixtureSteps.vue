<script setup lang="ts">
// A component of the deck's own plugin, built into both forms like any plugin component.
withDefaults(defineProps<{ steps?: string[] }>(), { steps: () => ['Parse', 'Start', 'Render'] })
</script>

<template>
  <ol class="fx-repro-steps">
    <li v-for="step in steps" :key="step">
      {{ step }}
    </li>
  </ol>
</template>
