<script setup lang="ts">
import { useMessages } from '@lincyaw/host'
import { GUIDE_MESSAGES } from '../domain/index.ts'

defineProps<{ title?: string, text?: string, state?: 'shown' | 'hidden' }>()

const t = useMessages(GUIDE_MESSAGES)
</script>

<template>
  <div v-if="state && (title || text)" class="pm-cue-note" :data-state="state" :style="state === 'shown' ? undefined : { visibility: 'hidden' }" :aria-hidden="state === 'shown' ? undefined : 'true'">
    <p><strong v-if="title">{{ title }}</strong>{{ title && text ? t.separator : '' }}{{ text }}</p>
  </div>
</template>
