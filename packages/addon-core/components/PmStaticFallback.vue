<script setup lang="ts">
import { useStaticRender } from '@lincyaw/host'

const printing = useStaticRender()
</script>

<template>
  <div v-if="printing" class="pm-static-fallback">
    <slot name="fallback" />
  </div>
  <slot v-else />
</template>
