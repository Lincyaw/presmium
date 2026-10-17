<script setup lang="ts">
// A slide of 书卷 (docs/design/slide.dc.html): the chapter it belongs to above its title (the slides renderer
// writes it as `presmiumChapter`), its content, and the footer.
import { useSlideContext } from '@slidev/client'
import { computed } from 'vue'
import SlideFooter from '../parts/SlideFooter.vue'

const { $frontmatter } = useSlideContext()
const chapter = computed(() => (typeof $frontmatter.presmiumChapter === 'string' ? $frontmatter.presmiumChapter : ''))
</script>

<template>
  <div class="slidev-layout default pm-book">
    <p v-if="chapter" class="pm-book__chapter">
      {{ chapter }}
    </p>
    <div class="pm-book__content">
      <slot />
    </div>
    <SlideFooter />
  </div>
</template>
