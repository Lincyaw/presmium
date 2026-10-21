<script setup lang="ts">
import type { RunOutput, RunResult } from '@lincyaw/kernel'
import DOMPurify from 'dompurify'
import { computed, onMounted, ref } from 'vue'
import { useMessages } from './messages.ts'

const props = defineProps<{ result: RunResult, hideError?: boolean }>()
const mounted = ref(false)
onMounted(() => mounted.value = true)
const t = useMessages()

const text = (value: unknown): string => Array.isArray(value) ? value.join('') : typeof value === 'string' ? value : JSON.stringify(value, null, 2)
const base64 = /^[A-Za-z0-9+/=]*$/

interface Output {
  kind: 'stdout' | 'stderr' | 'image' | 'html'
  text?: string
  src?: string
  html?: string
}

function display(output: RunOutput): Output {
  if (output.output_type === 'stream') return { kind: output.name, text: output.text }
  if (output.output_type === 'error') return { kind: 'stderr', text: output.traceback.join('\n') || `${output.ename}: ${output.evalue}` }
  const { data } = output
  const image = ['image/png', 'image/jpeg', 'image/gif'].find(type => data[type] !== undefined)
  if (image) {
    const value = text(data[image]).replace(/\s/g, '')
    return base64.test(value) ? { kind: 'image', src: `data:${image};base64,${value}` } : { kind: 'stderr', text: t.value.droppedImage }
  }
  if (data['image/svg+xml'] !== undefined) return { kind: 'image', src: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(text(data['image/svg+xml']))}` }
  if (data['text/html'] !== undefined && mounted.value) return { kind: 'html', html: DOMPurify.sanitize(text(data['text/html'])) }
  const value = data['text/markdown'] ?? data['text/plain'] ?? data['application/json'] ?? data['text/latex']
  return { kind: 'stdout', text: value === undefined ? '' : text(value) }
}

const outputs = computed<Output[]>(() => props.result.outputs && props.result.source !== 'recorded'
  ? props.result.outputs.map(display)
  : [{ kind: 'stdout', text: props.result.stdout }, ...props.result.stderr && !props.hideError ? [{ kind: 'stderr', text: props.result.stderr }] : []])
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
