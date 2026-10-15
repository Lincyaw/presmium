<script setup lang="ts">
// The slides renderer wraps each plugin component that has an IR `fallback` in this:
// a PDF or PNG export shows the fallback (what the component shows without interaction),
// the slides show the component itself, which does not even mount while printing.
import { useStaticRender } from '@presmium/host'

const printing = useStaticRender()
</script>

<template>
  <div v-if="printing" class="pm-static-fallback">
    <slot name="fallback" />
  </div>
  <slot v-else />
</template>
