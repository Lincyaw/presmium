<script setup lang="ts">
// Slides form only (a Slidev global layer): "read on the web" opens the current slide's web section at its step (P-74).
// The slides renderer adds this addon when the deck has a web form. The web form is at
// `presmium: { presmium.web: { webUrl } }`, else in the `web` directory next to the slides.
import { useMessages } from '@presmium/host'
import { configs, useNav } from '@slidev/client'
import { computed } from 'vue'
import { formOptions, WEB_MESSAGES, webUrl } from './src/domain/index.ts'

const t = useMessages(WEB_MESSAGES)
const { currentSlideNo, clicks } = useNav()
const base = computed(() => formOptions(configs.presmium).webUrl ?? new URL('../web', new URL(import.meta.env.BASE_URL, location.href)).href)
const href = computed(() => webUrl(base.value, currentSlideNo.value, clicks.value))
</script>

<template>
  <a class="slidev-icon-btn pm-read-web" :href="href" :title="t.readOnWeb" :aria-label="t.readOnWeb">
    <div class="i-carbon:document" />
  </a>
</template>
