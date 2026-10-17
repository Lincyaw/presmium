<script setup lang="ts">
// The cover of 书卷: the deck's title large and low on the paper under an accent rule, what the cover says
// below it, and the footer without the title it repeats.
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
