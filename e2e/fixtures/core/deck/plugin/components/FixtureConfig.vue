<script setup lang="ts">
// The `label` option of fixture.core where the component is: global, or its section's {config}.
import { PmBoundary, useSectionConfig } from '@presmium/host'

const config = useSectionConfig('fixture.core')
</script>

<template>
  <PmBoundary name="FixtureConfig">
    <p class="fx-config">
      {{ config.label }}
    </p>
  </PmBoundary>
</template>
