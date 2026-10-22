<script setup lang="ts">
import { useMessages } from '@lincyaw/host'
import { configs, useNav } from '@slidev/client'
import { computed } from 'vue'
import { crossFormLinks, WEB_MESSAGES, webPositionUrl } from './src/domain/index.ts'

const t = useMessages(WEB_MESSAGES)
const { currentSlideNo, clicks } = useNav()
const base = computed(() => crossFormLinks(configs.presmium).webUrl ?? new URL('../web', new URL(import.meta.env.BASE_URL, location.href)).href)
const href = computed(() => webPositionUrl(base.value, currentSlideNo.value, clicks.value))
</script>

<template>
  <a class="slidev-icon-btn pm-read-web" :href="href" :title="t.readOnWeb" :aria-label="t.readOnWeb">
    <div class="i-carbon:document" />
  </a>
</template>
