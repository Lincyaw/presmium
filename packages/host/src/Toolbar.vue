<script setup lang="ts">
// The toolbar items (the `toolbar` service); each host shows them in its toolbar.
import { onMounted, ref, shallowRef, watchEffect } from 'vue'
import { useService } from './host.ts'
import { TOOLBAR } from './types.ts'
import type { ToolbarItem } from './types.ts'

const service = useService(TOOLBAR)
const items = shallowRef<ToolbarItem[]>([])
// Items show once mounted: a server render has none, so the first render in the browser agrees with it.
const mounted = ref(false)
onMounted(() => {
  mounted.value = true
})

watchEffect((onCleanup) => {
  const registry = service.value
  if (!registry) return
  const update = () => {
    items.value = registry.list()
  }
  update()
  onCleanup(registry.subscribe(update))
})
</script>

<template>
  <span v-if="mounted && items.length" class="pm-toolbar">
    <component :is="item.component" v-for="item in items" :key="item.id" :data-toolbar-item="item.id" />
  </span>
</template>

<style scoped>
.pm-toolbar {
  display: inline-flex;
  align-items: center;
  gap: 0.75rem;
}
</style>
