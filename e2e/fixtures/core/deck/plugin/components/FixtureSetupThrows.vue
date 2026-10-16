<script setup lang="ts">
// Throws in its own setup, outside any boundary of its own: the renderers' boundary around it catches it.
throw new Error('fixture setup threw on purpose')
</script>

<template>
  <p class="fx-setup-throws">
    never shown
  </p>
</template>
