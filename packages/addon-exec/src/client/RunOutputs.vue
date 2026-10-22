<script setup lang="ts">
import { useMessages } from '@lincyaw/host'
import type { RunResult } from '@lincyaw/kernel'
import { computed, onMounted, ref } from 'vue'
import { MESSAGES } from './messages.ts'
import { displayItem } from './outputs.ts'

const props = defineProps<{ result: RunResult, hideError?: boolean }>()
const mounted = ref(false)
onMounted(() => mounted.value = true)
const t = useMessages(MESSAGES)

interface Shown {
  kind: 'stdout' | 'stderr' | 'image' | 'html'
  text?: string
  src?: string
  html?: string
}

const outputs = computed<Shown[]>(() => props.result.outputs && props.result.source !== 'recorded'
  ? props.result.outputs.map((output): Shown => {
      const item = displayItem(output, { html: mounted.value })
      switch (item.kind) {
        case 'stream': return { kind: item.name, text: item.text }
        case 'error': return { kind: 'stderr', text: item.text }
        case 'dropped-image': return { kind: 'stderr', text: t.value.droppedImage }
        case 'image': return { kind: 'image', src: item.src }
        case 'html': return { kind: 'html', html: item.html }
        case 'text': return { kind: 'stdout', text: item.text }
      }
    })
  : [{ kind: 'stdout', text: props.result.stdout }, ...props.result.stderr && !props.hideError ? [{ kind: 'stderr' as const, text: props.result.stderr }] : []])
</script>

<template>
  <template v-for="(output, index) in outputs" :key="index">
    <img v-if="output.kind === 'image'" class="pm-run-panel__image" :src="output.src" alt="">
    <div v-else-if="output.kind === 'html'" class="pm-run-panel__html" v-html="output.html" />
    <pre v-else-if="output.text && !(hideError && output.kind === 'stderr')" :class="`pm-run-panel__${output.kind}`">{{ output.text }}</pre>
  </template>
</template>

<style scoped>
pre {
  margin: 0;
  max-height: 8em;
  overflow: auto;
  font-family: var(--pm-font-mono);
  font-size: 1.1em;
  line-height: 1.6;
  white-space: pre-wrap;
}
.pm-run-panel__stderr {
  color: var(--pm-color-danger);
}
.pm-run-panel__image {
  max-width: 100%;
  max-height: 20em;
  object-fit: contain;
}
.pm-run-panel__html {
  overflow: auto;
}
</style>
