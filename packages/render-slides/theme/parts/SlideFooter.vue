<script setup lang="ts">
import { useMessages } from '@lincyaw/host'
import { useSlideContext } from '@slidev/client'
import { computed } from 'vue'

const props = withDefaults(defineProps<{ title?: boolean }>(), { title: true })

const MESSAGES = {
  'zh-CN': { steps: (at: number, of: number) => `第 ${at} 步，共 ${of} 步` },
  'en': { steps: (at: number, of: number) => `Step ${at} of ${of}` },
}

const t = useMessages(MESSAGES)
const { $slidev, $page, $clicksContext } = useSlideContext()
const total = computed(() => $clicksContext.total)
const done = computed(() => Math.min($clicksContext.current, total.value))
const deck = computed(() => (props.title ? String($slidev.configs.title ?? '') : ''))
</script>

<template>
  <footer class="pm-book-footer">
    <span v-if="deck" class="pm-book-footer__title">{{ deck }}</span>
    <span v-if="total > 0" class="pm-book-footer__steps" role="img" :aria-label="t.steps(done, total)" :style="{ '--steps': total }">
      <span v-for="i in total" :key="i" :data-done="i <= done ? '' : undefined" />
    </span>
    <span class="pm-book-footer__page">{{ $page }} / {{ $slidev.nav.total }}</span>
  </footer>
</template>
