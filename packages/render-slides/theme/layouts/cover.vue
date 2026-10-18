<script setup lang="ts">
import SlideFooter from '../parts/SlideFooter.vue'
</script>

<template>
  <div class="slidev-layout cover pm-book pm-book--cover">
    <div class="pm-book__content">
      <slot />
    </div>
    <SlideFooter :title="false" />
  </div>
</template>
