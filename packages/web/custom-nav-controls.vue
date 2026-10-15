<script setup lang="ts">
// Slides form only (a Slidev global layer): "read on the web" opens the current slide's web section (P-74).
import { configs, useNav } from '@slidev/client'
import { computed } from 'vue'
import { webOptions, webUrl } from './src/domain/index.ts'

const { currentSlideNo, slides } = useNav()
const options = computed(() => webOptions([
  configs,
  ...slides.value.map(route => (route.meta?.slide as { frontmatter?: unknown } | undefined)?.frontmatter),
]))
const href = computed(() => webUrl(options.value, currentSlideNo.value))
</script>

<template>
  <a v-if="href" class="slidev-icon-btn pm-read-web" :href="href" title="在网页中阅读" aria-label="在网页中阅读">
    <div class="i-carbon:document" />
  </a>
</template>
