<script setup lang="ts">
// Through @lincyaw/host only, as every plugin component: the text in the document's language.
import { useMessages } from '@lincyaw/host'

defineProps<{ name: string }>()

const t = useMessages({ 'zh-CN': { hello: '你好' }, 'en': { hello: 'Hello' } })
</script>

<template>
  <p class="hello-greeting">
    {{ t.hello }}, {{ name }}!
  </p>
</template>

<style scoped>
.hello-greeting {
  color: var(--pm-color-accent);
  font-family: var(--pm-font-sans);
}
</style>
