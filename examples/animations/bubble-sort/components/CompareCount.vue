<script setup lang="ts">
import { useActions } from '@lincyaw/host'
import { ref } from 'vue'

const root = ref<HTMLElement>()
const count = ref(0)
const run = useActions(root, { compare: () => count.value++ }, { clear: () => (count.value = 0) })
</script>

<template>
  <div ref="root" class="compare-count" :data-count="count">
    比较次数：<b>{{ count }}</b>
    <button id="compare-once" type="button" class="pm-ui-button pm-ui-button--small" @click="run('compare')">比较一次</button>
  </div>
</template>

<style scoped>
.compare-count {
  display: flex;
  gap: 0.75rem;
  align-items: center;
  justify-content: center;
  font-family: var(--pm-font-sans);
}
</style>
