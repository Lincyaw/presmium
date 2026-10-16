<script setup lang="ts">
// The title and text of a spotlight or hint, in place where a reader reads the page (the web form's page
// views, `state` set): the same paragraph as the cue's static copy, so a page that loads keeps its layout.
// It keeps its place while hidden.
import { useMessages } from '@presmium/host'
import { CUE_MESSAGES } from '../domain/index.ts'

defineProps<{ title?: string, text?: string, state?: 'shown' | 'hidden' }>()

const t = useMessages(CUE_MESSAGES)
</script>

<template>
  <div v-if="state && (title || text)" class="pm-cue-note" :data-state="state" :style="state === 'shown' ? undefined : { visibility: 'hidden' }" :aria-hidden="state === 'shown' ? undefined : 'true'">
    <p><strong v-if="title">{{ title }}</strong>{{ title && text ? t.separator : '' }}{{ text }}</p>
  </div>
</template>
